# Website Asset Capture Extension

## What This Is

A Chrome extension that captures a comprehensive snapshot of any website — HTML, CSS, computed styles, assets, network requests, third-party tools, and tracking plans — and exports them as a structured ZIP directory that an LLM can consume to reconstruct the site's UI with pixel-perfect accuracy. Built for design system extraction and frontend migration workflows, not tied to any specific site.

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
- ✓ Single JSON bundle download — existing (superseded by ZIP directory in v1.0)
- ✓ Computed styles per element — deduplicated by element signature, ~67 design-system-relevant CSS properties — v1.0
- ✓ Interaction state styles — `:hover`, `:focus`, `:active`, `:disabled` rules from stylesheet inspection — v1.0
- ✓ GA / tracking plan extraction — dataLayer history, GTM container config, event schema derivation — v1.0
- ✓ Structured directory output — ZIP with index.json, /html, /css, /computed-styles, /assets, /network, /tracking — v1.0
- ✓ Agnostic site detection — all detection via generic observable patterns, zero hardcoded site names — v1.0
- ✓ Chunked IPC transport — 512KB chunks with ack/retry/progress, handles 2-5MB payloads — v1.0
- ✓ Service worker keep-alive — chrome.alarms + storage.session checkpoints prevent data loss — v1.0
- ✓ Element-scoped capture — click-to-select picker, subtree-only analysis, scoped ZIP output — v1.0
- ✓ Component hierarchy annotation — React fiber walk, Vue/Angular internals, BEM patterns, data-attributes — v1.0

### Active

- [ ] Actual asset downloading — fetch and save images, fonts, icons as real files rather than URL references only
- [ ] Responsive breakpoint variants — capture computed styles at multiple viewport widths
- [ ] Visual screenshot scoping — screenshot cropped to selected component
- [ ] Design token manifest extraction — standalone color palette, type scale, spacing scale from CSS variables

### Out of Scope

- Database / MCP integration — this tool captures and exports; ingestion into a db or MCP is a separate tool
- Site-specific hardcoding — target sites handled by generic detection that happens to work well across stock photo / media platforms
- Mobile app — web extension only
- Full JS execution tracing — capturing runtime behavior beyond what's observable in the DOM and network layer
- Auth-gated asset downloading — assets requiring session cookies; only publicly fetchable assets

## Context

Shipped v1.0 with 7,524 LOC JavaScript (plain, no build system). The extension now produces a structured ZIP directory containing HTML, computed styles, CSS files, component hierarchy annotations, network requests, and tracking plans. Element-scoped capture lets users select a single component and get only that subtree's data.

The primary use case is extracting design systems from stock media platform homepages: capturing the header, nav, search bar, and card grid components so a React design system can be built from them.

The biggest remaining gap is actual asset downloading — images, fonts, and icons are captured as URL references but not yet fetched and saved as real files in the ZIP.

## Constraints

- **Tech Stack**: Chrome Extension MV3, plain JavaScript (no build system), must stay build-system-free to remain easy to load unpacked
- **Chrome APIs**: `webRequest`, `debugger`, `scripting`, `downloads`, `tabs`, `storage` — already declared in manifest
- **CSP**: Cross-origin asset fetching will hit CORS; asset download must be routed through the background service worker or Chrome's `downloads` API
- **Output Size**: Computed styles for a full page can be very large — deduplication strategy is required to keep output manageable
- **Public Repo**: Code must be fully generic — no site names, no internal references; detection logic must be expressed as observable patterns

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Directory output over single JSON | LLMs can't consume 50MB+ in one context window; directory lets you selectively load just what's needed | ✓ Good — ZIP with 7 directories works well |
| Dedup repeated elements in computed styles | Same-class siblings (gallery cards, nav items) produce identical styles; collapse to one sample | ✓ Good — signature-based dedup with occurrence count |
| Route asset downloads through background service worker | Content scripts can't call `chrome.downloads`; background already handles download orchestration | ✓ Good — fetchAssets() in background handles CORS |
| No build system | Extension loads unpacked; adding webpack/Vite introduces friction for contributors and the primary author | ✓ Good — vendored fflate via importScripts, Jest for tests |
| Chunked IPC with ack/retry | Single sendMessage fails at ~5MB; chunking with backpressure keeps Chrome stable | ✓ Good — 512KB chunks, 3 retries, progress bar |
| GET_ANALYSIS pull pattern for popup | Content script sends data to background via chunks; popup pulls display summary separately | ✓ Good — decouples data assembly from display |

---
*Last updated: 2026-03-24 after v1.0 milestone*
