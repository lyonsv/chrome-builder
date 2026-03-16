---
phase: 03-scoped-output-and-assets
plan: 02
subsystem: ui
tags: [chrome-extension, element-picker, scripting, content-injection, popup]

# Dependency graph
requires:
  - phase: 03-01
    provides: Jest test infrastructure and SCOPE-01 test stubs
provides:
  - Pick Element button in popup that activates an overlay on the inspected page
  - Injected overlay (div#__gsd_picker__) with blue highlight and tag.class label
  - ELEMENT_SELECTED / PICKER_CANCELLED message protocol between page and popup
  - Selection summary panel showing selector and child count with Clear button
  - Scope state (selectedElement) passed to startAnalysis options as scopeSelector
affects: [03-03, 03-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-contained injected functions — overlay func passed to chrome.scripting.executeScript references no outer scope"
    - "elementFromPoint-under-overlay technique — briefly sets pointerEvents:none on overlay to hit real elements below"
    - "beforeunload overlay cleanup — popup unload removes picker elements from page if picker is still active"

key-files:
  created: []
  modified:
    - popup.html
    - popup.js
    - css/popup.css

key-decisions:
  - "Picker overlay uses fixed inset:0 transparent div at z-index 2147483647 as click/mousemove capture plane"
  - "CSS selector generation: id-first (#id), then tag + dot-joined class names, no complex nth-child paths"
  - "outerHTML truncated to 500 chars in sendMessage to avoid IPC size limits"
  - "updateUI() restores scope-aware label ('Analyze Selected Element') after analysis completes — prevents stomp bug"
  - "Debug buttons (testMinimal, debugStatus, showRequests) removed from popup — production UI only"

patterns-established:
  - "Pattern 1: Injected overlay always self-contained — any picker injected via executeScript must carry its own cleanup"
  - "Pattern 2: Scope state shape — { selector: string, outerHtml: string, childCount: number } used throughout"

requirements-completed: [SCOPE-01]

# Metrics
duration: 20min
completed: 2026-03-16
---

# Phase 3 Plan 02: Element Picker UX Summary

**Popup element picker with injected overlay, blue outline hover highlight, click-to-lock selection, Escape cancel, selection summary panel, and scope-aware analysis button label**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-16T21:15:00Z
- **Completed:** 2026-03-16T21:35:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Pick Element button injects a transparent full-screen overlay onto the inspected page via `chrome.scripting.executeScript`; mouse hover highlights the element under cursor with a 2px blue outline and a floating tag.class label
- Clicking an element sends ELEMENT_SELECTED to the popup with selector, truncated outerHTML, and child count; popup shows selection summary panel and relabels the analysis button to "Analyze Selected Element"
- Pressing Escape sends PICKER_CANCELLED; clicking Clear on the summary panel calls `clearSelection()` which resets all scope state and restores full-page mode
- Scope data (scopeSelector, scopeOuterHtml, scopeChildCount) appended to `startAnalysis` options object so downstream analysis can filter to the selected element
- Removed three development-only debug buttons (testMinimal, debugStatus, showRequests) from both HTML and JS

## Task Commits

1. **Task 1: Add picker button, selection summary HTML, and CSS styles** - `7a1208d` (feat)
2. **Task 2: Implement picker logic in popup.js** - `e261ba7` (feat)

## Files Created/Modified

- `popup.html` - Added Pick Element button (id=pickElement) above Start Analysis; added selection summary panel (id=selectionSummary, hidden by default); removed debug buttons
- `popup.js` - Added scope state (selectedElement, isPickerActive); picker element bindings; pickElement(), onElementSelected(), onPickerCancelled(), clearSelection() methods; ELEMENT_SELECTED/PICKER_CANCELLED message handling; beforeunload overlay cleanup; scope data in startAnalysis options; removed debugStatus(), showAllRequests(), testMinimal()
- `css/popup.css` - Appended .btn-pick-element (default gray, .active blue), .selection-summary panel, .selection-indicator dot, .selection-selector monospace, .btn-clear-selection hover-red

## Decisions Made

- Picker overlay uses `inset: 0` fixed div at z-index 2147483647 as the event capture plane; `pointerEvents: none` is toggled briefly on the overlay during mousemove to call `elementFromPoint` on the real document below
- CSS selector generation is id-first (`#id`), otherwise `tag.class1.class2` — no nth-child path complexity needed for Phase 3 scope targeting
- outerHTML sent to popup is truncated to 500 chars to stay within Chrome IPC size limits
- `updateUI()` restores `'Analyze Selected Element'` (not `'Start Analysis'`) when analysis finishes if an element is selected — prevents label being stomped by the spinner teardown path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed scope-aware label stomp in updateUI()**
- **Found during:** Task 2 (implement picker logic)
- **Issue:** The `else` branch of `updateUI(analyzing)` unconditionally set `startAnalysisText.textContent = 'Start Analysis'`, which would overwrite "Analyze Selected Element" every time an analysis completed while an element was scoped
- **Fix:** Changed to `this.selectedElement ? 'Analyze Selected Element' : 'Start Analysis'`
- **Files modified:** popup.js
- **Verification:** Label correctly reflects scope state after analysis teardown
- **Committed in:** e261ba7 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix required for correct scope state UX. No scope creep.

## Issues Encountered

None — injection pattern and message protocol worked as designed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SCOPE-01 picker entry point fully implemented
- selectedElement state shape `{ selector, outerHtml, childCount }` is the contract for 03-03 (scoped HTML/CSS capture) and 03-04 (scoped asset download)
- The `scopeSelector` option is now in the startAnalysis payload; 03-03 must read it to filter computed styles and DOM output to the selected subtree

---
*Phase: 03-scoped-output-and-assets*
*Completed: 2026-03-16*
