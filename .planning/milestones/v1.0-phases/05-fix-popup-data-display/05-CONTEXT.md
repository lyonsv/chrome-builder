# Phase 5: Fix Popup Data Display - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the response shape mismatch between the content script and popup.js so the popup correctly shows analysis result counts (tracking events, assets, services, frameworks, network requests). The content script routes data to background via `sendChunked()` then sends `{ success: true }` back to popup — but popup reads `response.data` which is `undefined`, so all counts display as 0.

</domain>

<decisions>
## Implementation Decisions

### Fix approach — Pull pattern (GET_ANALYSIS)
- Popup receives `{ success: true }` from content script, then sends `GET_ANALYSIS` to background to fetch stored data
- `analyzeWebsiteContent()` returns only `{ success: true }` on primary path — no data in the response
- `startAnalysis()` uses explicit two-step flow: trigger analysis → pull complete data via GET_ANALYSIS → display
- Remove the redundant `STORE_ANALYSIS` call from popup (line 232) — content script already stores via background
- Remove `getNetworkData()` from popup — GET_ANALYSIS includes network data
- Background's GET_ANALYSIS handler merges `networkRequests` from its own map alongside analysis data in one response
- On popup load (`loadCurrentTab()`), check background for stored analysis via GET_ANALYSIS — if data exists, populate and display results with download button enabled
- Simplified startAnalysis() flow: `START_ANALYSIS → analyzeWebsiteContent() → GET_ANALYSIS → displayResults()` (only screenshot stays in popup)

### Payload size — Summary response
- GET_ANALYSIS returns only what popup needs for display: url, title, analysisMode, assets (full URL arrays), frameworks, thirdPartyServices, networkRequests, trackingData (full dataLayer array)
- Excludes heavy fields: computedStyles, scopedHtml, componentHierarchy, fetchedAssets — these stay in background for ZIP assembly only
- Asset arrays include full URL/metadata (small), not just counts
- trackingData includes full dataLayer array (typically small, dozens of entries)

### Fallback path consistency
- Fallback paths (DOM inspection, network-only) keep returning data directly — no background routing
- Distinguish primary vs fallback: primary returns `{ success: true }` (signal to pull from background), fallbacks return the actual data object (no success flag)
- `startAnalysis()` checks `result.success` to decide which path: if true → GET_ANALYSIS pull, otherwise → use returned data directly
- `displayResults()` uses null-safe checks for trackingData: `trackingData ? trackingData.dataLayer.length : 0`
- Leave `detectServicesForKnownSites()` as-is — Phase 6 owns TRACK-03 (hardcoded site names)
- Popup-load restoration (GET_ANALYSIS on loadCurrentTab) only works for primary path results stored in background, not fallback results

### Tracking count display
- Show raw dataLayer push count (`dataLayer.length`), not derived event types
- Always show tracking row with 0 if no tracking data — consistent with other result rows, never hide

### Claude's Discretion
- Exact error handling for GET_ANALYSIS failures
- Whether to add progress updates during the GET_ANALYSIS pull step
- Internal structure of the GET_ANALYSIS message handler in background.js

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Response shape (the bug)
- `content.js` lines 1784-1799 — ANALYZE_WEBSITE handler: calls sendChunked then sendResponse({ success: true }) with no data
- `popup.js` lines 251-298 — analyzeWebsiteContent(): reads response.data which is undefined
- `popup.js` lines 200-248 — startAnalysis(): the full analysis flow including redundant STORE_ANALYSIS at line 232

### Data display
- `popup.js` lines 809-851 — displayResults(): reads analysisData fields for counts
- `popup.js` line 850 — trackingCount: reads trackingData.dataLayer.length

### Background storage
- `background.js` lines 547-603 — storeAnalysis(): where content script data is stored
- `background.js` lines 65-69 — MigrationAnalyzer constructor: analysisData Map and networkRequests Map
- `background.js` lines 543-544 — getNetworkData(): returns network requests per tab

### ZIP assembly (excluded from GET_ANALYSIS)
- `background.js` lines 650-767 — downloadAsZip(): uses full analysisData including computedStyles, scopedHtml, fetchedAssets

### Tracking data structure
- `content.js` lines 770-825 — captureTrackingData(): produces { dataLayer, hasGtm, gtm, note }
- `background.js` lines 41-63 — deriveEventSchema(): only used at ZIP time, not for popup display

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sendMessage()` in popup.js: existing helper for chrome.runtime.sendMessage — can be used for GET_ANALYSIS
- `sendChunked()` in content.js: chunked transport for large payloads — already working, no changes needed
- `storeAnalysis()` in background.js: already stores the full analysis data per tab

### Established Patterns
- Message routing: popup → background via `this.sendMessage(action, data)`, background handles in `onMessage` listener with `case` switch
- Null-safe display: displayResults() already uses `?.` and `|| 0` for assets, frameworks, services — extend pattern to trackingData
- Tab-keyed storage: background uses `this.analysisData.get(tabId)` — GET_ANALYSIS follows same pattern

### Integration Points
- New `GET_ANALYSIS` case in background.js message handler (around line 250)
- Modified `analyzeWebsiteContent()` in popup.js — returns { success: true } instead of response.data
- Modified `startAnalysis()` in popup.js — adds GET_ANALYSIS pull step, removes STORE_ANALYSIS and getNetworkData calls
- Modified `loadCurrentTab()` in popup.js — adds GET_ANALYSIS check for restore-on-reopen

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard fix following established patterns in the codebase.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-fix-popup-data-display*
*Context gathered: 2026-03-24*
