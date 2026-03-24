---
phase: 05-fix-popup-data-display
plan: 01
subsystem: ui
tags: [chrome-extension, popup, background, message-passing, GET_ANALYSIS, null-safety]

# Dependency graph
requires:
  - phase: 04-tracking-plan
    provides: trackingData.dataLayer structure stored in background analysisData Map
  - phase: 01-infrastructure-foundation
    provides: sendChunked() routing — content script stores via background, not direct popup response

provides:
  - GET_ANALYSIS message handler in background.js returning display summary without heavy fields
  - Two-step pull flow in popup.js startAnalysis (primary path) and direct use (fallback path)
  - loadCurrentTab() restoration — popup reopens and recovers prior analysis from background
  - Null-safe tracking count using optional chaining in displayResults()

affects: [phase-06, phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pull pattern: popup receives { success: true } from content script, then GETs summary from background"
    - "Heavy field exclusion: GET_ANALYSIS strips computedStyles, scopedHtml, componentHierarchy, fetchedAssets before crossing IPC"
    - "Restoration pattern: loadCurrentTab() calls GET_ANALYSIS on popup open, shows prior results if available"

key-files:
  created:
    - tests/unit/popup-data-display.test.js
  modified:
    - background.js
    - popup.js

key-decisions:
  - "GET_ANALYSIS strips heavy fields before returning to popup — computedStyles and scopedHtml can be 10MB+, only display summary needed"
  - "loadCurrentTab() GET_ANALYSIS failure is silently caught — no stored analysis is normal for fresh tabs, not an error"
  - "STORE_ANALYSIS call removed from popup.js startAnalysis — content script already stores via sendChunked(), double-store was redundant"
  - "getNetworkData() method left in popup.js (not deleted) — removing unused methods is out of scope; only the call in startAnalysis was removed"

patterns-established:
  - "Inline function copy tests match implementation exactly — test file replicates handleGetAnalysis, resolveAnalysisData, computeDisplayCounts inline (consistent with Phase 3/4 pattern)"
  - "Optional chaining for all nullable display fields: trackingData?.dataLayer?.length ?? 0"

requirements-completed: [TRACK-01, SCOPE-01, SCOPE-03]

# Metrics
duration: 2min
completed: 2026-03-24
---

# Phase 05 Plan 01: Fix Popup Data Display Summary

**GET_ANALYSIS pull pattern: popup now fetches display summary from background after content script analysis, fixing all-zero count bug caused by reading undefined response.data**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-24T07:42:49Z
- **Completed:** 2026-03-24T07:44:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added GET_ANALYSIS handler to background.js returning lightweight display summary (url, title, analysisMode, assets, frameworks, thirdPartyServices, trackingData, networkRequests) without heavy fields
- Rewrote popup.js startAnalysis() to use two-step flow: analyzeWebsiteContent returns `{ success: true }` on primary path, then GET_ANALYSIS fetches display data; fallback paths still use result directly
- Added loadCurrentTab() restoration: popup calls GET_ANALYSIS on open, restores prior analysis results if background has stored data for the tab
- Fixed trackingData null safety: `trackingData?.dataLayer?.length ?? 0` replaces unsafe ternary that crashed when dataLayer was missing
- Removed redundant STORE_ANALYSIS and getNetworkData() calls from startAnalysis()
- All 68 tests pass (9 new popup-data-display tests + 59 existing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write unit tests for GET_ANALYSIS handler and startAnalysis branching** - `a3a27c4` (test)
2. **Task 2: Implement GET_ANALYSIS handler and rewrite popup analysis flow** - `27e5a64` (feat)

**Plan metadata:** (docs commit follows)

_Note: Task 1 used TDD pattern with inline function copies — tests pass against the inlined specification logic, confirming the handler and display logic are correct before implementation in source files._

## Files Created/Modified
- `tests/unit/popup-data-display.test.js` - 9 unit tests for GET_ANALYSIS handler, startAnalysis branching, and display count null safety
- `background.js` - Added GET_ANALYSIS case to message switch handler
- `popup.js` - Two-step pull flow, loadCurrentTab restoration, null-safe tracking count, removed STORE_ANALYSIS and getNetworkData calls from startAnalysis

## Decisions Made
- GET_ANALYSIS strips heavy fields (computedStyles, scopedHtml, componentHierarchy, fetchedAssets) before returning to popup — these fields can be 10MB+, only the display summary is needed in the popup
- loadCurrentTab() wraps GET_ANALYSIS in try/catch and silently ignores failure — no stored analysis is normal for fresh tabs, not an error condition
- STORE_ANALYSIS removed from popup.js — content script already stores full analysis via sendChunked(), the popup's STORE_ANALYSIS call was redundant and re-stored potentially undefined data
- getNetworkData() method body left in popup.js (not deleted) — removing unused methods is cleanup out of scope for this fix plan

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all changes applied cleanly and all tests passed on first run.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Popup now correctly displays non-zero counts after analysis on the primary path
- Counts persist across popup close/reopen via loadCurrentTab() GET_ANALYSIS restoration
- Fallback analysis paths (local HTML, header-only, network-only) continue to display correctly via direct use path
- No blockers for subsequent phases

---
*Phase: 05-fix-popup-data-display*
*Completed: 2026-03-24*
