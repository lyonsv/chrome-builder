# Phase 5: Fix Popup Data Display - Research

**Researched:** 2026-03-24
**Domain:** Chrome Extension messaging — popup ↔ background data flow
**Confidence:** HIGH

## Summary

The bug is a response shape mismatch: `content.js` sends `{ success: true }` after routing analysis data to background via `sendChunked()`, but `popup.js analyzeWebsiteContent()` reads `response.data` which is always `undefined` on the primary path. The result is `this.analysisData` is spread from `undefined`, so `displayResults()` sees all counts as 0.

The fix uses a pull pattern: popup receives `{ success: true }`, then sends a new `GET_ANALYSIS` message to background which responds with a summary object built from the stored `this.analysisData.get(tabId)` map entry. The summary excludes heavy fields (computedStyles, scopedHtml, fetchedAssets) that are only needed at ZIP time. Fallback paths (DOM inspection, network-only) already return real data directly — they are left unchanged.

`loadCurrentTab()` gains a GET_ANALYSIS call so data persists across popup close/reopen. The redundant `STORE_ANALYSIS` call from popup line 232 and the `getNetworkData()` call are removed — content script already routes storage through background directly.

**Primary recommendation:** Add `GET_ANALYSIS` case to `background.js` message handler; rewrite `startAnalysis()` in `popup.js` to call it after `analyzeWebsiteContent()` returns `{ success: true }`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Fix approach — Pull pattern (GET_ANALYSIS)**
  - Popup receives `{ success: true }` from content script, then sends `GET_ANALYSIS` to background to fetch stored data
  - `analyzeWebsiteContent()` returns only `{ success: true }` on primary path — no data in the response
  - `startAnalysis()` uses explicit two-step flow: trigger analysis → pull complete data via GET_ANALYSIS → display
  - Remove the redundant `STORE_ANALYSIS` call from popup (line 232) — content script already stores via background
  - Remove `getNetworkData()` from popup — GET_ANALYSIS includes network data
  - Background's GET_ANALYSIS handler merges `networkRequests` from its own map alongside analysis data in one response
  - On popup load (`loadCurrentTab()`), check background for stored analysis via GET_ANALYSIS — if data exists, populate and display results with download button enabled
  - Simplified startAnalysis() flow: `START_ANALYSIS → analyzeWebsiteContent() → GET_ANALYSIS → displayResults()` (only screenshot stays in popup)

- **Payload size — Summary response**
  - GET_ANALYSIS returns only what popup needs for display: url, title, analysisMode, assets (full URL arrays), frameworks, thirdPartyServices, networkRequests, trackingData (full dataLayer array)
  - Excludes heavy fields: computedStyles, scopedHtml, componentHierarchy, fetchedAssets — these stay in background for ZIP assembly only
  - Asset arrays include full URL/metadata (small), not just counts
  - trackingData includes full dataLayer array (typically small, dozens of entries)

- **Fallback path consistency**
  - Fallback paths (DOM inspection, network-only) keep returning data directly — no background routing
  - Distinguish primary vs fallback: primary returns `{ success: true }` (signal to pull from background), fallbacks return the actual data object (no success flag)
  - `startAnalysis()` checks `result.success` to decide which path: if true → GET_ANALYSIS pull, otherwise → use returned data directly
  - `displayResults()` uses null-safe checks for trackingData: `trackingData ? trackingData.dataLayer.length : 0`
  - Leave `detectServicesForKnownSites()` as-is — Phase 6 owns TRACK-03 (hardcoded site names)
  - Popup-load restoration (GET_ANALYSIS on loadCurrentTab) only works for primary path results stored in background, not fallback results

- **Tracking count display**
  - Show raw dataLayer push count (`dataLayer.length`), not derived event types
  - Always show tracking row with 0 if no tracking data — consistent with other result rows, never hide

### Claude's Discretion
- Exact error handling for GET_ANALYSIS failures
- Whether to add progress updates during the GET_ANALYSIS pull step
- Internal structure of the GET_ANALYSIS message handler in background.js

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRACK-01 | Extension captures dataLayer push history and GTM event schema — what events fire, what properties they carry, and which user interactions trigger them | trackingData (with dataLayer array) is already stored in background; GET_ANALYSIS must include it in the summary response. `displayResults()` at line 850 reads `trackingData.dataLayer.length` — null-safe guard needed |
| SCOPE-01 | User can select a specific element on the page; extension captures only that subtree's scoped output | scopeSelector flows through the existing path; GET_ANALYSIS summary must preserve analysisMode so popup can display scoped vs full-page label correctly |
| SCOPE-03 | Extension fetches and saves actual image/font/icon files (routed through background) rather than URL references only | Asset URLs are stored in background; GET_ANALYSIS must include full asset arrays so popup count display is correct. fetchedAssets (binary) stays in background for ZIP only |
</phase_requirements>

---

## Standard Stack

This phase involves no new libraries. All changes use APIs already present in the codebase.

### Core (in use)
| Component | Location | Purpose |
|-----------|----------|---------|
| `chrome.runtime.sendMessage` | popup.js `sendMessage()` helper | Popup-to-background messaging |
| `chrome.runtime.onMessage` switch/case | background.js `handleMessage()` | Background message dispatch |
| `this.analysisData` Map | background.js MigrationAnalyzer | Tab-keyed analysis storage (`get(tabId)`) |
| `this.networkRequests` Map | background.js MigrationAnalyzer | Tab-keyed network request storage (`get(tabId)`) |

### No new dependencies required
The `sendMessage()` helper in popup.js already wraps `chrome.runtime.sendMessage` with Promise support — GET_ANALYSIS uses this exact helper. No new library installation needed.

## Architecture Patterns

### Message routing pattern (established)
```
popup.sendMessage(action, data)
  → chrome.runtime.sendMessage({ action, data, tabId })
  → background.handleMessage switch/case
  → sendResponse({ success: true, data: ... })
  → popup receives resolved promise value
```

The GET_ANALYSIS case follows this exact pattern. The only new behavior is that the handler reads from `this.analysisData.get(tabId)` and `this.networkRequests.get(tabId)`, then builds and returns a summary object.

### Two-step primary analysis flow (new)

```
startAnalysis()
  1. sendMessage('START_ANALYSIS', ...)           — background starts network monitoring
  2. analyzeWebsiteContent()                       — injects content.js, sends ANALYZE_WEBSITE
       content.js: analyzeWebsite() → sendChunked('STORE_ANALYSIS', result, tabId)
                   → sendResponse({ success: true })
       returns: { success: true } on primary, data object on fallback
  3. if result.success → sendMessage('GET_ANALYSIS', { tabId })
                        → background returns summary object
     else              → use result directly as analysisData
  4. this.analysisData = resolved data
  5. displayResults()
```

### GET_ANALYSIS handler structure (background.js)

Insert new case in `handleMessage()` switch around line 250 (after the `GET_NETWORK_DATA` case, before `STORE_ANALYSIS`):

```javascript
case 'GET_ANALYSIS': {
  const stored = this.analysisData.get(tabId);
  if (!stored) {
    sendResponse({ success: false, error: 'No analysis stored for tab' });
    break;
  }
  const networkRequests = this.networkRequests.get(tabId) || [];
  sendResponse({
    success: true,
    data: {
      url: stored.url,
      title: stored.title,
      analysisMode: stored.analysisMode,
      assets: stored.assets,
      frameworks: stored.frameworks,
      thirdPartyServices: stored.thirdPartyServices,
      trackingData: stored.trackingData,
      networkRequests
    }
  });
  break;
}
```

Heavy fields (`computedStyles`, `scopedHtml`, `componentHierarchy`, `fetchedAssets`) are intentionally excluded — they remain in `this.analysisData.get(tabId)` for ZIP assembly.

### loadCurrentTab() restoration (popup.js)

After the existing picker-selection restore block, add:

```javascript
// Restore analysis results if background has stored data for this tab
try {
  const analysisResponse = await this.sendMessage('GET_ANALYSIS', { tabId: this.currentTab.id });
  if (analysisResponse && analysisResponse.success && analysisResponse.data) {
    this.analysisData = analysisResponse.data;
    this.displayResults();
    // Enable download button
    if (this.downloadBtn) this.downloadBtn.disabled = false;
  }
} catch (_) {
  // No stored analysis — normal state for fresh tabs
}
```

### Fallback path detection in analyzeWebsiteContent()

The current code at line 284-286 reads:
```javascript
} else if (response && response.success) {
  console.log('Content script analysis successful');
  resolve(response.data);   // BUG: response.data is undefined
```

Change to:
```javascript
} else if (response && response.success) {
  console.log('Content script analysis successful — pull from background');
  resolve({ success: true });   // signal to caller to GET_ANALYSIS
```

### startAnalysis() rewrite (popup.js)

Remove steps 3-5 (network data, STORE_ANALYSIS) and replace with GET_ANALYSIS pull:

```javascript
// Step 2: Analyze website content
const analysisResult = await this.analyzeWebsiteContent();

// Step 3: Pull complete data from background (primary path) or use directly (fallback)
let analysisData;
if (analysisResult && analysisResult.success) {
  const response = await this.sendMessage('GET_ANALYSIS', { tabId: this.currentTab.id });
  if (!response || !response.success) {
    throw new Error('GET_ANALYSIS failed: ' + (response?.error || 'unknown'));
  }
  analysisData = response.data;
} else {
  // Fallback paths return data directly
  analysisData = analysisResult;
}

// Step 4: Add screenshot (stays in popup — not routed through background)
if (options.takeScreenshot) {
  analysisData.screenshot = await this.captureScreenshot();
}

this.analysisData = { ...analysisData, options, timestamp: new Date().toISOString() };
this.displayResults();
```

### Tracking count null-safe guard

`displayResults()` line 850 already reads:
```javascript
const totalTrackingEvents = this.analysisData.trackingData ? this.analysisData.trackingData.dataLayer.length : 0;
```
This pattern is already null-safe. Extend to also handle `dataLayer` being undefined:
```javascript
const totalTrackingEvents = this.analysisData.trackingData?.dataLayer?.length ?? 0;
```

### Anti-Patterns to Avoid

- **Returning full analysisData in GET_ANALYSIS:** computedStyles alone can be hundreds of KB. Only return the display-summary fields — ZIP assembly reads directly from the in-memory Map.
- **Adding a success flag to fallback returns:** Fallback objects must NOT have a `success: true` property or the detection in startAnalysis() will incorrectly try to GET_ANALYSIS from background where no data is stored.
- **Calling STORE_ANALYSIS from popup:** Content script already calls `sendChunked('STORE_ANALYSIS', ...)` directly to background. A second popup call would overwrite with stale/incomplete data.
- **Reading `response.data` from analyzeWebsiteContent():** The primary path intentionally returns no data — the function should only signal success.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Tab-keyed storage | Custom storage object | `this.analysisData.get(tabId)` already exists in MigrationAnalyzer |
| Network data per tab | Second map / new fetch | `this.networkRequests.get(tabId)` already exists in MigrationAnalyzer |
| Async message wrap | Raw callback | `this.sendMessage()` helper in popup.js already Promisifies chrome.runtime.sendMessage |

## Common Pitfalls

### Pitfall 1: Fallback result has a `success` property
**What goes wrong:** If any fallback path returns an object with `success: true` (e.g. a site with `window.success = true` in the page), `startAnalysis()` will try GET_ANALYSIS and find no background storage, throwing an error.
**Why it happens:** The primary/fallback detection relies on `result.success` being a meaningful signal.
**How to avoid:** Ensure fallback returns are plain data objects — never include a top-level `success` property. The current `performFallbackAnalysis()` does not set `success`, so this is already safe.
**Warning signs:** Analysis completes but popup shows 0 counts on fallback path.

### Pitfall 2: GET_ANALYSIS called before STORE_ANALYSIS completes
**What goes wrong:** content.js calls `sendChunked(...).then(() => sendResponse({ success: true }))` — so the popup only receives `{ success: true }` after `STORE_ANALYSIS` is fully committed. This ordering is already correct. Do not restructure to parallelize.
**Why it happens:** Misreading the promise chain in content.js lines 1792-1793.
**How to avoid:** Do not change content.js. The `.then()` chain guarantees storage before popup resolve.
**Warning signs:** Intermittent 0-count results on primary path.

### Pitfall 3: loadCurrentTab() GET_ANALYSIS fails on fresh tabs
**What goes wrong:** On first open (no prior analysis), `this.analysisData.get(tabId)` returns `undefined`, so GET_ANALYSIS responds with `{ success: false }`. If this is not caught, popup load fails.
**Why it happens:** GET_ANALYSIS is used for both restoration and first-load.
**How to avoid:** Wrap the loadCurrentTab restoration in try/catch and treat `success: false` as "no data yet" — silently skip, do not throw.

### Pitfall 4: Download button state after restoration
**What goes wrong:** After popup-load restoration via GET_ANALYSIS, the download button remains disabled unless explicitly enabled.
**Why it happens:** `updateUI(false)` at end of startAnalysis() manages button state during a fresh analysis, but restoration skips that path.
**How to avoid:** In the loadCurrentTab restoration block, explicitly enable the download button when data is found.

### Pitfall 5: `trackingCount` DOM element may not exist
**What goes wrong:** `displayResults()` at line 851 writes `this.trackingCount.textContent` — if the HTML element was not added in an earlier phase, this throws.
**Why it happens:** TRACK-01 was implemented in Phase 4 which added the tracking row to the ZIP; the popup display element may lag.
**How to avoid:** Verify `trackingCount` element exists in `popup.html` before assuming it is available. If missing, add the DOM element as part of this phase.

## Code Examples

### Verified: existing sendMessage helper (popup.js)
```javascript
// Source: popup.js (current codebase)
sendMessage(action, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}
```
GET_ANALYSIS call: `await this.sendMessage('GET_ANALYSIS', { tabId: this.currentTab.id })`

### Verified: existing tab-keyed reads (background.js)
```javascript
// Source: background.js getNetworkData (line 543)
getNetworkData(tabId) {
  return this.networkRequests.get(tabId) || [];
}

// Source: background.js storeAnalysis (line 547) — same pattern for analysisData
const analysisData = this.analysisData.get(tabId);
```

### Verified: content.js primary path (content.js lines 1792-1793)
```javascript
return sendChunked('STORE_ANALYSIS', result, tabId)
  .then(() => sendResponse({ success: true }))
  .catch(err => sendResponse({ success: false, error: err.message }));
```
The popup receives `{ success: true }` only after storage is complete — GET_ANALYSIS is safe to call immediately after.

## State of the Art

| Old Behavior | New Behavior | Impact |
|--------------|--------------|--------|
| `analyzeWebsiteContent()` resolves `response.data` (undefined) | Resolves `{ success: true }` on primary path | Enables pull pattern |
| `startAnalysis()` spreads undefined into `this.analysisData` | `startAnalysis()` calls GET_ANALYSIS, sets `this.analysisData` from real data | Counts display correctly |
| `loadCurrentTab()` has no analysis restoration | Calls GET_ANALYSIS on load, restores counts if data exists | Popup reopen works |
| Popup calls STORE_ANALYSIS (duplicate) | STORE_ANALYSIS call removed from popup | Single writer: content script only |
| `getNetworkData()` called separately | Network data included in GET_ANALYSIS response | One round-trip instead of two |

## Open Questions

1. **`trackingCount` DOM element presence**
   - What we know: Phase 4 added tracking/ to ZIP output; tracking.test.js exists
   - What's unclear: Whether `popup.html` already has a `<span id="trackingCount">` or similar element that `displayResults()` targets
   - Recommendation: Planner should include a task to audit `popup.html` for the trackingCount element and add it if missing

2. **`sendMessage()` tabId field**
   - What we know: existing cases pass `tabId` via the `data` payload; background extracts `tabId` from `message.data?.tabId ?? sender.tab?.id`
   - What's unclear: exact extraction path in `handleMessage()` — planner should confirm tabId resolution works for GET_ANALYSIS before coding
   - Recommendation: Read `handleMessage()` tabId extraction logic (~line 200) to verify; no changes likely needed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (node environment) |
| Config file | `jest.config.js` |
| Quick run command | `npx jest tests/unit/popup-data-display.test.js --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACK-01 | GET_ANALYSIS response includes `trackingData.dataLayer` array; `displayResults()` shows correct count | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | Wave 0 |
| SCOPE-01 | `analysisMode` is preserved through GET_ANALYSIS summary; popup label updates correctly | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | Wave 0 |
| SCOPE-03 | `assets` arrays are included in GET_ANALYSIS summary; totalAssets count matches | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | Wave 0 |

Inline function copy pattern (established Phase 3 and Phase 4) — test file replicates the GET_ANALYSIS handler logic and startAnalysis() decision branch inline, no module system required.

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/popup-data-display.test.js --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/popup-data-display.test.js` — covers TRACK-01, SCOPE-01, SCOPE-03 (GET_ANALYSIS handler + startAnalysis branch logic)

## Sources

### Primary (HIGH confidence)
- Direct codebase read: `popup.js` lines 102-298, 809-851 — confirmed response shape bug, displayResults pattern, loadCurrentTab structure
- Direct codebase read: `background.js` lines 40-70, 240-308, 543-603 — confirmed analysisData Map, networkRequests Map, existing message handler cases, storeAnalysis implementation
- Direct codebase read: `content.js` lines 1784-1799 — confirmed sendChunked then sendResponse({ success: true }) ordering
- Direct codebase read: `jest.config.js`, `tests/unit/tracking.test.js` — confirmed test framework and inline-copy pattern

### Secondary (MEDIUM confidence)
- Chrome Extension MV3 messaging semantics: `return true` from `onMessage.addListener` keeps channel open for async — consistent with pattern at background.js line 84 and content.js line 1797

## Metadata

**Confidence breakdown:**
- Bug analysis: HIGH — root cause confirmed by direct source read; `response.data` is `undefined` on primary path
- Fix approach: HIGH — all decisions locked in CONTEXT.md; patterns already established in codebase
- Integration points: HIGH — all four touch points (background GET_ANALYSIS case, analyzeWebsiteContent return, startAnalysis flow, loadCurrentTab restoration) confirmed by source read
- Test gaps: HIGH — existing test infra confirmed; only new file is `popup-data-display.test.js`

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable Chrome extension APIs; codebase under active development — re-verify if Phase 4 changes were made after context was gathered)
