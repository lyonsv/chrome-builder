# Requirements: Website Asset Capture Extension

**Defined:** 2026-03-13
**Core Value:** An LLM can be handed any component's output and know exactly how to rebuild it — the right HTML structure, the right computed styles, the right assets — with no guessing.

## v1 Requirements

Requirements for this milestone. Each maps to a roadmap phase.

### Infrastructure

- [x] **INFRA-01**: Extension maintains analysis session across service worker dormancy events without data loss (long-lived port or `storage.session` flush)
- [x] **INFRA-02**: Large payloads (computed styles) are transported from content script to popup/background via chunked streaming rather than a single `sendMessage` call, staying under the ~5–10MB IPC limit
- [x] **INFRA-03**: Output directory is packaged as a single ZIP download (using a pure-JS library, no build system) rather than one OS dialog per file

### Style Capture

- [x] **STYLE-01**: Extension captures `getComputedStyle` for every DOM element on the page, deduplicated by element signature (tag + class + key properties), filtered to ~60 design-system-relevant CSS properties
- [x] **STYLE-02**: Extension captures interaction-state CSS rules (`:hover`, `:focus`, `:active`, `:disabled`) for elements by inspecting stylesheet rule lists, not just default computed state
- [x] **STYLE-03**: Extension captures both CSS custom property names (`--color-primary`) and their resolved values (`#E8462A`) so an LLM understands the design token vocabulary alongside the raw values

### Scope & Output

- [x] **SCOPE-01**: User can click to select a specific element or component on the page, and the extension captures only that subtree's HTML, computed styles, and assets — scoped output rather than full-page dump
- [x] **SCOPE-02**: Extension exports a structured directory: `index.json` (manifest + summary), `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` — replacing the existing single JSON bundle
- [x] **SCOPE-03**: Extension fetches and saves actual image, font, and icon files (routed through the background service worker to bypass CORS) rather than capturing URL references only

### Tracking & Detection

- [x] **TRACK-01**: Extension captures `dataLayer` push history and GTM event schema — what events fire, what properties they carry, and which user interactions trigger them
- [x] **TRACK-02**: Extension annotates the DOM tree with logical component boundaries (React fiber internals, `data-` attributes, BEM class patterns) to produce a named component hierarchy alongside the raw HTML
- [x] **TRACK-03**: All detection logic (framework detection, third-party services, module federation patterns, component architecture) is expressed as generic observable patterns with no hardcoded site names in the codebase

## v2 Requirements

### Visual Fidelity

- **VIS-01**: Capture responsive breakpoint variants — capture computed styles at multiple viewport widths for the same component
- **VIS-02**: Visual screenshot scoping — capture a screenshot cropped to the selected component alongside the structured data

### Design Tokens

- **TOKEN-01**: Extract a standalone design token manifest (color palette, type scale, spacing scale, shadow definitions) from the full page's CSS variables and computed values

## Out of Scope

| Feature | Reason |
|---------|---------|
| Database / MCP integration | This tool captures and exports; ingestion into a DB or MCP is a separate downstream tool |
| Site-specific hardcoding | Detection logic must be generic; target sites are handled by observable patterns, not named constants |
| Full JS runtime tracing | Capturing runtime execution behavior is out of scope; observable DOM and network signals are sufficient |
| Mobile app | Web extension only |
| Auth-gated asset downloading | Assets requiring session cookies are out of scope for v1; only publicly fetchable assets are downloaded |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| TRACK-03 | Phase 6 | Complete |
| STYLE-01 | Phase 7 | Complete |
| STYLE-02 | Phase 7 | Complete |
| STYLE-03 | Phase 7 | Complete |
| SCOPE-01 | Phase 3 / Phase 5 | Complete |
| SCOPE-02 | Phase 6 | Complete |
| SCOPE-03 | Phase 3 / Phase 5 | Complete |
| TRACK-02 | Phase 3 | Complete |
| TRACK-01 | Phase 4 / Phase 5 | Complete |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓
- Gap closure phases added: 5, 6, 7 (from v1.0 audit 2026-03-18)

---
*Requirements defined: 2026-03-13*
*Last updated: 2026-03-13 after roadmap creation*
