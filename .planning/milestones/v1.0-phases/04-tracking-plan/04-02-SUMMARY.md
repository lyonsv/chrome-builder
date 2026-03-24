---
phase: 04-tracking-plan
plan: 02
subsystem: tracking
tags: [dataLayer, gtm, zip, schema-derivation, popup-ui, fflate]

# Dependency graph
requires:
  - phase: 04-01
    provides: captureTrackingData() in content.js capturing dataLayer and GTM container info
  - phase: 03-scoped-output-and-assets
    provides: downloadAsZip() and fileTree assembly pattern in background.js
provides:
  - deriveEventSchema() pure function in background.js for deduplicating dataLayer events
  - tracking/ directory in ZIP (events.json + schema.json)
  - indexData.tracking summary (hasGtm, containerId, eventCount, uniqueEventNames)
  - indexData.stages.tracking flag
  - Popup "Tracking Events" result row showing dataLayer entry count
affects:
  - Any future plan consuming ZIP output (tracking data now present)
  - Any plan adding more index.json fields (index.json now encoded last)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - deriveEventSchema as standalone pure function before class definition (matches uint8ArrayToBase64 pattern)
    - fileTree['index.json'] encoded LAST after all indexData mutations to capture all summary fields
    - Inline function copies in tests for functions without module system (established Phase 3 pattern)

key-files:
  created: []
  modified:
    - background.js
    - popup.html
    - popup.js

key-decisions:
  - "fileTree['index.json'] encoding moved from fileTree initialization to after all content blocks — required for tracking summary to appear in index.json (Pitfall 2)"
  - "Always write tracking/ files even when no data — consistent with network/ pattern, empty events.json is valid output"
  - "trackingCount display uses this.analysisData.trackingData directly — matches established pattern in displayResults()"

patterns-established:
  - "Pattern: index.json encoded last in downloadAsZip() — all content blocks must run before index.json encoding"

requirements-completed: [TRACK-01]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 4 Plan 02: Tracking Background Processing and Popup Display Summary

**Event schema derivation in background.js with ZIP writes to tracking/ directory, index.json tracking summary, and popup Tracking Events count display**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T18:09:09Z
- **Completed:** 2026-03-17T18:10:57Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `deriveEventSchema()` pure function to background.js that deduplicates raw dataLayer entries into a typed event schema with property key unions and first-occurrence example values
- Modified `downloadAsZip()` to write `tracking/events.json` (raw dataLayer snapshot) and `tracking/schema.json` (derived schema + GTM info + analytics.detected from Phase 1) to ZIP
- Fixed Pitfall 2: moved `fileTree['index.json']` encoding to after all content blocks so `indexData.tracking` summary (hasGtm, containerId, eventCount, uniqueEventNames) is captured
- Added "Tracking Events:" result row to popup UI wired to `trackingData.dataLayer.length`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deriveEventSchema helper and tracking ZIP writes** - `6dcf3d3` (feat)
2. **Task 2: Add Tracking Events result row to popup HTML and JS** - `61ac899` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `background.js` - Added `deriveEventSchema()` standalone function, tracking block in `downloadAsZip()`, moved `fileTree['index.json']` encoding to end
- `popup.html` - Added Tracking Events result-item div with `trackingCount` span after servicesCount row
- `popup.js` - Added `this.trackingCount` element ref and `totalTrackingEvents` count update in `displayResults()`

## Decisions Made
- `fileTree['index.json']` encoding moved from initial fileTree object to the last line before `fflate.zipSync` — this ensures all `indexData` mutations (including `indexData.tracking`) are captured before encoding
- Tracking files always written (even with empty dataLayer) to maintain consistent ZIP structure, matching the network/ pattern
- `this.analysisData.trackingData` used directly in popup.js `displayResults()` — `trackingData` was not already destructured from `this.analysisData` at the top of the method, accessed directly for clarity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Full tracking capture pipeline complete: content.js captures (Plan 01), background.js processes and writes (this plan), popup displays count
- schema.json includes analytics.detected referencing Phase 1 third-party service detection
- TRACK-01 requirement fulfilled
- All 59 unit tests passing with no regressions

## Self-Check: PASSED

- background.js: FOUND
- popup.html: FOUND
- popup.js: FOUND
- 04-02-SUMMARY.md: FOUND
- Commit 6dcf3d3 (Task 1): FOUND
- Commit 61ac899 (Task 2): FOUND

---
*Phase: 04-tracking-plan*
*Completed: 2026-03-17*
