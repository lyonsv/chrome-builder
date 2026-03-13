# Technology Stack — Research

**Project:** Website Asset Capture Extension
**Dimension:** APIs, techniques, and libraries for computed style capture, cross-origin asset downloading, and structured data export in Chrome Extension MV3
**Researched:** 2026-03-13
**Overall confidence:** HIGH (core Chrome APIs are stable and well-documented; MV3 constraints are settled as of Chrome 109+)

---

## Recommended Stack

### Chrome Extension APIs (all already declared in manifest)

| API | Version/Availability | Purpose | Constraint |
|-----|---------------------|---------|------------|
| `chrome.scripting.executeScript` | MV3, Chrome 88+ | Inject computed-style extraction functions into page context | Return value size limited to ~64 MB serialised; larger payloads must be chunked via message passing |
| `chrome.scripting.executeScript` with `world: 'MAIN'` | Chrome 95+ | Access page's own JS globals (e.g. `window.dataLayer`, React internals) | Only available in MV3; was not possible in MV2 without separate injected-script workaround |
| `chrome.downloads` | MV3 | Download individual asset files to a user-chosen directory | Only callable from service worker or popup; content scripts cannot call it |
| `chrome.storage.session` | Chrome 102+ | Ephemeral session storage (survives service worker restarts, cleared on browser close) | 10 MB quota; use instead of `chrome.storage.local` for large in-flight computed-style payloads |
| `chrome.debugger` + CDP `CSS.getComputedStyleForNode` | MV3, requires `debugger` permission | Server-side computed style via Chrome DevTools Protocol — returns all resolved values without page-context overhead | High-privilege permission; causes install-warning; only use if content-script approach is insufficient |
| `chrome.tabs.captureVisibleTab` | MV3 | Screenshot for visual diff reference | Already used; no change needed |
| `chrome.webRequest` | MV3 | Already used for network capture | Read-only in MV3; cannot modify requests |

### getComputedStyle Extraction

**Recommended technique: Chunked content-script extraction via `chrome.scripting.executeScript`**

The content script already runs in the page context and has access to `window.getComputedStyle`. The correct approach for the new computed-styles feature is to extend `content.js` rather than introduce CDP/debugger overhead.

**Why this over CDP `CSS.getComputedStyleForNode`:**
- CDP requires `debugger` permission, which already triggers Chrome's most alarming install warning ("Read and change all your data"). Extending its use for a use case that can be solved in content-script context is not justified.
- Content-script `getComputedStyle` runs synchronously in the page's layout context and returns browser-resolved values including inherited values, media-query overrides, and custom property resolutions — identical to what CDP returns.
- CDP adds round-trip latency per element (IPC to browser process and back). For hundreds of elements, content-script batching is faster.

**Deduplication strategy — fingerprint-then-sample:**

Naive full-page `getComputedStyle` on every element is prohibitive. A page with 2,000 elements × 300+ CSS properties = 600,000+ values before serialisation. The correct approach is a two-pass algorithm:

1. **Pass 1 — structural fingerprint:** For every element, compute a short fingerprint of its structural identity: `tagName + classList.sorted().join('.') + computedFontSize + computedColor`. Group elements by fingerprint. This is fast (no full `getComputedStyle` needed) and handles same-class sibling collapse.
2. **Pass 2 — style sampling:** For each unique fingerprint group, take one representative element and call `getComputedStyle` on it. Extract only the properties relevant to LLM-readable design system reconstruction (see property whitelist below).
3. **Output:** A map of `{ fingerprint → { tagName, classList, sampleSelector, styles } }` rather than per-element data.

**Property whitelist (HIGH signal for design system reconstruction):**

Extract these ~60 properties, not all 300+. Skip layout-specific values (transforms, animation states) that are meaningless without execution context.

```
Typography: font-family, font-size, font-weight, font-style, line-height,
            letter-spacing, text-decoration, text-transform, color,
            -webkit-font-smoothing

Spacing: margin (top/right/bottom/left), padding (top/right/bottom/left),
         gap, row-gap, column-gap

Box: width, height, min-width, max-width, border-radius,
     border (top/right/bottom/left shorthand), box-shadow,
     background-color, background-image, opacity, display,
     flex-direction, align-items, justify-content, flex-wrap,
     grid-template-columns, grid-template-rows

Interactivity: cursor, pointer-events, user-select, outline

Position: position, z-index, overflow-x, overflow-y
```

**Interaction state styles (`:hover`, `:focus`, `:active`, `:disabled`):**

`getComputedStyle` only returns the current default state. To capture interaction states, iterate `document.styleSheets` and extract rules where the selector includes a pseudo-class. This is already partially done in `extractFonts()` (the `cssRules` iteration pattern exists). The same pattern extends to:

```javascript
// In content script, iterating CSSStyleSheet.cssRules
if (rule.type === CSSRule.STYLE_RULE && rule.selectorText.match(/:hover|:focus|:active|:disabled/)) {
  // Extract rule.style properties
}
```

Cross-origin stylesheets throw `SecurityError` on `.cssRules` access (this is already handled with try/catch in `extractFonts()`). There is no workaround for cross-origin sheet rule inspection from content script context — it is a browser security boundary. The correct fallback is to note the stylesheet URL and download it as an asset so rules can be parsed offline.

### Cross-Origin Asset Downloading

**Problem:** Content scripts cannot call `chrome.downloads`. The background service worker can, but cannot access the page DOM. Assets are cross-origin, so a naive `fetch()` in the content script will succeed for same-origin or CORS-permissive CDNs and fail silently for CORS-restrictive ones.

**Recommended technique: Service worker fetch proxy**

The background service worker has `<all_urls>` host permissions declared in `manifest.json`. In MV3, host permissions in the manifest grant the service worker the ability to make cross-origin `fetch()` calls to those origins **without** triggering CORS preflight rejection — because the browser treats the extension as a trusted origin for its declared host patterns. This is the key MV3 capability that makes the service worker the correct download proxy.

**Flow:**
1. Content script collects asset URLs and sends them to the background via `chrome.runtime.sendMessage`.
2. Background service worker calls `fetch(url)` — this succeeds for the vast majority of CDN-hosted assets because the extension's `<all_urls>` host permission bypasses CORS checks for extension fetch calls.
3. Background converts response to a `Blob`, then `URL.createObjectURL(blob)` (available in service workers as of Chrome 132+, as noted in CONCERNS.md).
4. Background calls `chrome.downloads.download({ url: objectUrl, filename: 'assets/images/name.ext' })` to save to the structured output directory.
5. After download completes, `URL.revokeObjectURL(objectUrl)`.

**Important CORS/CSP caveats:**

| Scenario | Works? | Notes |
|----------|--------|-------|
| CDN-hosted image/font (Cloudfront, Akamai, Fastly) | YES | Extension host permission bypasses CORS for extension-initiated fetch |
| Same-origin asset | YES | No CORS involved |
| Asset on domain with `Content-Security-Policy: frame-ancestors` | YES | CSP `frame-ancestors` does not affect fetch |
| Asset with `Access-Control-Allow-Origin: [specific domain]` | YES | Extension fetch bypasses CORS, response is still accessible |
| Service worker intercepting fetch on target page | MAYBE | If the target page's service worker intercepts and rejects cross-origin fetch, the extension cannot override it |
| Assets that require session cookies (auth-gated images) | YES | The `fetch()` in the content script runs in the page's cookie context; routed to background, it runs WITHOUT page cookies. Auth-gated assets must be fetched from content script, not background |

**Auth-gated assets special case:**

For assets requiring the page's session (logged-in images, account-specific fonts), the fetch must happen in the content script — which does have access to page cookies via the browser's automatic cookie-on-request behavior. The content script fetches to ArrayBuffer, sends the binary data as a transferable object via `chrome.runtime.sendMessage` to background, which saves via `chrome.downloads`.

However, `chrome.runtime.sendMessage` has a practical message size limit (structured-clone limit, ~64 MB, but real-world IPC costs make >5 MB messages slow). For large assets, the content script should write to the page's `IndexedDB` and send only a reference key; the background then reads IndexedDB via `chrome.scripting.executeScript` to retrieve and save the data.

**What NOT to use:**

- Do NOT use `data:` URLs for binary asset downloads (the existing pattern in `downloadAnalysisPackage`). `encodeURIComponent` of binary data is extremely slow and produces URLs 3× the original size. For assets over ~100 KB this approach is impractical.
- Do NOT use `chrome.webRequest` to intercept and capture asset responses. In MV3 `webRequest` is read-only and response bodies are not accessible via this API.
- Do NOT attempt to use `chrome.debugger` CDP `Network.getResponseBody` as a substitute — it works but requires the debugger to have been attached before the request fired, and it only captures requests made after debugger attachment. It cannot retroactively retrieve assets.

### Structured Directory Output

**Recommended technique: Sequential `chrome.downloads.download` calls with path prefixes**

`chrome.downloads.download` accepts a `filename` parameter that includes subdirectory path segments (e.g., `assets/images/logo.png`). Chrome creates the directories automatically under the user's Downloads folder (or the user-selected location if `saveAs: true` is used on the first call).

**Directory structure:**
```
[domain]-[timestamp]/
  index.json                  # manifest: file list, metadata, phase summary
  html/
    page.html                 # full DOM snapshot
  css/
    [hash].css                # one file per stylesheet (inline or fetched)
  computed-styles/
    styles.json               # fingerprinted style map (deduped)
    interaction-states.json   # hover/focus/active/disabled rule extracts
  assets/
    images/
      [filename]              # binary asset files
    fonts/
      [filename]
    icons/
      [filename]
  network/
    requests.json             # all captured network requests
    graphql.json              # extracted GraphQL operations
  tracking/
    dataLayer.json            # GTM dataLayer push history
    gtm-config.json           # GTM container config if accessible
    events.json               # derived event schema
  components/
    hierarchy.json            # annotated DOM tree with component boundaries
    component-map.json        # component-name → selector → style fingerprint
```

**`saveAs` behaviour:** Calling `chrome.downloads.download({ saveAs: true })` prompts the user once. Subsequent calls in the same session do NOT re-prompt if `conflictAction: 'overwrite'` is set and the path is under the same directory. The correct UX is: prompt once for the root directory on the first file, then write all subsequent files non-interactively.

**Limitation:** Chrome does not expose a directory-picker via `chrome.downloads`. The user's download destination is always a flat folder within their Downloads directory (or wherever they chose to save the first file). There is no way to guarantee the structured paths land in a user-specified location via `chrome.downloads` alone. The `window.showDirectoryPicker()` File System Access API is an alternative, but it requires a user gesture in a document context (popup or content script) and cannot be called from the service worker. If a custom save location is desired, the popup must call `window.showDirectoryPicker()`, receive a `FileSystemDirectoryHandle`, pass it to the content script via postMessage (it is not transferable to the background), and write files from the popup context. This is significantly more complex; use `chrome.downloads` with structured paths as the V1 approach.

**What NOT to use:**

- Do NOT generate a ZIP file and download it as a single blob. ZIPs require either a native streaming encoder (not available in service workers without a library) or an in-memory approach that hits the same size limits as the current single-JSON approach. The directory structure approach via sequential `chrome.downloads` calls is simpler and produces more useful output for LLM consumption.
- Do NOT use `chrome.storage.local` to buffer the full computed-styles payload. The quota is 10 MB (unlimited with `unlimitedStorage` permission, but requesting that permission adds friction). Use `chrome.storage.session` (10 MB quota, ephemeral) for in-flight state or pass payloads directly via message.

### Tracking Plan Extraction

**`dataLayer` capture:**

`window.dataLayer` is a standard Google Tag Manager array of push events accumulated since page load. In content script context: `Array.from(window.dataLayer || [])` gives the full push history synchronously.

For ongoing capture (pushes that happen after analysis starts): proxy the `push` method by replacing `window.dataLayer.push` with a wrapper that records each call before delegating to the original. This requires `world: 'MAIN'` in `executeScript` or the existing content-script injection pattern, since the proxy must run in the page's JS context, not the isolated extension context.

**GTM container config:**

GTM injects a container config JSON into the page as `window.google_tag_manager['GTM-XXXX']`. This is accessible from the content script as `window.google_tag_manager`. The config includes all defined tags, triggers, and variables — effectively the full tracking plan.

**GA4 / analytics event schema:**

The `window.gtag` function can be wrapped (same proxy technique) to capture all `gtag('event', ...)` calls. Combined with the `dataLayer` history, this gives a complete event schema.

**CDP alternative (not recommended):** The Chrome Debugger Protocol `Runtime.addBinding` + `Runtime.onBindingCalled` can intercept function calls at the JS engine level, but this requires the `debugger` permission and adds complexity without benefit over the simpler content-script proxy approach.

### Component Hierarchy Mapping

**Recommended technique: DOM tree annotation in content script**

Walk the DOM tree with `document.createTreeWalker` (faster than `querySelectorAll('*')` for sequential traversal). For each element, record:
- `tagName`, `id`, `classList` as component identity signals
- A heuristic "is component boundary" flag based on: presence of a `data-component`, `data-testid`, React `__reactFiber` or `__reactProps` property on the element, Angular `ng-version`, Vue `__vue__`, or a class name matching a PascalCase pattern
- The element's depth in the DOM and its children count
- Reference to the computed-style fingerprint key for this element's class profile

React component names are accessible from the content script via `element.__reactFiber?.type?.displayName || element.__reactFiber?.type?.name`. This requires running in the page's JS context (`world: 'MAIN'` or via `executeScript` without `world` on a non-CSP-blocked page).

**What NOT to use:**

- Do NOT use `MutationObserver` for component hierarchy — it's for observing DOM changes, not for snapshot-time structural mapping.
- Do NOT use `chrome.devtools.inspectedWindow.eval` for this purpose (it is fragile, as documented in CONCERNS.md).

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Computed style capture | Content script `getComputedStyle` + fingerprint dedup | CDP `CSS.getComputedStyleForNode` | CDP requires `debugger` permission already causing install warnings; content script approach is equivalent in output and simpler |
| Asset download | Background service worker `fetch` → `chrome.downloads` | Content script fetch → base64 → data URL | Data URL approach is already documented as a scaling problem for binary assets in CONCERNS.md; service worker fetch with objectURL is the correct MV3 pattern |
| Directory output | Sequential `chrome.downloads` with path prefixes | `window.showDirectoryPicker()` File System Access API | File System Access requires popup context, not callable from service worker; `chrome.downloads` is simpler for V1 |
| Directory output | Sequential `chrome.downloads` with path prefixes | In-memory ZIP via fflate/JSZip | Requires adding a library (violates no-build-system constraint) and hits same memory limits as current single-JSON approach |
| Tracking plan | Content-script `dataLayer` read + push proxy | CDP `Runtime.addBinding` | Content-script approach requires no additional permissions and is simpler |
| Session storage | `chrome.storage.session` for large in-flight state | `chrome.storage.local` | `storage.local` default quota is 10 MB; for large computed-style payloads, `storage.session` is the right ephemeral store |
| Blob URL for downloads | `URL.createObjectURL(blob)` in service worker (Chrome 132+) | `data:` URL with `encodeURIComponent` | `encodeURIComponent` is prohibitively slow and memory-intensive for binary; blob URL is correct but requires Chrome 132+ (released November 2024, safe to target by 2026) |

---

## Installation

No installation needed. This project has no build system and no dependencies. All techniques described above use:
- Native browser APIs available in any Chrome 132+ context
- Chrome Extension APIs already declared in `manifest.json`

The `debugger` permission is already declared but should NOT be extended for the new features — computed-style and component-hierarchy work can be done without it.

---

## Key MV3 Constraints to Keep in Mind

### Service Worker Lifecycle

MV3 service workers are terminated after ~30 seconds of inactivity and after any single event handler completes. Long-running operations (iterating hundreds of asset URLs to download) must be structured as:
- An array of work items stored in `chrome.storage.session`
- A `chrome.alarms` or recursive `setTimeout` loop to process items in batches
- Or a keep-alive ping from the popup while the download is in progress (the popup keepng a message channel open keeps the service worker alive)

The existing `background.js` pattern (service worker processes one action per `handleMessage` call) is correct but will time out if `downloadAnalysisPackage` takes more than ~30 seconds. For sequential multi-file downloads this is a real risk; use a queue-based approach for the asset download phase.

### Message Size Limits

Structured clone via `chrome.runtime.sendMessage` is limited to ~64 MB nominally, but in practice messages over ~5 MB cause noticeable latency and messages over ~20 MB can cause the service worker to be terminated. For computed-style payloads:
- Deduplication is essential (see fingerprint approach above)
- If even the deduped payload is large, chunk it: send styles in batches of N elements per message

### `URL.createObjectURL` in Service Worker

Available since Chrome 132 (November 2024). If compatibility with Chrome 109-131 is required, fall back to the data URL approach for small files (<100 KB). For binary assets >100 KB on older Chrome, there is no clean alternative — the team should document Chrome 132+ as the minimum version requirement.

### Cross-Origin Stylesheet `cssRules` Access

`document.styleSheets` exposes `CSSStyleSheet.cssRules` only for same-origin stylesheets. Cross-origin stylesheets throw a `SecurityError`. The workaround is: download the stylesheet as text via the background service worker fetch proxy (which has host permissions), then parse it with a CSS parser or simple regex in the content script. The existing `fetchAssetContent` method in `content.js` does this for CSS already — the parsed text can be used as a substitute for direct `cssRules` iteration.

---

## Sources

- Chrome Extension documentation (developer.chrome.com/docs/extensions) — HIGH confidence; APIs described are stable MV3 APIs
- Chrome 132 release notes re: `URL.createObjectURL` in service workers — MEDIUM confidence (knowledge cutoff August 2025; Chrome 132 released November 2024)
- Codebase direct inspection (`content.js`, `background.js`, `manifest.json`, `CONCERNS.md`) — HIGH confidence; constraints documented in CONCERNS.md are directly observable in code
- MV3 service worker lifetime behavior — HIGH confidence; well-documented Chrome limitation in effect since MV3 launch (Chrome 109, January 2023)
- MV3 host permission bypass of CORS for extension-initiated fetch — HIGH confidence; this is the documented behavior of `host_permissions` in MV3 (Chrome Extension docs, "Cross-origin XMLHttpRequest" section)
