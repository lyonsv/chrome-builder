# Roadmap: Website Asset Capture Extension

## Overview

This milestone transforms the existing extension's single-JSON output into a fully LLM-consumable capture package. Phase 1 establishes the infrastructure that makes all subsequent phases safe to ship — service worker reliability, chunked transport, and ZIP-based directory output. Phase 2 adds computed style extraction, the highest-value gap for design system reconstruction. Phase 3 combines scoped capture, structured directory output, actual asset downloading, and component boundary annotation into the complete LLM-ready output format. Phase 4 adds tracking plan extraction as a self-contained differentiator. After all four phases, an LLM can be handed any component's output and know exactly how to rebuild it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Infrastructure Foundation** - Service worker reliability, chunked IPC transport, ZIP directory output, and agnostic detection cleanup (completed 2026-03-13)
- [ ] **Phase 2: Style Capture** - Computed styles per element, interaction-state rules, and CSS custom property resolution
- [ ] **Phase 3: Scoped Output and Assets** - Element-scoped capture, structured directory export, actual asset downloading, and component boundary annotation
- [x] **Phase 4: Tracking Plan** - dataLayer history, GTM container config, and GA4 event schema extraction (completed 2026-03-17)

## Phase Details

### Phase 1: Infrastructure Foundation
**Goal**: The extension reliably completes long-running analysis sessions, transports large payloads without crashing, exports a multi-file directory as a single ZIP download, and contains no hardcoded site names anywhere in the codebase
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, TRACK-03
**Success Criteria** (what must be TRUE):
  1. User can trigger a full analysis on a large page and the extension completes without losing state mid-way, even if the service worker would otherwise have gone dormant
  2. Computed-style-sized payloads (2-5 MB) transfer from content script to popup without the message channel crashing or stalling the page
  3. Clicking download produces one ZIP file containing all output files, not a sequence of OS save dialogs
  4. Searching the entire codebase for any known site name (e.g. iStockPhoto, Getty, Shutterstock) returns zero matches — all detection is expressed as observable patterns only
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — Remove all hardcoded site names (TRACK-03)
- [ ] 01-02-PLAN.md — Service worker keep-alive and session checkpoints (INFRA-01)
- [ ] 01-03-PLAN.md — fflate ZIP download replacing single-JSON output (INFRA-03)
- [ ] 01-04-PLAN.md — Chunked IPC transport with progress and retry UI (INFRA-02)

### Phase 2: Style Capture
**Goal**: Users can export a deduplicated map of computed styles for every element on a page, including interaction-state rules and resolved CSS custom property values, structured so an LLM understands which styles apply to which element
**Depends on**: Phase 1
**Requirements**: STYLE-01, STYLE-02, STYLE-03
**Success Criteria** (what must be TRUE):
  1. The exported output contains a computed-styles file where each unique element signature (tag + class combination) maps to ~60 design-system-relevant CSS properties with resolved values — identical siblings appear once, not hundreds of times
  2. The exported output includes interaction-state rules so an LLM can see what a button looks like on `:hover` and `:focus`, not just its default state
  3. The exported output contains both the CSS custom property name (e.g. `--color-primary`) and its resolved value (e.g. `#E8462A`) for every token in use, so the design token vocabulary is legible alongside raw computed values
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Test fixture + core DOM walk, deduplication, and computed style capture (STYLE-01)
- [ ] 02-02-PLAN.md — Pseudo-class state extraction, CSS token vocabulary, and ZIP integration (STYLE-02, STYLE-03)

### Phase 3: Scoped Output and Assets
**Goal**: Users can capture a single component or element subtree and receive a structured directory — not a full-page dump — containing HTML, styles, actual downloaded asset files, and a component hierarchy annotation, sized for an LLM context window
**Depends on**: Phase 2
**Requirements**: SCOPE-01, SCOPE-02, SCOPE-03, TRACK-02
**Success Criteria** (what must be TRUE):
  1. User can click to select a specific element and the extension captures only that subtree — the output HTML, styles, and assets are scoped to the selection, not the full page
  2. The downloaded ZIP contains a structured directory: `index.json` at the root plus `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` subdirectories — not a single flat JSON blob
  3. Image, font, and icon files are present as actual binary files in `/assets/` — not just URL references — and were fetched through the background service worker to bypass CORS
  4. The component hierarchy output annotates DOM elements with logical component names derived from React fiber internals, Vue bindings, Angular metadata, or `data-` attribute patterns — making nesting structure legible to an LLM without manual annotation
**Plans**: 4 plans

Plans:
- [ ] 03-01-PLAN.md — Jest test infrastructure and test stubs for all Phase 3 requirements (SCOPE-01, SCOPE-02, SCOPE-03, TRACK-02)
- [ ] 03-02-PLAN.md — Element picker UX: popup button, injected overlay, selection summary (SCOPE-01)
- [ ] 03-03-PLAN.md — Component hierarchy detection: React, Vue, Angular, data-attr, BEM (TRACK-02)
- [ ] 03-04-PLAN.md — Scoped capture, binary asset download, and structured ZIP output (SCOPE-01, SCOPE-02, SCOPE-03)

### Phase 4: Tracking Plan
**Goal**: Users can export a complete tracking plan alongside the visual capture — what events fire, what properties they carry, and which interactions trigger them — so analytics instrumentation can be reproduced without manual reverse-engineering
**Depends on**: Phase 1
**Requirements**: TRACK-01
**Success Criteria** (what must be TRUE):
  1. The `/tracking/` directory contains a structured event schema: the dataLayer push history, GTM container configuration, and a map of which user interactions trigger which events with which properties
  2. The tracking output is structured so an LLM can reproduce the analytics instrumentation for a migrated component without any additional reverse-engineering of the original site
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Tests + captureTrackingData in content.js (TRACK-01)
- [ ] 04-02-PLAN.md — Schema derivation, ZIP integration, and popup UI (TRACK-01)

### Phase 5: Fix Popup Data Display
**Goal:** Popup correctly shows analysis result counts (tracking events, assets, services) by fixing the response shape mismatch between the content script and popup.js
**Depends on**: Phase 4
**Requirements**: TRACK-01, SCOPE-01, SCOPE-03
**Gap Closure:** Closes gaps from v1.0 audit — Integration Issue A
**Plans:** 1/1 plans complete

Plans:
- [x] 05-01-PLAN.md — Add GET_ANALYSIS pull pattern: background handler + popup two-step flow + loadCurrentTab restoration (TRACK-01, SCOPE-01, SCOPE-03)

### Phase 6: Fix Detection and CSS Export
**Goal:** Remove hardcoded site names from popup.js fallback path and write fetched CSS content into the css/ ZIP directory
**Depends on**: Phase 1, Phase 3
**Requirements**: TRACK-03, SCOPE-02
**Gap Closure:** Closes gaps from v1.0 audit — Integration Issues B + C

Plans:
- [ ] 06-01-PLAN.md — Replace detectServicesForKnownSites() hostname map with generic signal-based detection (TRACK-03)
- [ ] 06-02-PLAN.md — Write fetched stylesheet content into css/ directory entries in ZIP (SCOPE-02)

### Phase 7: Verify Phase 2 Style Capture
**Goal:** Produce a formal VERIFICATION.md for Phase 2, confirming STYLE-01, STYLE-02, and STYLE-03 are satisfied by the existing implementation
**Depends on**: Phase 2
**Requirements**: STYLE-01, STYLE-02, STYLE-03
**Gap Closure:** Closes gaps from v1.0 audit — Phase 2 unverified

Plans:
- [ ] 07-01-PLAN.md — Write verification tests and create VERIFICATION.md for Phase 2 style capture

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

Note: Phase 4 depends only on Phase 1 and can be reprioritised ahead of Phase 3 if tracking migration is higher priority than component scoping. Phases 5–7 are gap closure phases added after v1.0 milestone audit.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 4/4 | Complete   | 2026-03-13 |
| 2. Style Capture | 0/2 | Not started | - |
| 3. Scoped Output and Assets | 1/4 | In Progress|  |
| 4. Tracking Plan | 2/2 | Complete   | 2026-03-17 |
| 5. Fix Popup Data Display | 1/1 | Complete   | 2026-03-24 |
| 6. Fix Detection and CSS Export | 0/2 | Pending | - |
| 7. Verify Phase 2 Style Capture | 0/1 | Pending | - |
