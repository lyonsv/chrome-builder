---
phase: 03-scoped-output-and-assets
plan: 04
subsystem: extension-pipeline
tags: [chrome-extension, zip, fflate, binary-assets, scoped-capture, content-script, background-sw]

# Dependency graph
requires:
  - phase: 03-scoped-output-and-assets
    provides: element picker (03-02), component hierarchy (03-03)
  - phase: 01-infrastructure-foundation
    provides: downloadAsZip() scaffold, sendChunked() IPC, fflate vendor
provides:
  - scoped HTML capture via analyzeWebsite(scopeSelector)
  - extractScopedComputedStyles() with full property set (no baseline subtraction)
  - collectAssetUrls() scanning img[src], srcset, background-image, @font-face
  - fetchAssets() parallel binary fetch via background SW with AbortController timeout
  - filename collision resolution via counter suffix (logo.png -> logo-1.png)
  - downloadAsZip() populating html/index.html, html/component-hierarchy.json, assets/* binaries
  - index.json scope metadata (mode, selector, outerHtml, childCount) and failedAssets array
  - FETCH_ASSETS message handler in background.js
affects: [phase 04-tracking-and-events, any future phase using ZIP output]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Binary assets as Uint8Array in fflate fileTree (NOT strToU8)
    - Parallel fetch via Promise.allSettled with per-URL AbortController timeout
    - Filename collision Map tracks seen filenames, appends -N counter suffix
    - Scoped computed styles include full:true flag to signal no baseline subtraction
    - Asset fetch routed through background SW to bypass page CORS policy
    - Content script sends only URL list to background; binary data never crosses IPC

key-files:
  created: []
  modified:
    - content.js
    - background.js
    - popup.js
    - tests/unit/fetch-assets.test.js
    - tests/unit/zip-structure.test.js
    - tests/unit/index-json.test.js

key-decisions:
  - "Jest toHaveProperty() with dots/slashes interprets path as nested — use Object.keys() + toContain() for literal key checks"
  - "Binary asset data stays in background SW through ZIP assembly — never crosses IPC boundary (Pitfall 6 prevention)"
  - "extractScopedComputedStyles() sets full:true on each entry — signals no baseline subtraction for scoped reconstruction"
  - "FETCH_ASSETS triggered from popup before DOWNLOAD_PACKAGE so assets are pre-fetched before ZIP assembly"

patterns-established:
  - "Scoped capture pattern: scopeSelector null = full-page fallback, non-null = subtree-scoped"
  - "Asset fetch separation: content.js collects URLs only, background.js fetches binary data"
  - "Filename dedup: Map(filename -> count) incremented on collision, counter appended before extension"

requirements-completed: [SCOPE-01, SCOPE-02, SCOPE-03]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 03 Plan 04: Scoped Pipeline Integration Summary

**Complete scoped capture pipeline wiring: content.js analyzes subtree HTML/styles/assets, background.js fetches binaries in parallel via SW, downloadAsZip() produces structured ZIP with html/index.html, html/component-hierarchy.json, assets/* binary files, and index.json scope metadata with failedAssets log**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T21:21:59Z
- **Completed:** 2026-03-16T21:26:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- analyzeWebsite(scopeSelector) accepts optional scope, returns scopedHtml + componentHierarchy + assetUrls + scopeMetadata
- extractScopedComputedStyles() captures all properties without global baseline subtraction (full:true per entry)
- collectAssetUrls() scans img[src], picture source[srcset], background-image computed styles, and @font-face stylesheet rules
- fetchAssets() uses Promise.allSettled for parallel fetch with 10s AbortController timeout per URL
- filename collision resolution via Map tracking: logo.png -> logo-1.png -> logo-2.png
- downloadAsZip() extended with html/index.html (scoped HTML), html/component-hierarchy.json, assets/* (Uint8Array binaries), scope metadata, failedAssets
- popup.js downloadPackage() sends FETCH_ASSETS to background before triggering DOWNLOAD_PACKAGE

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement scoped capture in content.js and asset URL collection** - `b21425a` (feat)
2. **Task 2: Implement fetchAssets() in background.js, extend downloadAsZip(), write tests** - `ff668a6` (feat)

## Files Created/Modified
- `content.js` - analyzeWebsite(scopeSelector), extractScopedComputedStyles(), collectAssetUrls(); message listener passes scopeSelector
- `background.js` - extractFilename(), resolveFilename() helpers; fetchAssets() method; FETCH_ASSETS handler; extended downloadAsZip()
- `popup.js` - analyzeWebsiteContent() sends scopeSelector in ANALYZE_WEBSITE; downloadPackage() triggers FETCH_ASSETS before DOWNLOAD_PACKAGE
- `tests/unit/fetch-assets.test.js` - Filename extraction and collision resolution tests (inline pure function copies)
- `tests/unit/zip-structure.test.js` - ZIP directory layout verification via Object.keys() + toContain()
- `tests/unit/index-json.test.js` - Scope metadata shape and failedAssets structure tests

## Decisions Made
- **Jest toHaveProperty limitation:** With keys containing dots (index.json) or slashes (html/), Jest interprets the path as nested — fixed by using Object.keys() + toContain() for literal key membership tests
- **Binary data IPC boundary:** Binary asset Uint8Arrays never sent across IPC — content script sends URL list only, background SW fetches and retains binary data through ZIP assembly (Pitfall 6 from RESEARCH.md)
- **full:true flag on scoped entries:** extractScopedComputedStyles() marks entries with full:true to signal no baseline subtraction — preserves all inherited values for standalone LLM reconstruction

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Jest toHaveProperty() with slash/dot keys in zip-structure.test.js**
- **Found during:** Task 2 (test execution after writing tests)
- **Issue:** Jest's `toHaveProperty('index.json')` interprets the dot as a nested path separator, failing with `Expected path: "json" Received path: []`. Same issue for `html/`, `index.html`, `component-hierarchy.json`, and `logo.png`
- **Fix:** Replaced all `toHaveProperty(key)` calls with `expect(Object.keys(tree)).toContain(key)` pattern for literal key membership checks
- **Files modified:** tests/unit/zip-structure.test.js
- **Verification:** All 46 unit tests pass
- **Committed in:** ff668a6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix required for correct test assertions. No scope creep; tests verify exactly what was specified.

## Issues Encountered
None beyond the Jest key-path deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full scoped capture pipeline complete: picker (03-02) + component hierarchy (03-03) + this plan (03-04) deliver end-to-end scoped ZIP
- Phase 3 requirements SCOPE-01, SCOPE-02, SCOPE-03 all satisfied
- Phase 4 (tracking and events) can proceed — network data already captured full-page, tracking/ directory pre-scaffolded in ZIP

---
*Phase: 03-scoped-output-and-assets*
*Completed: 2026-03-16*
