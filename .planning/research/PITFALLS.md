# Domain Pitfalls

**Domain:** Chrome Extension MV3 — computed style extraction, cross-origin asset downloading, large structured output
**Researched:** 2026-03-13
**Confidence note:** External web access was unavailable during research. All findings are drawn from training data (Chrome Extension documentation, MDN, community reports). Confidence levels reflect that constraint. Core MV3 API behavior is HIGH confidence; nuanced edge cases are MEDIUM.

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or silently incorrect output.

---

### Pitfall 1: Service Worker Goes Dormant Mid-Analysis and Loses All In-Memory State

**What goes wrong:** MV3 service workers are terminated by Chrome after ~30 seconds of inactivity (no open ports, no pending callbacks). The current architecture stores all runtime state — `networkRequests`, `analysisData`, `activeAnalysisTabs` — in in-memory Maps. If the service worker is killed between the "start analysis" message and the "download package" message (a very achievable gap when getComputedStyle extraction on large DOMs takes 5–30+ seconds), the Maps are gone. `GET_NETWORK_DATA` returns nothing, `DOWNLOAD_PACKAGE` fails silently or crashes, and the user has no indication why.

**Why it happens:** Adding computed style extraction and asset downloading dramatically lengthens the analysis window. The existing architecture was built for fast single-pass analysis; long-running operations expose the dormancy window.

**Consequences:** Silent data loss. The popup may report success but the downloaded package is empty or partial. The user has no way to distinguish a successful download from a mid-dormancy failure.

**Warning signs:**
- Analysis logs show "START_ANALYSIS received" in service worker but no corresponding "DOWNLOAD_PACKAGE received"
- Background message handlers return `{ success: false }` with no error message (handler itself was killed)
- `chrome.storage.local` quota errors were already being swallowed (per existing ARCHITECTURE.md) — this masks the symptom

**Prevention:**
- Keep the message port open for the entire analysis session using a `chrome.runtime.connect` long-lived port instead of `sendMessage` one-shots. A long-lived port keeps the service worker alive.
- Alternatively, flush critical analysis state to `chrome.storage.local` (or `chrome.storage.session` — available in MV3, faster, survives dormancy but not browser restart) at each major step completion, not just at summary time.
- Implement an explicit "analysis session" keepalive: send a heartbeat message from the popup every 20 seconds during long operations to prevent dormancy.

**Phase:** Address before implementing getComputedStyle extraction — the first new feature that makes analysis long-running.

---

### Pitfall 2: getComputedStyle Blocks the Page's Main Thread and Triggers Forced Reflow on Every Element

**What goes wrong:** `window.getComputedStyle(element)` is a synchronous call that forces the browser to flush all pending style recalculations for the queried element. Called in a tight loop over all DOM elements (even 300–500 on a minimal page; 2,000–5,000+ on a media-heavy homepage), this serialises reflow work that the browser would otherwise batch. The page freezes, the extension appears to hang, and on complex pages the content script can be killed by Chrome's script timeout (~5 seconds for injected scripts on some pages).

**Why it happens:** The natural implementation is `document.querySelectorAll('*').forEach(el => getComputedStyle(el))` — straightforward but pathologically slow because it prevents any style batching.

**Consequences:** Content script timeout (the `executeScript` promise never resolves or rejects cleanly). Popup shows spinner indefinitely. On pages with CSS animations or transitions, values captured mid-animation are non-deterministic.

**Warning signs:**
- Content script `ANALYZE_WEBSITE` message never returns a response
- DevTools Performance panel shows a single long "Recalculate Style" task consuming seconds
- Page becomes visually unresponsive during analysis

**Prevention:**
- Never call `getComputedStyle` inside a synchronous `forEach` over all elements. Chunk the work with `setTimeout(chunk, 0)` or `requestIdleCallback` to yield between batches of ~50 elements.
- Better: collect elements first, then run style extraction in a generator that yields periodically, streaming partial results back via multiple `sendMessage` calls rather than waiting for one giant response.
- Apply deduplication **before** calling `getComputedStyle` — group elements by tag+class signature and only call `getComputedStyle` once per unique signature. This is already in the project plan and is the single highest-leverage optimisation.
- Only extract the CSS properties the project actually needs (the ~40–60 properties relevant to design system reconstruction: typography, spacing, color, layout mode, borders, shadows) rather than all 300+ computed properties. `getComputedStyle` returns all of them; destructure only what's needed.

**Phase:** Core design concern for the computed-styles feature. Must be solved in initial implementation, not as a follow-up optimisation.

---

### Pitfall 3: chrome.downloads Saves Flat Files, Not Directories

**What goes wrong:** `chrome.downloads.download({ url, filename })` can create subdirectory paths using forward slashes in the `filename` option (e.g., `assets/images/logo.png`). This works and is the intended mechanism for structured output. However, it has a hard constraint: **each call is a separate user-visible download item**. For a structured directory output with potentially 50–200 asset files, this means 50–200 separate download entries in the Chrome Downloads shelf, each triggerable by the user's download location preference, each potentially triggering an OS "where to save?" dialog if the user has "Ask where to save" enabled.

**Why it happens:** `chrome.downloads` is designed for downloading individual files, not directory trees. There is no `chrome.downloads.downloadDirectory()` or zip-and-save API in MV3.

**Consequences:** Users with "Ask where to save" enabled get a dialog per asset file — catastrophic UX. Users with a default download folder get 50–200 items in their Downloads folder under inconsistent paths if any filenames collide. The Download shelf flickers with dozens of items.

**Warning signs:**
- Testing with "Ask where to save" enabled in Chrome settings causes per-file prompts
- Download items have unpredictable paths when filenames contain special characters or when two assets have the same basename but different source paths

**Prevention:**
- The correct architecture for structured directory output is: assemble the entire directory tree in memory as a `{ path: content }` map, zip it in the service worker using a pure-JS zip library (JSZip or fflate — no build system required, single file include), then call `chrome.downloads.download` exactly **once** with a `.zip` URL. The user gets one download, one file, one OS dialog.
- Alternatively, write all structured data as one JSON file per subdirectory category (already the plan: `index.json`, `computed-styles.json`, etc.) and download each category file separately — manageable at 5–10 downloads, not 200.
- If flat-file asset downloading is required (actual binary image/font files), zip is non-negotiable.

**Phase:** Must be decided at the structured output architecture phase before any asset download implementation.

---

### Pitfall 4: Cross-Origin Asset Fetching Silently Fails or Returns Wrong Content

**What goes wrong:** When the content script calls `fetch(assetUrl)` for a cross-origin image or font, the request goes out with the page's origin. Many CDNs and image hosts set `Access-Control-Allow-Origin` only for specific referrers, or serve CORS-opaque responses for font files. An opaque response has `status === 0`, `body` is unreadable, and `arrayBuffer()` returns empty — but the `fetch()` promise **resolves successfully** (no rejection). The extension silently saves a 0-byte file.

**Why it happens:** CORS is origin-based, not extension-based. A content script running in the page context is treated as that page's origin — the same CORS restrictions apply. Unlike the service worker (which operates from the extension origin), the content script has no special CORS bypass.

**Consequences:** Silent 0-byte asset files in the output package. The LLM consumer sees placeholder assets that appear to exist but contain no data.

**Warning signs:**
- `response.ok` is `true` but `response.status === 0` (opaque response indicator)
- `response.headers.get('content-type')` returns `null`
- Asset file size in the output is 0 or a few bytes

**Prevention:**
- Route all asset fetching through the **service worker / background script**, not the content script. The service worker operates from the extension's origin (`chrome-extension://...`) and Chrome grants extensions the ability to fetch cross-origin URLs **if the host is listed in `host_permissions`** in the manifest. This is the correct architectural pattern already identified in PROJECT.md.
- For each asset URL, send a message from the content script to the background: `{ action: 'FETCH_ASSET', url }`. Background fetches and returns the `ArrayBuffer` (or base64-encoded string for easy JSON transport).
- Always check `response.type !== 'opaque'` and `response.ok` and `response.status !== 0` before treating a fetch as successful.
- Add `host_permissions: ["<all_urls>"]` to the manifest if not already present — this is the permission gate for cross-origin fetch from the background.

**Phase:** Asset downloading implementation phase. Must be designed with background-routed fetching from the start.

---

### Pitfall 5: Sending a 5–50MB Object via chrome.runtime.sendMessage Crashes the Message Channel

**What goes wrong:** `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage` serialises the response payload via JSON (structured clone). Chrome imposes a **64MB hard limit** on the message size, but in practice, payloads over ~5–10MB cause the renderer to stall, garbage collector pressure causes visible jank, and on some Chrome versions the message silently fails or the service worker OOMs and is killed. A full-page computed styles object — undeduped, all 300+ properties per element — can easily reach 20–100MB.

**Why it happens:** The analysis pipeline sends results back from content script → popup via a single `sendMessage` response. This was fine for the current lightweight analysis. Adding full computed styles to that single response object breaks the transport.

**Consequences:** Content script returns nothing (Chrome drops the oversized message), popup falls through to fallback analysis, user gets incomplete data with no indication of why.

**Warning signs:**
- Content script analysis completes (console logs show completion) but popup never receives the response
- `chrome.runtime.lastError` shows "message channel closed before response was received"
- Memory usage in the renderer process spikes during message send

**Prevention:**
- Stream large data in chunks. Instead of one `sendResponse` at the end, use `chrome.runtime.connect` (long-lived port) and `port.postMessage` to send computed styles in batches of 50–100 elements at a time, with the popup reassembling them.
- Apply deduplication and property filtering in the content script before sending — only send the delta from the default browser stylesheet, and only the ~50 design-relevant properties. This alone can reduce payload from 50MB to 2–3MB.
- For truly large outputs, write chunks to `chrome.storage.session` from the content script (content scripts can access `chrome.storage` in MV3) and have the popup read from storage rather than from the message response.

**Phase:** Computed styles extraction phase. The streaming/chunking architecture must be in place before the feature ships.

---

## Moderate Pitfalls

---

### Pitfall 6: getComputedStyle Values Are Viewport-Relative and Capture State, Not Intent

**What goes wrong:** Computed values for properties like `width`, `height`, `font-size` (when using `vw`, `vh`, `clamp`, `em`) are **resolved to absolute pixel values** at the moment of capture. `font-size: clamp(1rem, 2.5vw, 2rem)` becomes `"18.4px"` in the computed style — the design token is gone. An LLM given only computed values will reconstruct a fixed-pixel design that breaks at other viewport sizes.

**Prevention:**
- Always capture **both** computed styles (for actual rendered values) and the matching CSS rule declarations (for responsive intent). The existing stylesheet extraction pipeline can supply the rule-level values. FEATURES.md should note this pairing explicitly.
- Document viewport dimensions at capture time (`window.innerWidth`, `window.innerHeight`, `devicePixelRatio`) in the output so the LLM consumer has context for interpreting pixel values.

**Phase:** Computed styles extraction phase; document the pairing requirement in the output schema before implementation.

---

### Pitfall 7: Interaction State Extraction via Stylesheet Rules Misses JS-Applied Styles

**What goes wrong:** Extracting `:hover`, `:focus`, `:active` states by iterating `document.styleSheets` and reading `CSSStyleRule.selectorText` only captures styles defined in CSS. Many modern component libraries (styled-components, Emotion, CSS-in-JS patterns common in Next.js microfrontends) inject styles via `<style>` tags with opaque hashed class names, or apply styles via inline `style` attributes toggled by JavaScript event handlers. These states are invisible to stylesheet iteration.

**Prevention:**
- Cross-reference stylesheet rules with inline styles on representative elements.
- For JS-applied states: use Chrome DevTools Protocol (CDP) `CSS.forcePseudoState` via the existing `chrome.debugger` attachment to force pseudo-states programmatically and re-capture `getComputedStyle` with the state active. This requires the debugger to be attached (already in the architecture) but adds complexity.
- Flag in output metadata when a component appears to use JS-managed state styles rather than CSS pseudo-classes.

**Phase:** Interaction state extraction feature. CDP pseudo-state forcing should be scoped as an enhancement, not the baseline.

---

### Pitfall 8: chrome.downloads filename Path Traversal and Special Character Failures

**What goes wrong:** Asset URLs frequently contain query strings, hashes, and characters that are invalid in filenames on Windows (`?`, `*`, `<`, `>`, `|`, `"`, `:`) or paths that are too long (Windows MAX_PATH = 260 chars). `chrome.downloads.download` with an invalid `filename` fails silently — the download item is created with status `interrupted` and `error: "FILE_NAME_TOO_LONG"` or `"FILE_FAILED"`.

**Prevention:**
- Sanitise all filenames derived from URLs before passing to `chrome.downloads`: strip query strings, decode URI components, replace invalid characters with `_`, truncate to 100 characters for the basename.
- Keep a collision-avoidance map: if two URLs resolve to the same sanitised filename, append a numeric suffix.
- Check `chrome.downloads.onChanged` for `error` states during batch downloads and log failures rather than silently skipping.

**Phase:** Asset downloading implementation.

---

### Pitfall 9: dataLayer Capture Misses Events Fired Before Extension Injection

**What goes wrong:** `window.dataLayer` is an array that GTM pushes events into throughout the page lifecycle. By the time the extension's content script is injected (typically seconds after page load, when the user clicks "Analyze"), dozens of page-load events have already fired and been consumed by GTM. The array may have been partially cleared by GTM's `dataLayer.reset()` or may only show events since the last `gtm.js` load. The capture is incomplete.

**Prevention:**
- Install a `dataLayer` proxy at page load time rather than at analysis time. The right approach is a content script declared with `"run_at": "document_start"` in the manifest that wraps `window.dataLayer` with an `Array.push` proxy and accumulates all pushes in a separate buffer for later retrieval. This requires a persistent content script, not the on-demand injection pattern.
- If persistent injection is not acceptable, document in the output that `dataLayer` contents are a point-in-time snapshot that may be missing page-load events, and recommend the user trigger the "Analyze" action immediately after the page loads for best coverage.

**Phase:** GA/tracking plan extraction feature. The proxy approach must be evaluated against the no-persistent-content-script constraint.

---

### Pitfall 10: chrome.storage.local Quota (10MB default) Is Hit by Computed Styles Summaries

**What goes wrong:** The existing architecture stores analysis summaries to `chrome.storage.local`. The current summary is small. Once computed styles are added, even a deduplicated, filtered computed styles snapshot for a complex page is 1–5MB. With multiple tabs analysed in a session, the 10MB quota is easily hit. The existing code already notes it swallows quota errors silently — so this becomes silent data loss.

**Prevention:**
- Do not store computed styles in `chrome.storage.local`. Store them only in the in-memory Map and write them directly to the download package at export time.
- Use `chrome.storage.session` (no quota limit, survives dormancy but not browser restart) as a staging area for large intermediate data.
- If persistence is needed, store only a reference (tab ID + timestamp) in `chrome.storage.local` and keep the full data in memory or session storage.

**Phase:** Computed styles extraction phase; must be addressed before the first end-to-end test with real page data.

---

## Minor Pitfalls

---

### Pitfall 11: Re-injecting content.js Resets Style Extraction State

**What goes wrong:** The existing content script has a guard (`window.migrationAnalyzerLoaded`) that prevents re-running the full analysis if the script is injected twice. If computed styles are captured in a separate pass (user clicks "Analyze" a second time), the guard blocks re-capture, returning stale data from the first run.

**Prevention:** The guard should check whether the *specific* analysis type has been run, not just whether the script has been loaded. Alternatively, separate computed style extraction into a distinct injected function that doesn't go through the `WebsiteAnalyzer` class (consistent with the existing `executeScript` inline function pattern).

**Phase:** Computed styles extraction phase.

---

### Pitfall 12: Shadow DOM Elements Are Invisible to querySelectorAll

**What goes wrong:** Modern web components and some component frameworks (used by stock media platforms) encapsulate DOM subtrees in shadow roots. `document.querySelectorAll('*')` does not pierce shadow roots. Shadow DOM elements are skipped entirely in computed style extraction.

**Prevention:** Implement a recursive `collectAllElements` helper that checks each element for a `shadowRoot` property and recursively queries inside it. Note that cross-origin shadow roots (rare) cannot be pierced.

**Phase:** Computed styles extraction phase; note it as a known limitation in output metadata when shadow roots are detected.

---

### Pitfall 13: `@font-face` src URLs Require Different Fetch Credentials Than Image URLs

**What goes wrong:** Fonts loaded via `@font-face` are frequently served with `Access-Control-Allow-Origin: *` (CORS permissive) when accessed by the browser's font loader, but the CDN checks the `Origin` header and may reject fetches with an unexpected origin (the extension origin) even when the browser's own font load succeeded.

**Prevention:** Attempt font fetch from the background service worker (extension origin). If it fails with a CORS error, fall back to fetching from a content script (page origin) and transferring the `ArrayBuffer` back via messaging. Log which path succeeded for debugging.

**Phase:** Asset downloading implementation.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Computed styles extraction | Service worker dormancy during long extraction | Long-lived port keepalive before starting extraction |
| Computed styles extraction | getComputedStyle forced reflow blocking page | Chunked extraction with dedup-first strategy; idle callback scheduling |
| Computed styles extraction | 50MB+ message payload crashing transport | Chunk streaming via long-lived port or session storage staging |
| Computed styles extraction | storage.local quota hit on save | Keep computed styles in memory only; use session storage as staging |
| Interaction state extraction | JS-applied states invisible to stylesheet iteration | CDP `forcePseudoState` enhancement; document limitation in output |
| Asset downloading | chrome.downloads spawning 200 OS dialogs | Zip all assets into one file before calling downloads API |
| Asset downloading | Cross-origin fetch returning opaque 0-byte response | Route all fetches through background service worker with host_permissions |
| Asset downloading | Invalid characters in filenames from asset URLs | Sanitise all filenames before passing to chrome.downloads |
| Asset downloading | Font CORS rejection from extension origin | Dual-path fetch: background first, content script fallback |
| Structured directory output | Architecture decision about zip vs multi-download | Decide before any implementation; zip is strongly recommended |
| GA/tracking extraction | dataLayer events already consumed before injection | document_start content script proxy is the right solution; evaluate against constraints early |
| GA/tracking extraction | dataLayer capture is point-in-time incomplete | Document as known limitation; recommend immediate post-load analysis |

---

## Sources

All findings are from training data based on:
- Chrome Extension MV3 official documentation (developer.chrome.com/docs/extensions)
- Chrome Downloads API reference (developer.chrome.com/docs/extensions/reference/api/downloads)
- MDN: `window.getComputedStyle`, CORS specification, opaque responses
- Community reports: Chrome Extensions Google Groups, Chromium bug tracker issues
- Knowledge cutoff: August 2025

**Confidence by area:**
- MV3 service worker dormancy mechanics: HIGH (well-documented, stable behavior)
- getComputedStyle forced reflow behavior: HIGH (specified browser behavior)
- chrome.downloads directory structure: HIGH (documented API behavior)
- CORS opaque response behavior in content scripts vs service workers: HIGH
- chrome.storage.local 10MB quota: HIGH (documented)
- GTM dataLayer timing: MEDIUM (behavior observed widely but GTM internals can vary)
- Shadow DOM traversal limitation: HIGH (specified DOM behavior)
- Font CORS dual-origin behavior: MEDIUM (CDN-specific; varies by host)
