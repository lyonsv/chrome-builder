---
phase: 04-tracking-plan
plan: 01
subsystem: tracking
tags: [dataLayer, gtm, gtm-capture, unit-testing, jest, chrome-extension, content-script]

# Dependency graph
requires:
  - phase: 03-scoped-output-and-assets
    provides: WebsiteAnalyzer class structure, test pattern (inline function copies), analyzeWebsite() return object
provides:
  - captureTrackingData() method on WebsiteAnalyzer — snapshots window.dataLayer with deep clone + GTM container extraction
  - trackingData top-level key on analyzeWebsite() return object
  - 13 unit tests covering captureTrackingData and deriveEventSchema behaviors
affects: [04-02, background.js ZIP assembly, schema derivation, index.json tracking summary]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inline function copy testing — test file replicates function logic inline, no module imports (established Phase 3 pattern, extended to Phase 4)
    - Synchronous capture after Promise.all — tracking capture called after async parallel block completes, not inside it
    - Deep clone with per-entry fallback — JSON.parse/stringify whole array first, per-entry fallback for circular refs

key-files:
  created:
    - tests/unit/tracking.test.js
  modified:
    - content.js

key-decisions:
  - "Inline function copies in tests — content.js has no module system; test file replicates captureTrackingData and deriveEventSchema inline to avoid build tooling"
  - "captureTrackingData placed after categorizeService() and before extractMetadata() in WebsiteAnalyzer class"
  - "trackingData assigned synchronously after moduleFederationData — not inside Promise.all, consistent with other synchronous extractions"

patterns-established:
  - "Pattern: Script tag fallback for GTM ID when window.google_tag_manager absent — document.querySelector('script[src*=\"gtm.js?id=\"]') with regex match"
  - "Pattern: Circular ref fallback — try JSON.parse(JSON.stringify(entry)) per entry, catch returns { _serializationError: true, keys: [...] }"

requirements-completed: [TRACK-01]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 4 Plan 01: Tracking Data Capture Summary

**captureTrackingData() on WebsiteAnalyzer snapshots window.dataLayer with deep clone + GTM container ID extraction, wired into analyzeWebsite() return object, with 13 unit tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T18:04:53Z
- **Completed:** 2026-03-17T18:06:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `tests/unit/tracking.test.js` with 13 tests covering captureTrackingData (6 cases), deriveEventSchema (5 cases), schema.json shape, and index.json tracking summary
- Added `captureTrackingData()` method to WebsiteAnalyzer with Array.isArray guard, JSON deep clone, circular-ref per-entry fallback, GTM container extraction from `window.google_tag_manager`, and script tag src fallback
- Wired `captureTrackingData()` call into `analyzeWebsite()` and added `trackingData` as top-level key in return object
- Full test suite remains green: 59 tests passing across 5 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tracking test file with all test cases** - `41ed214` (test)
2. **Task 2: Add captureTrackingData method to content.js and wire into analyzeWebsite** - `bfa5ceb` (feat)

**Plan metadata:** (docs commit — see below)

_Note: Task 1 is TDD; inline functions in test file served as both RED specification and GREEN reference implementation for Task 2._

## Files Created/Modified

- `tests/unit/tracking.test.js` - 13 unit tests for captureTrackingData and deriveEventSchema using inline function copies; covers all TRACK-01 behaviors
- `content.js` - Added captureTrackingData() method (65 lines) after categorizeService(); added synchronous call and trackingData key in analyzeWebsite()

## Decisions Made

None beyond plan spec — implementation followed the plan's code exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `captureTrackingData()` is complete and tested — ready for Phase 4 Plan 02 (background.js ZIP assembly: `deriveEventSchema()`, `tracking/events.json`, `tracking/schema.json`, index.json summary)
- `trackingData` key is now on the analysis result object and will route through existing `sendChunked()` transport automatically
- `deriveEventSchema()` inline copy in test file provides reference implementation for background.js Task

## Self-Check: PASSED

All files created and commits verified:
- tests/unit/tracking.test.js: FOUND
- content.js: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit 41ed214 (test): FOUND
- Commit bfa5ceb (feat): FOUND

---
*Phase: 04-tracking-plan*
*Completed: 2026-03-17*
