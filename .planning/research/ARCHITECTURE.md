# Architecture Patterns

**Domain:** Chrome Extension MV3 — Website Asset Capture with LLM-ready structured output
**Researched:** 2026-03-13
**Confidence:** HIGH (derived from live codebase analysis + authoritative MV3 API constraints)

---

## Recommended Architecture

The existing four-context architecture is sound and does not require restructuring. The new capabilities map cleanly onto it. The pattern is: **content script extracts, background assembles and fetches, popup orchestrates, background downloads.**

```
┌─────────────────────────────────────────────────────────────┐
│  TARGET PAGE CONTEXT                                        │
│  content.js (WebsiteAnalyzer)                               │
│  ├── getComputedStyle per element (NEW)                     │
│  ├── :hover/:focus rules from stylesheet (NEW)              │
│  ├── dataLayer / GTM push history (NEW)                     │
│  ├── component boundary annotation (NEW)                    │
│  └── existing: HTML, CSS, JS, images, fonts, frameworks     │
└────────────────────┬────────────────────────────────────────┘
                     │ chrome.tabs.sendMessage (structured result)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  POPUP CONTEXT                                              │
│  popup.js (PopupController)                                 │
│  ├── orchestrates analysis steps (existing)                 │
│  ├── triggers content script (existing)                     │
│  ├── sends ASSEMBLE_PACKAGE to background (NEW)             │
│  └── triggers DOWNLOAD_DIRECTORY to background (NEW)        │
└────────────────────┬────────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVICE WORKER (BACKGROUND) CONTEXT                        │
│  background.js (MigrationAnalyzer)                          │
│  ├── network capture via webRequest (existing)              │
│  ├── debugger/CDP attachment (existing)                     │
│  ├── asset fetching: fetch() cross-origin (NEW)             │
│  ├── directory assembly: builds logical file tree (NEW)     │
│  └── chrome.downloads.download per file (NEW)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### Which Context Owns Each New Capability

| Capability | Owning Context | Rationale |
|---|---|---|
| `getComputedStyle` extraction | **Content script** | Requires live DOM in page context; no other context has access to rendered styles |
| Interaction state styles (`:hover`, `:focus`) | **Content script** | `document.styleSheets` only accessible in page context |
| `dataLayer` / GTM push capture | **Content script** | `window.dataLayer` is a page-global variable; only content script can read it |
| Component boundary annotation | **Content script** | DOM traversal requires page context |
| Cross-origin asset fetching | **Background service worker** | Content scripts are subject to page CSP and CORS; background has `<all_urls>` host permission and is exempt from page CSP |
| Directory assembly (file tree logic) | **Background service worker** | Owns all collected data; is the only context that persists across popup lifecycle |
| `chrome.downloads.download` calls | **Background service worker** | `chrome.downloads` is not available to content scripts; popup can call it but background is the correct owner for multi-file orchestration |
| Progress feedback during directory download | **Popup** | UI feedback; relays progress messages received from background |

### Component Responsibility Table

| Component | Existing Responsibilities | New Responsibilities |
|---|---|---|
| `content.js` (WebsiteAnalyzer) | HTML, CSS/JS URLs, images, fonts, frameworks, performance | Computed styles, interaction-state CSS rules, dataLayer capture, component hierarchy annotation |
| `popup.js` (PopupController) | Orchestrate steps, UI, options, download trigger | Add computed style option toggle; trigger directory download; display progress per-file |
| `background.js` (MigrationAnalyzer) | Network capture, state, single JSON download | Asset fetching, directory package assembly, multi-file download sequencing |
| `local-analyzer.js` (LocalHTMLAnalyzer) | CSP-bypass HTML fetch fallback | No new responsibilities — fallback path does not support computed styles |
| `devtools-panel.js` (DevToolsPanel) | Network display, export | Optionally surface tracking/dataLayer capture in a new tab (lower priority) |

---

## Data Flow

### Computed Styles Extraction Flow

The highest-complexity new flow. Computed styles for a full page DOM can be several megabytes.

```
1. content.js: querySelectorAll('*') → enumerate all elements
2. content.js: deduplication pass
   - Key = tagName + sorted className list
   - First element per key is the "representative"; siblings skipped
3. content.js: getComputedStyle(representativeElement)
   - Capture only properties that differ from browser default (delta extraction)
   - OR capture full set for typography/layout properties only (property allowlist)
4. content.js: returns { computedStyles: Map<selectorKey, styleObject> }
   as part of analyzeWebsite() return value
5. popup.js: receives result via chrome.tabs.sendMessage response
6. popup.js: sends STORE_ANALYSIS with computedStyles to background
7. background.js: holds computedStyles in analysisData Map (in-memory)
8. On DOWNLOAD_DIRECTORY: background includes computedStyles as
   computed-styles/index.json (or sharded by component)
```

**Key constraint:** `chrome.tabs.sendMessage` has a practical limit of ~64MB for the serialised response. Computed styles for a full DOM with deduplication should stay well under this with a property allowlist, but the deduplication step in the content script is load-bearing — it must run before the data crosses the message boundary.

### Asset Download Flow (Cross-Origin)

```
1. content.js: collects asset URLs (images, fonts, CSS) — existing
2. popup.js: sends FETCH_ASSETS to background with URL list
3. background.js: for each URL:
   a. fetch(url, { mode: 'cors' }) — background context, exempt from page CSP
   b. On CORS failure: fetch without credentials, or note as "URL only, not downloaded"
   c. Convert response to base64 or ArrayBuffer
4. background.js: stores fetched assets in memory keyed by URL hash
5. On DOWNLOAD_DIRECTORY: each asset written as a separate file under /assets/
   using chrome.downloads.download with a data: URL or blob: URL
```

**Key constraint:** Service workers cannot use `URL.createObjectURL` (no Blob URL support in service worker context in MV3). Downloaded binary files must be encoded as data URIs: `data:[mime];base64,[data]`. Large assets (multi-MB images) will produce very large data URI strings. Mitigation: cap per-asset size at a configurable limit (e.g. 2MB) and fall back to URL-only reference for oversized assets.

### Tracking / dataLayer Extraction Flow

```
1. content.js: at analysis time, read window.dataLayer (array of push events)
2. content.js: read window.google_tag_manager (GTM container config if present)
3. content.js: walk dataLayer entries, normalise to { event, parameters } shape
4. Returns as { tracking: { dataLayer, gtmContainers, eventSchema } }
5. Flows through existing message path to background analysisData
6. On DOWNLOAD_DIRECTORY: written to /tracking/index.json
```

This flow is synchronous and low data volume. No architectural novelty; extends existing content script return shape.

### Directory Assembly and Download Flow

This replaces the current single `chrome.downloads.download` call with a sequential multi-file sequence.

```
1. popup.js: user clicks "Download Package" (or new "Download Directory")
2. popup.js: sends DOWNLOAD_DIRECTORY to background with { tabId }
3. background.js: assembles logical file tree from in-memory analysisData:

   site-capture-[domain]-[timestamp]/
   ├── index.json              (manifest: URLs, counts, metadata)
   ├── html/
   │   └── page.html
   ├── css/
   │   ├── inline-0.css
   │   └── [hashed-external].css  (if fetched)
   ├── computed-styles/
   │   └── index.json          (deduplicated computed style map)
   ├── assets/
   │   ├── images/
   │   └── fonts/
   ├── network/
   │   └── requests.json
   └── tracking/
       └── index.json

4. background.js: for each file, call chrome.downloads.download({
     url: dataUrl,
     filename: `site-capture-.../path/to/file`,
     saveAs: false          // all files land in same directory automatically
   })
5. background.js: sends progress messages to popup as each file completes
6. popup.js: updates progress bar per message
```

**Key constraint:** Chrome's downloads API does not provide a ZIP API. Each file is a separate `chrome.downloads.download` call. The browser will create the directory structure from the `filename` path automatically when `saveAs: false`. The user sees a flat series of file saves — this is expected behaviour.

**Alternative considered:** Assemble everything as a single ZIP in the service worker using a hand-rolled or inlined ZIP encoder (no build system → no npm packages). This avoids multi-file download UX but adds ~8KB of inlined code. Decision is deferred to the roadmap; the directory-of-separate-downloads approach is the zero-dependency path.

---

## Patterns to Follow

### Pattern 1: Deduplication Before Message Boundary

**What:** Run all size-reducing transformations (dedup, property filtering) in the content script, before the result crosses the `sendMessage` boundary to the popup.
**When:** Any extraction that could produce O(DOM size) data — computed styles, component hierarchy.
**Why:** Chrome's IPC serialisation cost is proportional to payload size. Deduplicate in-page where the data is cheap to manipulate; send only the reduced result.

```javascript
// content.js — representative-element deduplication
const seen = new Map(); // selectorKey → computedStyle
document.querySelectorAll('*').forEach(el => {
  const key = el.tagName + '.' + [...el.classList].sort().join('.');
  if (!seen.has(key)) {
    seen.set(key, extractRelevantStyles(el));
  }
});
return Object.fromEntries(seen);
```

### Pattern 2: Background as Asset Proxy

**What:** All cross-origin fetches route through the background service worker.
**When:** Any asset (image, font, CSS) that the content script cannot fetch due to page CSP or CORS.
**Why:** Background has `<all_urls>` host permission and is not subject to the page's CSP. Content scripts running in the page context inherit the page's CSP for `fetch()`.

```javascript
// background.js — asset fetch handler
case 'FETCH_ASSET': {
  const { url } = data;
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const dataUrl = `data:${response.headers.get('content-type')};base64,${base64}`;
    sendResponse({ success: true, dataUrl });
  } catch (err) {
    sendResponse({ success: false, urlOnly: url, error: err.message });
  }
  break;
}
```

### Pattern 3: Additive Extension of analyzeWebsite() Return Shape

**What:** New content script capabilities add new top-level keys to the object returned by `analyzeWebsite()`, rather than modifying existing keys.
**When:** Adding computed styles, tracking data, component hierarchy.
**Why:** Existing callers (popup, DevTools panel) destructure known keys; new keys are invisible to them without any breaking change. Opt-in via options flags passed into the content script.

```javascript
// content.js — return shape extension
return {
  // ... existing keys unchanged ...
  computedStyles: options.captureComputedStyles ? this.extractComputedStyles() : null,
  tracking:       options.captureTracking       ? this.extractTracking()       : null,
  componentTree:  options.captureComponents     ? this.extractComponentTree()  : null,
};
```

### Pattern 4: Options-Gated Heavy Extraction

**What:** Expensive operations (computed styles, asset downloading) are gated behind explicit user options, defaulting to off.
**When:** Any extraction that adds significant time or output size to the analysis.
**Why:** Maintains the fast "quick scan" path for users who only need URL discovery; heavy extraction is opt-in.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sending Raw Computed Styles Across the Message Boundary

**What:** Calling `getComputedStyle` on every element and immediately including all 300+ CSS properties in the sendMessage response.
**Why bad:** A page with 2000 elements × 300 properties × ~20 bytes per value = ~120MB, which will crash the IPC channel or cause a timeout. Chrome's practical limit on sendMessage is around 64MB for the serialised JSON.
**Instead:** Apply deduplication and a property allowlist (typography, spacing, color, border, shadow) in the content script. Target <5MB after dedup on a typical page.

### Anti-Pattern 2: Calling chrome.downloads from the Content Script

**What:** Attempting to use `chrome.downloads.download` directly in `content.js`.
**Why bad:** `chrome.downloads` is not available in content script context. The call will throw `TypeError: Cannot read properties of undefined`.
**Instead:** Send a message to the background with the data to be downloaded; background calls `chrome.downloads.download`.

### Anti-Pattern 3: Blob URLs in the Service Worker

**What:** Using `URL.createObjectURL(blob)` in `background.js` to create a download URL.
**Why bad:** MV3 service workers do not have access to `URL.createObjectURL`. It throws `ReferenceError: URL is not defined` or returns undefined.
**Instead:** Encode binary content as a `data:` URI. For large files, stay within reasonable limits (~50MB data URI is supported by Chrome's downloads API).

### Anti-Pattern 4: Persisting Full Analysis to chrome.storage.local

**What:** Storing the full computed styles or fetched asset data in `chrome.storage.local`.
**Why bad:** `chrome.storage.local` has a 10MB quota by default (unlimited with `unlimitedStorage` permission, but that is not declared in the manifest and should not be added lightly). The existing code already works around this by storing only summaries.
**Instead:** Keep large payloads in service worker in-memory Maps. Persist only the manifest/index. The user downloads the data immediately; it does not need to survive a browser restart.

### Anti-Pattern 5: Hardcoding Site-Specific Selectors for Component Detection

**What:** Writing `if (url.includes('gettyimages'))` or similar in component hierarchy logic.
**Why bad:** The project constraint explicitly requires all detection logic to be generic/pattern-based and the repo is public. Site names in code are a direct violation.
**Instead:** Express component boundaries as observable structural patterns: elements with `data-component`, `data-testid`, role attributes, React fiber `__reactFiber` keys, or repeated sibling structures with identical class patterns.

---

## Scalability Considerations

| Concern | Current state | With new capabilities | Mitigation |
|---|---|---|---|
| Message payload size | Small (URL lists) | Large (computed styles ~2-10MB with dedup) | Dedup + property allowlist in content script before send |
| Service worker memory | Small (network request arrays) | Medium-large (fetched asset binary data) | Cap per-asset size at 2MB; clear asset cache after download |
| Download file count | 1 (single JSON) | 20-100+ files (directory) | Sequential chrome.downloads calls with progress reporting; no parallelism needed |
| chrome.storage quota | Already hitting limits (existing workaround) | No change — large data never stored | Keep existing pattern: storage for summaries only |
| Content script execution time | Fast (<1s) | Slower with computed styles (2-10s for full DOM) | Options gate; yield to event loop between batches of elements |

---

## Build Order Implications

The following dependency ordering applies to implementation phases:

1. **Computed styles extraction** — This is the highest-value capability and is self-contained in `content.js`. No other new capability depends on it. Build first.

2. **Tracking extraction (dataLayer / GTM)** — Also self-contained in `content.js`. No dependencies. Can be built in the same phase as computed styles.

3. **Component hierarchy annotation** — Depends on the same DOM traversal infrastructure used by computed styles. Build after computed styles so the traversal loop can be shared.

4. **Directory output format** — Depends on having all content (computed styles, tracking) available before assembly. The background assembly logic and multi-file download replace the existing `downloadAnalysisPackage`. Build after content script capabilities are stable.

5. **Asset downloading** — Depends on the background fetch-proxy pattern and the directory output structure (assets land in `/assets/`). Build in the same phase as directory output.

6. **Agnostic detection audit** — A cross-cutting refactor (remove any hardcoded site patterns, express all detection as generic). Should happen as a final pass before any public release, not gated on feature work.

---

## Sources

- Live codebase: `/Users/vincent.lyons/git/chrome-builder/background.js`, `content.js`, `popup.js`, `manifest.json` — HIGH confidence
- Chrome Extension MV3 messaging constraints (training knowledge, August 2025 cutoff): `chrome.tabs.sendMessage` serialises to V8-internal structured clone; practical limit ~64MB — MEDIUM confidence (verify against current Chrome release notes if behaviour changes)
- `chrome.downloads` API — content scripts cannot access it; this is a long-standing MV3 constraint — HIGH confidence
- `URL.createObjectURL` unavailability in MV3 service workers — known MV3 service worker restriction; data URIs are the documented workaround — HIGH confidence
- `chrome.storage.local` 10MB default quota — documented in Chrome Extensions API reference — HIGH confidence
