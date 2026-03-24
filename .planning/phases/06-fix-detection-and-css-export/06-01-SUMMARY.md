---
phase: 06-fix-detection-and-css-export
plan: 01
subsystem: infra
tags: [service-detection, network-requests, pattern-matching, chrome-extension]

# Dependency graph
requires:
  - phase: 05-fix-popup-data-display
    provides: working popup display pipeline that receives analysis data
provides:
  - SERVICE_URL_PATTERNS array in background.js (35 services across 9 categories)
  - categorizeServiceName() standalone function in background.js
  - detectServicesFromNetworkRequests() pure function in background.js
  - GET_SERVICES_FROM_NETWORK message handler in background.js handleMessage switch
  - Zero hardcoded site names in popup.js (TRACK-03 satisfied)
affects: [phase-06-02, any phase touching service detection, any phase touching popup fallback paths]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Network-request-based service detection via URL substring matching (replaces hostname map)
    - Inline function copies in test file matching background.js pattern (established Phase 3 convention)
    - GET_SERVICES_FROM_NETWORK message channel for background-to-popup service data

key-files:
  created:
    - tests/unit/detect-services.test.js
  modified:
    - background.js
    - popup.js

key-decisions:
  - "Network URL pattern matching over hostname map for service detection — eliminates TRACK-03 violation, works for any site without prior knowledge"
  - "detectServicesFromNetworkRequests placed as top-level pure function in background.js after deriveEventSchema() — consistent with existing top-level function pattern"
  - "inspectServices() returns only DOM-detected services — no longer augments with known-site-pattern fallback, deduplication now responsibility of background.js"
  - "categorizeServiceName returns 'Other' for unknown services (not 'Unknown') — consistent with 'Other' sentinel value used in popup display"

patterns-established:
  - "Inline function copies in detect-services.test.js: background.js has no module system — test replicates SERVICE_URL_PATTERNS, categorizeServiceName, detectServicesFromNetworkRequests inline"

requirements-completed: [TRACK-03]

# Metrics
duration: 3min
completed: 2026-03-24
---

# Phase 06 Plan 01: Fix Detection and CSS Export Summary

**Network-request-based third-party service detection via URL pattern matching in background.js, replacing popup.js hardcoded hostname map — TRACK-03 fully satisfied.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-24T08:23:15Z
- **Completed:** 2026-03-24T08:26:53Z
- **Tasks:** 2
- **Files modified:** 3 (background.js, popup.js, tests/unit/detect-services.test.js)

## Accomplishments

- Added `SERVICE_URL_PATTERNS` (35 entries), `categorizeServiceName()`, and `detectServicesFromNetworkRequests()` as top-level pure functions in background.js
- Added `GET_SERVICES_FROM_NETWORK` message handler to background.js `handleMessage` switch
- Deleted `detectServicesForKnownSites()` from popup.js — removes all 4 hardcoded site names (example-ecommerce.com, github.com, amazon.com, netflix.com)
- Replaced all 4 call sites of `detectServicesForKnownSites` with network-based alternatives
- 17 new unit tests for network-based detection; all 85 unit tests pass (no regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: detect-services tests** - `6133a4e` (test)
2. **Task 1 GREEN: background.js implementation** - `4a82f8e` (feat)
3. **Task 2: popup.js fallback rewire** - `15ab8da` (feat)

_Note: TDD tasks have multiple commits (test -> feat)_

## Files Created/Modified

- `tests/unit/detect-services.test.js` - 17 unit tests for detectServicesFromNetworkRequests and categorizeServiceName (inline function copy pattern)
- `background.js` - Added SERVICE_URL_PATTERNS, categorizeServiceName(), detectServicesFromNetworkRequests(), GET_SERVICES_FROM_NETWORK case
- `popup.js` - Deleted detectServicesForKnownSites(), rewired all 4 call sites to network-based detection

## Decisions Made

- Network URL pattern matching over hostname map — eliminates TRACK-03 violation, works for any site without prior knowledge
- detectServicesFromNetworkRequests placed as top-level pure function in background.js after deriveEventSchema() — consistent with existing top-level function pattern
- inspectServices() returns only DOM-detected services — no longer augments with known-site-pattern fallback
- categorizeServiceName returns 'Other' for unknown services (not 'Unknown') — consistent with popup display sentinel

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed additional call sites for detectServicesForKnownSites beyond the one in the plan**

- **Found during:** Task 2 (Delete detectServicesForKnownSites and wire fallback)
- **Issue:** The plan specified one call site to replace (line 332 in performFallbackAnalysis), but grep revealed 3 additional call sites: line 536 and 538 in inspectServices(), and line 612 in getPageInfoWithoutContentScript(). Leaving them would leave the function referenced despite it being deleted.
- **Fix:** Replaced all 4 call sites. inspectServices() now returns only DOM-detected services. getPageInfoWithoutContentScript() no longer calls detectServicesForKnownSites.
- **Files modified:** popup.js
- **Verification:** grep returns zero matches for detectServicesForKnownSites in popup.js; all 85 tests pass
- **Committed in:** 15ab8da (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - additional call sites found and removed)
**Impact on plan:** Required fix — deleting the function without removing all call sites would break popup.js at runtime. No scope creep.

## Issues Encountered

None beyond the additional call sites documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TRACK-03 is fully satisfied: zero hardcoded site names in popup.js, background.js, or content.js
- Phase 06 Plan 02 (CSS export) can proceed independently
- GET_SERVICES_FROM_NETWORK message channel is in place and tested

---
*Phase: 06-fix-detection-and-css-export*
*Completed: 2026-03-24*
