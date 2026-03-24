---
phase: 06-fix-detection-and-css-export
plan: 02
subsystem: infra
tags: [css, zip, background-service-worker, asset-fetching, fflate]

# Dependency graph
requires:
  - phase: 03-scoped-output-and-assets
    provides: fetchAssets() pattern, downloadAsZip() structure, ZIP scaffold with css/ directory
  - phase: 04-tracking-plan
    provides: indexData mutation ordering (stages flags before index.json encoding)
provides:
  - extractCssUrlsFromNetworkRequests() — three-strategy CSS URL detection from network log
  - extractCssUrlsFromAnalysisData() — CSS URL extraction from DOM-inspection analysisData
  - css/ directory in ZIP populated with fetched external stylesheet files
  - indexData.stages.css flag reflecting actual CSS fetch success
  - indexData.css summary (fileCount, failedCount, files array)
  - CSS fetch failures recorded in indexData.failedAssets
affects:
  - 06-01-agnostic-detection (parallel plan, independent)
  - future phases consuming ZIP output

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Three-strategy CSS detection (type field > content-type header > URL pattern)
    - DOM-inspection primary path with network request log fallback for CSS URL discovery
    - indexData mutation ordering — all stage flags set before index.json encoding

key-files:
  created:
    - tests/unit/css-export.test.js
  modified:
    - background.js

key-decisions:
  - "extractCssUrlsFromNetworkRequests uses three-strategy detection: webRequest type field (most reliable) > content-type response header > .css URL pattern (fallback)"
  - "CSS URL extraction uses analysisData (DOM path) as primary source with networkData as fallback — mirrors how content.js collects richer DOM-derived data"
  - "failedAssets.push(...failedCss) — CSS failures merged into same failedAssets array as binary asset failures for consistent index.json error reporting"
  - "indexData.css summary added (fileCount, failedCount, files) for LLM consumers to understand CSS capture state"

patterns-established:
  - "Inline function copies in test files — css-export.test.js replicates extractCssUrlsFromNetworkRequests and extractCssUrlsFromAnalysisData inline, matching project pattern (no module system in background.js)"
  - "Fallback chain pattern: primary DOM source first, network log second — used for CSS URL discovery"

requirements-completed: [SCOPE-02]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 6 Plan 02: CSS Export Summary

**CSS URL extraction with three-strategy detection and ZIP population via fetchAssets() pattern, closing SCOPE-02 gap for the css/ directory**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T08:23:08Z
- **Completed:** 2026-03-24T08:27:01Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `extractCssUrlsFromNetworkRequests()` with three detection strategies (webRequest type field, content-type header, .css URL pattern) and deduplication
- Added `extractCssUrlsFromAnalysisData()` filtering inline, blob:, and null-URL entries
- Populated `css/` directory in ZIP with fetched external stylesheets using existing `fetchAssets()` pattern
- CSS failures recorded in `failedAssets` for consistent error reporting in index.json
- `indexData.stages.css` and `indexData.css` summary fields updated before index.json encoding
- 16 unit tests covering all behaviors and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CSS URL extraction function with tests** - `83fbfa2` (feat)
2. **Task 2: Populate css/ directory in downloadAsZip with fetched stylesheets** - `cf2711a` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified
- `background.js` - Added extractCssUrlsFromNetworkRequests(), extractCssUrlsFromAnalysisData(), and CSS fetch block in downloadAsZip()
- `tests/unit/css-export.test.js` - 16 unit tests for CSS URL extraction with inline function copies

## Decisions Made
- Three-strategy CSS detection chosen for robustness: webRequest type field is set at request time by Chrome and is most reliable; content-type header covers edge cases where type is miscategorized; .css URL pattern provides a last-resort fallback
- DOM analysisData chosen as primary CSS source (richer, deduplicated at DOM inspection time); network request log used as fallback when content script unavailable or DOM inspection failed
- CSS failures merged into the shared `failedAssets` array rather than a separate structure — keeps index.json error reporting consistent with Phase 3 asset pattern

## Deviations from Plan

**Rule 3 (Blocking):** Worktree branch based on initial commit — rebased onto main before starting implementation. The worktree branch `worktree-agent-a3dc0221` was at the initial commit (10c7457) while the plan required the Phase 3-5 codebase (fetchAssets, downloadAsZip). Rebased to pick up all prior phase work.

---

**Total deviations:** 1 (blocking — worktree rebase required)
**Impact on plan:** Necessary to access the current codebase. No scope changes.

## Issues Encountered
- Worktree branch was based on initial commit, not current main. Resolved by rebasing `worktree-agent-a3dc0221` onto main before implementation.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SCOPE-02 gap closed: css/ directory in ZIP now populated with fetched external stylesheet files
- Fallback network-log path ensures CSS capture even when DOM inspection is unavailable
- Plan 06-01 (agnostic detection cleanup) runs in parallel and is independent
- Full test suite passes (84 tests, 7 suites)

## Self-Check: PASSED

- background.js: FOUND
- tests/unit/css-export.test.js: FOUND
- Commit 83fbfa2: FOUND
- Commit cf2711a: FOUND
- extractCssUrlsFromNetworkRequests: 2 occurrences (definition + call)
- extractCssUrlsFromAnalysisData: 2 occurrences (definition + call)
- fileTree['css/'] = cssDir: 1 occurrence
- stages.css: 1 occurrence
- failedAssets.push(...failedCss): 1 occurrence

---
*Phase: 06-fix-detection-and-css-export*
*Completed: 2026-03-24*
