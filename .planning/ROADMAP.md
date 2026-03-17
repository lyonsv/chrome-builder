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
- [ ] **Phase 4: Tracking Plan** - dataLayer history, GTM container config, and GA4 event schema extraction

## Phase Details

### Phase 1: Infrastructure Foundation
**Goal**: The extension reliably completes long-running analysis sessions, transports large payloads without crashing, exports a multi-file directory as a single ZIP download, and contains no hardcoded site names anywhere in the codebase
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, TRACK-03
**Success Criteria** (what must be TRUE):
  1. User can trigger a full analysis on a large page and the extension completes without losing state mid-way, even if the service worker would otherwise have gone dormant
  2. Computed-style-sized payloads (2-5 MB) transfer from content script to popup without the message channel crashing or stalling the page
  3. Clicking download produces one ZIP file containing all output files, not a sequence of OS save dialogs
  4. Searching the entire codebase for any known site name (e.g. site4, Site1, Site2) returns zero matches — all detection is expressed as observable patterns only
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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

Note: Phase 4 depends only on Phase 1 and can be reprioritised ahead of Phase 3 if tracking migration is higher priority than component scoping.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Infrastructure Foundation | 4/4 | Complete   | 2026-03-13 |
| 2. Style Capture | 0/2 | Not started | - |
| 3. Scoped Output and Assets | 1/4 | In Progress|  |
| 4. Tracking Plan | 1/2 | In Progress|  |
