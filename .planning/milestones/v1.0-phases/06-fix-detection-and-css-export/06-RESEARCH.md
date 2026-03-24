# Phase 6: Fix Detection and CSS Export - Research

**Researched:** 2026-03-24
**Domain:** Chrome Extension — popup.js fallback path cleanup, network-based service detection, CSS file population in ZIP
**Confidence:** HIGH

## Summary

Phase 6 is a gap-closure phase with two independent workstreams. The first removes `detectServicesForKnownSites()` from popup.js — a hostname-keyed map that violates TRACK-03 — and replaces it with network-request-based service detection that reuses content.js's existing `servicePatterns` array approach. The second populates the currently-empty `css/` ZIP directory by fetching external stylesheet URLs discovered from content analysis data (or from the network request log in the CSP-restricted fallback path).

Both workstreams have complete blueprints already established in the codebase. The asset fetching pattern from Phase 3 (`fetchAssets()` in background.js) handles the CSS fetch with no new patterns needed. The service detection pattern from content.js (`servicePatterns` array + substring matching against URLs) is the single source of truth and needs to be made queryable from background.js. The network request log (`this.networkRequests.get(tabId)`) is the data source for both: service URL matching and CSS URL discovery in the fallback path.

**Primary recommendation:** Implement 06-01 (service detection) and 06-02 (CSS export) as two independent plans. Each has a single clear entry point in the codebase and reuses existing patterns without new libraries or APIs.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fallback Detection Strategy**
- D-01: Delete `detectServicesForKnownSites()` entirely and remove all callers in popup.js. The content script's generic signal-based detection (`categorizeService()`) is the source of truth.
- D-02: Replace the hardcoded fallback with network-based service detection — query background.js for captured `chrome.webRequest` data and infer services from request URLs (google-analytics.com, segment.com, etc.). This works even when CSP blocks DOM inspection.
- D-03: Reuse the same `categorizeService()` category mapping approach from content.js, applied to network request URLs instead of DOM-detected script elements. One source of truth for service categorization.

**CSS Directory Contents**
- D-04: Populate `css/` with fetched external stylesheets only — each linked `<link rel="stylesheet">` href fetched via background SW and saved as individual .css files. Inline `<style>` blocks are already in the HTML output.
- D-05: File naming uses original filename from the URL (e.g., `styles.css`, `main.css`). Collisions resolved with counter suffix (`styles-1.css`). Same pattern as Phase 3 asset downloads.
- D-06: Fetch failures handled same as asset failures — skip from `css/` directory, record URL + failure reason in `index.json` `failedAssets` array. Consistent with Phase 3 behavior.
- D-07: CSS directory does NOT respect element scoping — include all page stylesheets regardless of whether an element is selected. CSS files are small relative to other outputs and LLM can filter what's relevant.

**Fallback Path Behavior**
- D-08: The CSP-restricted fallback path also attempts CSS fetching. CSS `<link>` hrefs are discoverable even when DOM inspection fails.
- D-09: Stylesheet URLs in the fallback path come from the network request log (background SW's `chrome.webRequest` capture, filtered for text/css content type) — same data source as the network-based service detection.

### Claude's Discretion
- Exact implementation of network request URL → service name mapping
- How to extract CSS URLs from the network request log (content-type filtering vs URL pattern matching)
- Whether to add a `css` summary field to `index.json` alongside the existing asset summaries

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRACK-03 | All detection logic expressed as generic observable patterns — no hardcoded site names in codebase | D-01 through D-03: delete `detectServicesForKnownSites()`, replace with network URL pattern matching using the `servicePatterns` array from content.js |
| SCOPE-02 | Extension exports a structured directory including `/css` | D-04 through D-09: populate `fileTree['css/']` in `downloadAsZip()` using `fetchAssets()` blueprint; handle fallback CSS URL discovery from network log |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.2 | ZIP assembly | Already loaded via `importScripts('/vendor/fflate.min.js')` in background.js — CSS files added as `fflate.strToU8(content)` entries in `fileTree['css/']` |
| chrome.webRequest | MV3 built-in | Network request capture | Already capturing response headers including `content-type` — CSS URL discovery filters this data |
| chrome.runtime.sendMessage | MV3 built-in | IPC between popup and background | Established message action pattern in SCREAMING_SNAKE_CASE |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fetch() | SW native | HTTP fetch in service worker context | Same as `fetchAssets()` — CSS stylesheets fetched as text in background SW |
| AbortController | SW native | Fetch timeout | Matches 10-second timeout used in `fetchAssets()` — apply identically for CSS fetching |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Network request log for CSS URL discovery | `chrome.scripting` DOM query for `link[rel=stylesheet]` | DOM query requires tab injection and doesn't work in CSP-restricted fallback — network log works in all paths |
| Inline service patterns in background.js | Shared module between content.js and background.js | No module system exists; content.js patterns are DOM-focused (script/link/img elements), background.js patterns match raw URL strings — inline copy is appropriate |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All work is in existing files:

```
popup.js           — remove detectServicesForKnownSites() + its caller in performFallbackAnalysis()
background.js      — add GET_CSS_URLS message handler + populate fileTree['css/'] in downloadAsZip()
content.js         — no changes (source of truth for service patterns — read only)
tests/unit/        — new test files for each plan
```

### Pattern 1: Network-Based Service Detection (Plan 06-01)

**What:** A new background.js message handler `GET_SERVICES_FROM_NETWORK` returns detected services inferred from captured request URLs, using the same `servicePatterns` domain list as content.js.

**When to use:** Called from popup.js fallback path (`performFallbackAnalysis()`) in place of the deleted `detectServicesForKnownSites()` call.

**Example — message handler in background.js:**
```javascript
// Source: established SCREAMING_SNAKE_CASE message pattern (background.js lines 232-358)
case 'GET_SERVICES_FROM_NETWORK': {
  const requests = this.networkRequests.get(tabId) || [];
  const services = detectServicesFromNetworkRequests(requests);
  sendResponse({ success: true, data: services });
  break;
}
```

**Example — pure function (top-level, no class dependency):**
```javascript
// Mirrors content.js servicePatterns structure — URL substring matching, no site names
const SERVICE_URL_PATTERNS = [
  { name: 'Google Analytics', patterns: ['google-analytics.com', 'googletagmanager.com'] },
  { name: 'Segment',          patterns: ['segment.com', 'cdn.segment.com'] },
  { name: 'Hotjar',           patterns: ['hotjar.com'] },
  // ... same approach as content.js servicePatterns array (lines 590-653)
];

function detectServicesFromNetworkRequests(requests) {
  const seen = new Map(); // name -> service object (dedup by name)
  for (const req of requests) {
    const url = req.url;
    for (const { name, patterns } of SERVICE_URL_PATTERNS) {
      if (patterns.some(p => url.includes(p))) {
        if (!seen.has(name)) {
          seen.set(name, { name, urls: [url], category: categorizeServiceName(name), confidence: 'medium', source: 'network-request' });
        } else {
          const existing = seen.get(name);
          if (!existing.urls.includes(url)) existing.urls.push(url);
        }
      }
    }
  }
  return Array.from(seen.values());
}
```

**Example — popup.js fallback path after change:**
```javascript
// Source: popup.js lines 320-339 — performFallbackAnalysis()
// BEFORE: this.detectServicesForKnownSites(hostname)
// AFTER:
const networkServices = await this.sendMessage('GET_SERVICES_FROM_NETWORK');
thirdPartyServices: networkServices.data || [],
```

### Pattern 2: CSS File Population in ZIP (Plan 06-02)

**What:** `downloadAsZip()` in background.js fetches stylesheet URLs collected during analysis and writes them into `fileTree['css/']` before ZIP encoding.

**When to use:** Every `DOWNLOAD_PACKAGE` invocation — CSS fetching runs alongside existing asset fetching.

**Example — CSS URL source (normal path, from analysisData):**
```javascript
// analysisData.cssUrls is populated by the content script's asset discovery
// content.js already iterates document.querySelectorAll('link[rel="stylesheet"]')
// The URL list is sent as part of the STORE_ANALYSIS payload (same as assetUrls pattern)
const cssUrls = analysisData.cssUrls || [];
```

**Example — CSS URL source (fallback path, from network log):**
```javascript
// CSS URL discovery from captured network requests (D-09)
// Two strategies — prefer content-type header, fall back to URL pattern
function extractCssUrlsFromNetworkRequests(requests) {
  return requests
    .filter(req => {
      // Strategy 1: content-type header (most reliable)
      const headers = req.responseHeaders || [];
      const ct = headers.find(h => h.name.toLowerCase() === 'content-type');
      if (ct && ct.value.includes('text/css')) return true;
      // Strategy 2: URL ends with .css (fallback when no response headers captured)
      return req.url.endsWith('.css') || req.url.includes('.css?');
    })
    .map(req => req.url);
}
```

**Example — CSS population in downloadAsZip():**
```javascript
// Source: follows same structure as Phase 3 asset population (background.js lines 735-742)
// Insert BEFORE tracking/ block and BEFORE index.json encoding
const cssResult = await this.fetchAssets(cssUrls);  // reuse existing fetchAssets()
const fetchedCss  = cssResult.successes;
const failedCss   = cssResult.failures;

// Append failed CSS fetches to existing failedAssets array
failedAssets.push(...failedCss);

if (fetchedCss.length > 0) {
  const cssDir = {};
  for (const sheet of fetchedCss) {
    // fetchAssets() returns { url, filename, data: Uint8Array }
    // CSS content is text but fetchAssets returns Uint8Array — correct for fflate
    cssDir[sheet.filename] = sheet.data;
  }
  fileTree['css/'] = cssDir;
}

// Update stages flag
indexData.stages.css = fetchedCss.length > 0;
```

### Anti-Patterns to Avoid

- **Branching on hostname in fallback path:** `detectServicesForKnownSites()` is the exact anti-pattern being removed. No new hostname-conditional logic.
- **Fetching CSS content in popup.js:** CSS fetching must route through background SW (has `<all_urls>` permission) — popup/content scripts cannot bypass CORS for external stylesheets.
- **Encoding index.json before CSS block:** The tracking/ block already guards against early `index.json` encoding. CSS `indexData.stages.css` update must also precede the `fileTree['index.json']` line. (See background.js line 804 — "Encode index.json LAST".)
- **Using DOM injection to discover CSS URLs in fallback:** `chrome.scripting` fails when CSP is restrictive. The network request log is the safe fallback source.
- **Modifying content.js servicePatterns:** Keep content.js unchanged. The background.js version is an independent inline copy for network URL matching — not shared code.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filename collision resolution for CSS files | New counter logic | `extractFilename()` + `resolveFilename()` already in background.js (lines 17-38) | Handles extension, no-extension, query params — already tested in fetch-assets.test.js |
| CSS fetch with timeout | New fetch wrapper | `fetchAssets(urls)` in background.js (lines 633-672) | Already handles timeout, error, binary data, collision resolution — CSS fetch is identical |
| CSS URL deduplication | Custom Set logic | Dedup at URL collection time using a Set before passing to fetchAssets | fetchAssets already handles per-filename dedup; URL-level dedup prevents redundant fetches |

**Key insight:** `fetchAssets()` is already generic — it accepts any URL array and returns `{ successes, failures }`. CSS fetching is a zero-new-code reuse of this function. The only new code is the URL collection step and `fileTree['css/']` population.

---

## Common Pitfalls

### Pitfall 1: `index.json` encoded before `stages.css` is set

**What goes wrong:** `stages.css` remains `false` in the ZIP even when CSS files were successfully fetched.

**Why it happens:** The `fileTree['index.json']` encoding line (background.js line 804) must come after all `indexData` mutations. The tracking block (Phase 4) already set this precedent. CSS must follow the same ordering.

**How to avoid:** Insert CSS population block before the `// Encode index.json LAST` comment. Update `indexData.stages.css` within that same block.

**Warning signs:** `stages.css` is always `false` in index.json despite .css files being present in the ZIP.

### Pitfall 2: `failedAssets` array not shared between binary asset failures and CSS fetch failures

**What goes wrong:** CSS fetch failures are dropped silently instead of recorded in `index.json`.

**Why it happens:** `failedAssets` is initialized from `analysisData.failedAssets` early in `downloadAsZip()`. CSS failures from a separate `fetchAssets()` call aren't pushed into that array.

**How to avoid:** `failedAssets.push(...failedCss)` immediately after the CSS `fetchAssets()` call — before `fileTree['index.json']` encoding.

**Warning signs:** CSS fetch errors appear in console but not in `index.json` `failedAssets`.

### Pitfall 3: `categorizeService()` not available in background.js scope

**What goes wrong:** `detectServicesFromNetworkRequests()` calls a function that doesn't exist in background.js, causing a runtime error when `GET_SERVICES_FROM_NETWORK` is handled.

**Why it happens:** `categorizeService()` is a method on `WebsiteAnalyzer` class in content.js (line 711). Background.js has no such class.

**How to avoid:** Define a standalone `categorizeServiceName(name)` function at the top level of background.js (same position as `extractFilename`, `resolveFilename`, `deriveEventSchema`) using a plain object lookup — identical logic, no class dependency.

**Warning signs:** `ReferenceError: categorizeServiceName is not defined` in background SW console.

### Pitfall 4: CSS URL list not passed from content script to background

**What goes wrong:** `analysisData.cssUrls` is undefined in `downloadAsZip()`, so no CSS files are fetched even on pages with external stylesheets.

**Why it happens:** content.js already discovers `link[rel="stylesheet"]` hrefs (line 258-263) and stores them in `this.assets.css` as objects with a `url` property. But `downloadAsZip()` needs a flat URL array — `assetUrls` is the established pattern for this (set during `STORE_ANALYSIS`). CSS URLs need to be extracted and stored analogously.

**How to avoid:** In popup.js, when building the STORE_ANALYSIS payload (or the DOWNLOAD_PACKAGE payload), extract CSS URLs from `analysisData.assets.css` filtering for non-inline entries (`!entry.inline`). Store as `cssUrls: [...]`.

**Warning signs:** `cssUrls` is `[]` or `undefined` even though `assets.css` has external stylesheet entries.

### Pitfall 5: Network request log captures no response headers for CSS requests

**What goes wrong:** Content-type filtering finds no CSS requests in the network log, leaving fallback path with no CSS URLs.

**Why it happens:** `chrome.webRequest.onCompleted` captures `responseHeaders` only when `['responseHeaders']` is listed in the extraInfoSpec (background.js line 117 — already set). But some requests may complete before SW wakes, or response headers may be missing for cached responses (304 Not Modified returns no body/headers in some Chrome versions).

**How to avoid:** Use the two-strategy approach: content-type header first, `.css` URL pattern fallback (see Pattern 2 example above). Both strategies in combination cover the common cases.

**Warning signs:** CSS fallback detection works on cold page loads but not on repeat visits (cached responses).

### Pitfall 6: `detectServicesForKnownSites()` caller not fully removed

**What goes wrong:** TRACK-03 violation persists because the hostname map is deleted but the call site in `performFallbackAnalysis()` (popup.js line 332) still references a non-existent method, causing a runtime error in the fallback path.

**Why it happens:** Two-step delete: the function body AND its call site must both be removed/replaced.

**How to avoid:** After deleting the function, search for all remaining references to `detectServicesForKnownSites` across popup.js and verify zero matches remain.

**Warning signs:** `TypeError: this.detectServicesForKnownSites is not a function` in popup console when fallback path triggers.

---

## Code Examples

Verified patterns from the existing codebase:

### Existing `fetchAssets()` signature (background.js lines 633-672)
```javascript
// Source: background.js lines 628-672
// Accepts URL array, returns { successes: [{url, filename, data: Uint8Array}], failures: [{url, reason}] }
// Timeout: 10 seconds per URL, parallel fetch
async fetchAssets(urls) { ... }
```

### Existing `extractFilename()` + `resolveFilename()` (background.js lines 17-38)
```javascript
// Source: background.js lines 17-38
// extractFilename: gets filename from URL pathname (ignores query string)
// resolveFilename: counter-suffix collision resolution using a seen Map
```

### Network request data structure (background.js lines 447-457, 535-543)
```javascript
// Each captured request object shape:
{
  requestId: string,
  url: string,
  method: string,
  type: string,          // 'stylesheet', 'script', 'image', 'xmlhttprequest', etc.
  timestamp: number,
  requestBody: object,
  tabId: number,
  isGraphQL: boolean,
  graphQLQuery: object | null,
  // Added by onCompleted:
  statusCode: number,
  responseHeaders: Array<{ name: string, value: string }>,
  responseTimestamp: number
}
```

### CSS URL filtering from content.js analysis data
```javascript
// content.js assets.css entries have shape: { url, type, inline, media, ... }
// Non-inline external stylesheet URLs:
const cssUrls = (analysisData.assets?.css || [])
  .filter(entry => !entry.inline && entry.url && !entry.url.startsWith('blob:'))
  .map(entry => entry.url);
```

### CSS URL filtering from network request log (fallback path)
```javascript
// Filter by webRequest type field ('stylesheet') — most reliable
// webRequest type values: 'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest', 'other'
function extractCssUrlsFromNetworkRequests(requests) {
  const seen = new Set();
  return requests
    .filter(req => {
      if (req.type === 'stylesheet') return true;
      const headers = req.responseHeaders || [];
      const ct = headers.find(h => h.name.toLowerCase() === 'content-type');
      if (ct && ct.value.includes('text/css')) return true;
      return /\.css(\?|$)/.test(req.url);
    })
    .map(req => req.url)
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}
```

**Note on `req.type`:** The `chrome.webRequest` `type` field is populated by `onBeforeRequest` at request time — not dependent on response headers. This is the most reliable CSS URL detection method in the fallback path because it doesn't require `onCompleted` to have fired.

### Message action pattern (background.js handleMessage switch)
```javascript
// Source: background.js lines 232-358
// New action follows identical structure:
case 'GET_SERVICES_FROM_NETWORK': {
  const networkData = this.networkRequests.get(tabId) || [];
  const services = detectServicesFromNetworkRequests(networkData);
  sendResponse({ success: true, data: services });
  break;
}
```

### sendMessage in popup.js
```javascript
// Source: popup.js getNetworkData() (lines 798-801) — same pattern
async sendMessage(action, data = {}) {
  // established helper — returns the full response object
}
const result = await this.sendMessage('GET_SERVICES_FROM_NETWORK');
const services = result.data || [];
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `detectServicesForKnownSites()` hostname map | Network URL pattern matching using `servicePatterns` array approach | Phase 6 (this phase) | Removes TRACK-03 violation; detection works on any site, not just 4 hardcoded ones |
| Empty `css/` directory stub | Populated `css/` directory with fetched stylesheets | Phase 6 (this phase) | Closes SCOPE-02 gap; LLM receives actual CSS content |

**Deprecated/outdated:**
- `detectServicesForKnownSites()` function (popup.js lines 761-796): To be deleted entirely. Its only caller is the final fallback branch in `performFallbackAnalysis()`.

---

## Open Questions

1. **Should `analysisData.cssUrls` be populated in the normal path or extracted in `downloadAsZip()`?**
   - What we know: `assetUrls` is set in the DOWNLOAD_PACKAGE flow — `analysisData.assetUrls` is checked in `downloadAsZip()` line 679. CSS URLs could follow the same pattern.
   - What's unclear: At what point in the popup.js flow are CSS URLs extracted and sent to background? They could come from the content script's analysis result or from a separate query.
   - Recommendation: Planner should decide — extract from `analysisData.assets.css` inside `downloadAsZip()` directly (simpler, no new IPC) OR add `cssUrls` to the DOWNLOAD_PACKAGE payload (mirrors assetUrls pattern exactly). Both work.

2. **Does `req.type === 'stylesheet'` appear in the network log reliably?**
   - What we know: `chrome.webRequest.onBeforeRequest` fires for all requests and includes the `type` field which maps to resource types. 'stylesheet' is a documented type for `<link rel="stylesheet">`.
   - What's unclear: Whether early-loaded stylesheets (pre-analysis-start) are in `recentRequests` and included when analysis begins.
   - Recommendation: Implement with dual-strategy (type field + .css URL pattern). The `recentRequests` rolling buffer (last 100 requests, line 468) should capture stylesheets loaded on initial page load.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `jest.config.js` — testEnvironment: node, transform: {}, setupFilesAfterEnv: ['./tests/setup/chrome-mock.js'] |
| Quick run command | `npx jest tests/unit/detect-services.test.js --no-coverage` |
| Full suite command | `npx jest tests/unit/ --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACK-03 | `detectServicesFromNetworkRequests()` matches known service URLs to service names | unit | `npx jest tests/unit/detect-services.test.js -t "detects"` | ❌ Wave 0 |
| TRACK-03 | `detectServicesFromNetworkRequests()` returns empty array when no matches | unit | `npx jest tests/unit/detect-services.test.js -t "empty"` | ❌ Wave 0 |
| TRACK-03 | `detectServicesFromNetworkRequests()` deduplicates same service from multiple URLs | unit | `npx jest tests/unit/detect-services.test.js -t "dedup"` | ❌ Wave 0 |
| TRACK-03 | No reference to `detectServicesForKnownSites` remains in popup.js | smoke | manual grep check | N/A |
| SCOPE-02 | `extractCssUrlsFromNetworkRequests()` returns URLs for requests with type 'stylesheet' | unit | `npx jest tests/unit/css-export.test.js -t "stylesheet type"` | ❌ Wave 0 |
| SCOPE-02 | `extractCssUrlsFromNetworkRequests()` returns URLs for requests with text/css content-type header | unit | `npx jest tests/unit/css-export.test.js -t "content-type"` | ❌ Wave 0 |
| SCOPE-02 | `extractCssUrlsFromNetworkRequests()` returns URLs matching .css pattern when no headers | unit | `npx jest tests/unit/css-export.test.js -t "url pattern"` | ❌ Wave 0 |
| SCOPE-02 | `extractCssUrlsFromNetworkRequests()` deduplicates URLs | unit | `npx jest tests/unit/css-export.test.js -t "dedup"` | ❌ Wave 0 |
| SCOPE-02 | CSS filenames from URL use `extractFilename()` + `resolveFilename()` collision logic | unit | `npx jest tests/unit/css-export.test.js -t "filename"` | ❌ Wave 0 |
| SCOPE-02 | CSS fetch failures recorded in `failedAssets` with `{ url, reason }` shape | unit | `npx jest tests/unit/css-export.test.js -t "failures"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/detect-services.test.js tests/unit/css-export.test.js --no-coverage`
- **Per wave merge:** `npx jest tests/unit/ --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/detect-services.test.js` — covers TRACK-03 (inline copies of `detectServicesFromNetworkRequests`, `categorizeServiceName`)
- [ ] `tests/unit/css-export.test.js` — covers SCOPE-02 (inline copies of `extractCssUrlsFromNetworkRequests`, uses existing `extractFilename`/`resolveFilename` already tested)

*Existing test infrastructure (chrome-mock.js, jest.config.js) covers all new test files with no additional setup.*

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection — background.js, popup.js, content.js, existing test files
- `background.js` lines 17-38 — `extractFilename`, `resolveFilename` implementation
- `background.js` lines 633-672 — `fetchAssets()` full implementation
- `background.js` lines 706-804 — `downloadAsZip()` file tree construction pattern
- `background.js` lines 424-475 — `captureRequest()` showing `type` field capture from `onBeforeRequest`
- `background.js` lines 525-543 — `captureResponse()` showing `responseHeaders` storage
- `content.js` lines 590-693 — `servicePatterns` array and `categorizeService()` method
- `popup.js` lines 761-796 — `detectServicesForKnownSites()` (to be deleted)
- `popup.js` lines 320-339 — fallback path caller (to be replaced)
- `tests/unit/fetch-assets.test.js` — existing tests for filename functions (confirmed inline copy pattern)
- `.planning/phases/06-fix-detection-and-css-export/06-CONTEXT.md` — all decisions D-01 through D-09

### Secondary (MEDIUM confidence)

- Chrome extension `chrome.webRequest` type field values: documented as 'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other' — consistent across MV3 documentation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all technology already in use, no new libraries
- Architecture: HIGH — both workstreams have direct blueprints in existing code; network request data structure confirmed by reading captureRequest/captureResponse
- Pitfalls: HIGH — identified from direct code inspection of the exact functions being modified

**Research date:** 2026-03-24
**Valid until:** This is pure internal codebase research — valid indefinitely until source files change
