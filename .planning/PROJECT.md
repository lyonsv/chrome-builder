# Website Asset Capture Extension

## What This Is

A Chrome extension that captures a comprehensive snapshot of any website — HTML, CSS, computed styles, assets, network requests, third-party tools, and tracking plans — and exports them as a structured directory of files that an LLM can consume to reconstruct the site's UI with pixel-perfect accuracy. Built for design system extraction and frontend migration workflows, not tied to any specific site.

## Core Value

An LLM can be handed any component's output and know exactly how to rebuild it — the right HTML structure, the right computed styles, the right assets — with no guessing.

## Requirements

### Validated

- ✓ HTML extraction (full DOM, inline and external) — existing
- ✓ CSS file discovery (linked stylesheets + inline `<style>` tags with content) — existing
- ✓ JavaScript file discovery (external + inline) — existing
- ✓ Image and font URL discovery from DOM and `@font-face` rules — existing
- ✓ Framework detection (React, Vue, Angular, Next.js, Module Federation) — existing
- ✓ Third-party service identification (analytics, ads, payments, CDNs, etc.) — existing
- ✓ Performance metrics via Navigation/Resource Timing API — existing
- ✓ Metadata extraction (SEO, Open Graph, Twitter Card, viewport) — existing
- ✓ Network request capture via `chrome.webRequest` — existing
- ✓ Next.js SSR data extraction (`__NEXT_DATA__`, Apollo state, GraphQL queries) — existing
- ✓ Module Federation / microfrontend detection (`window.experiences`, remote entries) — existing
- ✓ Single JSON bundle download — existing

### Active

- [x] Computed styles per element — extract `getComputedStyle` for every DOM element, deduplicated for repeated elements (e.g. identical siblings collapse to one representative sample), structured so an LLM can understand which styles apply to which element (Validated in Phase 7: 35 verification tests confirm STYLE-01)
- [x] Interaction state styles — extract CSS rules for `:hover`, `:focus`, `:active`, `:disabled` states from stylesheet rules (not just default computed state) (Validated in Phase 7: verification tests confirm STYLE-02)
- [ ] Actual asset downloading — fetch and save images, fonts, icons as real files rather than URL references only
- [x] GA / tracking plan extraction — capture `dataLayer` push history, GTM container config, and event schema so the tracking plan is reproducible (Validated in Phase 4-5: tracking capture + popup display fix)
- [ ] Component hierarchy mapping — annotate the DOM tree with logical component boundaries to make nesting and layout structure legible to an LLM
- [x] Structured directory output — replace single JSON bundle with a folder: `index.json`, `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` (Validated in Phase 3+6: scoped output with CSS file population)
- [x] Agnostic site detection — all detection logic (module federation, component architecture patterns, analytics) expressed as generic patterns, no hardcoded site names in code (Validated in Phase 6: removed detectServicesForKnownSites, replaced with network-based pattern matching)

### Out of Scope

- Database / MCP integration — this tool captures and exports; ingestion into a db or MCP is a separate tool
- Site-specific hardcoding — target sites handled by generic detection that happens to work well across stock photo / media platforms
- Mobile app — web extension only
- Full JS execution tracing — capturing runtime behavior beyond what's observable in the DOM and network layer

## Context

The extension currently exports a single large JSON file and captures asset URLs but does not download the assets themselves. The biggest gap for the primary use case (design system extraction) is `getComputedStyle` per element — without this, an LLM cannot know the rendered typography, spacing, and color values for a specific component.

The first concrete use case is extracting the design system from a stock photo platform homepage: capturing the header, nav, search bar, and card grid components so a React design system can be built from them.

Sites of interest are all large stock media platforms with module federation / microfrontend architectures, shared design patterns, and heavy use of Next.js and custom component data in `window`.

## Constraints

- **Tech Stack**: Chrome Extension MV3, plain JavaScript (no build system), must stay build-system-free to remain easy to load unpacked
- **Chrome APIs**: `webRequest`, `debugger`, `scripting`, `downloads`, `tabs`, `storage` — already declared in manifest
- **CSP**: Cross-origin asset fetching will hit CORS; asset download must be routed through the background service worker or Chrome's `downloads` API
- **Output Size**: Computed styles for a full page can be very large — deduplication strategy is required to keep output manageable
- **Public Repo**: Code must be fully generic — no site names, no internal references; detection logic must be expressed as observable patterns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Directory output over single JSON | LLMs can't consume 50MB+ in one context window; directory lets you selectively load just what's needed | — Pending |
| Dedup repeated elements in computed styles | Same-class siblings (gallery cards, nav items) produce identical styles; collapse to one sample | — Pending |
| Route asset downloads through background service worker | Content scripts can't call `chrome.downloads`; background already handles download orchestration | — Pending |
| No build system | Extension loads unpacked; adding webpack/Vite introduces friction for contributors and the primary author | — Pending |

---
*Last updated: 2026-03-24 after Phase 7 completion — Phase 2 style capture verified (STYLE-01, STYLE-02, STYLE-03 all PASS)*
