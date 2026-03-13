# Feature Landscape

**Domain:** Chrome Extension — Website capture / LLM-assisted UI reconstruction
**Researched:** 2026-03-13
**Confidence:** MEDIUM — web research tools unavailable; based on deep codebase analysis + domain expertise (training data through August 2025). Flag: verify competitor feature sets when web access is restored.

---

## Context

This is a **subsequent milestone** for an existing extension. The existing extension already captures HTML, CSS URLs, JS URLs, asset URLs, framework detection, third-party service identification, performance metrics, network requests, Next.js SSR data, and module federation data — and packages them as a single JSON bundle.

The primary use case driving this milestone: **hand a captured component to an LLM and get back a pixel-perfect React re-implementation**. The secondary use case: **extract a design system** (tokens, component patterns, interaction states) from a live site.

The table stakes / differentiator / anti-feature categorization below is anchored to this specific workflow — not general web scraping.

---

## Table Stakes

Features that, if missing, the LLM reconstruction workflow fails or produces obviously wrong output.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Computed styles per element | Without `getComputedStyle`, an LLM sees `class="btn"` with no idea what color, font, spacing, border-radius or box-shadow that resolves to. Reconstruction guesses. | High | Must be deduplicated — same-class sibling elements produce identical output; collapse to one representative sample. Already in Active requirements. |
| Interaction state styles (`:hover`, `:focus`, `:active`, `:disabled`) | A button that changes color on hover is not reconstructed correctly without these. CSS rule inspection (not computed state) is the right path — `document.styleSheets`. | Medium | Requires iterating `CSSRuleList` entries, not `getComputedStyle`. Already in Active requirements. |
| Actual asset files downloaded | URL references require the LLM to infer image dimensions, icon shapes, and font metrics. Without the files, it cannot reproduce exact SVG icons, custom font glyphs, or image proportions. | High | CORS constraint: must route through background service worker. Already in Active requirements. |
| Component-scoped capture | If a user wants to reconstruct the search bar, not the entire page, the output must be scoped to that element subtree. Full-page dumps are too large for a single LLM context window (a stock photo homepage is easily 50–200MB of computed styles). | Medium | Selector-based or click-to-select element scoping. Not yet in requirements. **Critical gap.** |
| Structured directory output | A 50MB JSON blob cannot be consumed by a single LLM call. The directory format lets callers load just `computed-styles/header.json` or `assets/icons/` — not the whole capture. | Medium | Already in Active requirements. Must also include a manifest/index that describes what's in each file. |
| CSS custom property (variable) resolution | Many design systems use `--color-primary` etc. `getComputedStyle` resolves variables to their computed values, but the LLM also needs the token names to understand the design system vocabulary. Dual output: resolved values + the variable declarations. | Medium | Requires scanning `:root` and element-level variable declarations from `document.styleSheets`. Not yet in requirements. **Critical gap for design system extraction.** |
| HTML structure with semantic annotations | The raw DOM must be preserved with element roles, ARIA labels, and data attributes — not just tag names. LLMs reconstruct accessibility incorrectly without `role`, `aria-*`, and `data-testid` attributes. | Low | Existing HTML extraction mostly covers this; needs explicit preservation of data attributes which may currently be stripped. |
| Font metadata (family, weight, size, line-height per element) | Typography is the single biggest visual differentiator in design systems. If computed styles are captured correctly, this falls out for free — but must be explicitly represented in the output schema. | Low (if computed styles done) | Depends on: computed styles per element. |
| Color values in a single canonical format | LLMs become confused if the same color appears as `#1a1a2e`, `rgb(26, 26, 46)`, and `hsl(240, 28%, 14%)` in different places. Normalize all color values to hex or rgb in a post-processing step. | Low | Can be done as output post-processing. Not yet in requirements. |
| Spacing / layout capture (box model values) | `margin`, `padding`, `gap`, `width`, `height`, `border` — all must be in computed style output. Without these, LLM-generated layouts diverge from originals even when colors and fonts are correct. | Low (if computed styles done) | Depends on: computed styles per element. |

---

## Differentiators

Features that set this tool apart for design system extraction and migration workflows. Not expected by casual users, but the reason power users choose this over a simple "save page" tool.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Component boundary detection | The captured output annotates the DOM tree with logical component boundaries: "this subtree is a `<SearchBar>`, this is a `<ProductCard>`". An LLM with component boundaries can generate individual, reusable components rather than one monolithic page. | High | React/Vue component names are available from `__reactFiber`, `__vueComponent`, Angular's `ng-version` + element properties. Already in Active requirements as "component hierarchy mapping". |
| Design token extraction | Identify CSS custom properties used as design tokens (`--spacing-*`, `--color-*`, `--font-*`, `--radius-*`) and emit them as a structured token file alongside raw computed styles. This lets an LLM generate both the component and the theme. | Medium | Builds on CSS variable resolution (table stakes). Design token naming patterns are mostly conventional. |
| Responsive breakpoint capture | For each captured element: what changes at each `@media` breakpoint? Captures breakpoint rules from stylesheets and correlates them with element styles. Critical for components that reflow on mobile. | High | Requires iterating `@media` rules in `CSSRuleList`. Separate pass from computed styles. |
| Visual screenshot of captured scope | A screenshot of the exact component or page region being captured, included in the output bundle. LLMs use this as ground truth for visual comparison. Already available via `chrome.tabs.captureVisibleTab`. | Low | Already partially in extension (full-page screenshot). Needs to be scoped to the selected element via clip coordinates. |
| GA / tracking plan extraction | Captures `dataLayer` push history, GTM container config, and event schema. Lets an LLM understand what analytics events the component fires, enabling full-fidelity migration including tracking. | Medium | Already in Active requirements. Differentiates from pure visual capture tools. |
| Module federation / microfrontend manifest | For sites using module federation: which components are remote, which are local, what are the shared dependencies? This is the difference between understanding a page and understanding the architecture it comes from. | Medium | Already detected. Needs structured output in directory format. |
| Next.js SSR data schema extraction | `__NEXT_DATA__` contains prop shapes, page params, and sometimes the full data graph. Capturing this alongside component styles lets an LLM reconstruct both the view and its data contract. | Low | Already extracted. Needs to be a first-class output file in the directory structure. |
| Agnostic pattern-based detection | All detection expressed as observable DOM/network patterns — no hardcoded site names. Means the tool works on any Next.js + module federation site, not just the ones the author has analyzed. | Medium | Already in Active requirements. Fixes a current codebase concern (hardcoded known-site map). |
| Element selector for targeted capture | User clicks on an element in the page; extension captures only that element's subtree, computed styles, and assets. Reduces output size by 90%+ for component-level work. | High | Requires injecting an interactive overlay into the page. Depends on: component-scoped capture. |
| Diff-aware re-capture | Re-run capture on the same URL and emit only what changed versus the previous capture. Useful for tracking design system drift over time. | High | Depends on: structured directory output, persistent storage of prior captures. Lower priority for initial milestone. |

---

## Anti-Features

Features to explicitly NOT build in this milestone — either because they are out of scope, would add complexity without payoff for the LLM reconstruction workflow, or are explicitly called out in PROJECT.md.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full JS runtime execution tracing | Capturing every function call, state transition, and event handler during user interaction. Massive complexity, requires CDP Runtime domain extensively, produces output LLMs can't use for visual reconstruction. | Capture what's observable: component names from fiber/vdom, `window.*` data, network requests. |
| Database / MCP integration | Ingesting captured data into a vector DB or MCP server. This is a separate tool concern and adds a dependency that makes the extension harder to use standalone. | Export a clean directory structure that any downstream tool can ingest. The extension's job ends at the filesystem. |
| Site-specific hardcoding | Hardcoded hostname → assumed-services maps (current `detectServicesForKnownSites`). Produces fabricated data, undermines trust, violates public repo constraint. | Replace with real DOM/network detection. The existing hardcoded map should be removed, not extended. |
| Full page CSS snapshot (every element) | Capturing `getComputedStyle` for every DOM node on a complex page is O(N) forced layouts. A stock photo homepage has 2000–5000 elements. Unscoped full-page capture will produce 20–100MB of style data. | Component-scoped capture or explicit element selection. Deduplication of same-class siblings. |
| Mobile app or cross-platform runtime | Building a Firefox extension, Electron wrapper, or mobile equivalent. The constraint is Chrome MV3, plain JS, no build system. | Stay Chrome-only for now. |
| Authentication/session management UI | Login flows, API key management, user accounts. This is a developer tool, not a SaaS product. | The extension operates on the current authenticated browser session. No auth layer needed. |
| Real-time collaboration or sharing | Multi-user capture sessions, share links for captured data. Adds enormous infrastructure complexity for zero benefit to the LLM reconstruction workflow. | Export files to disk. Sharing is the user's responsibility. |
| Automated visual regression testing | Using the captured data as a test baseline and running ongoing visual diffs. A legitimate use case but a completely separate product. | The diff-aware re-capture (differentiator) is the maximum viable overlap with this use case. |
| Build system or bundler | Webpack, Vite, Rollup, TypeScript compilation. Violates the constraint: extension must remain loadable unpacked without any toolchain. | Plain JS at root level. Zero build step. |

---

## Feature Dependencies

```
component-scoped capture
  → element selector for targeted capture (requires interactive overlay in page)
  → computed styles per element (scoping makes this tractable in size)
  → visual screenshot of captured scope (needs element coordinates to clip)

CSS custom property resolution
  → design token extraction (token file is a post-processed view of variable declarations)

computed styles per element
  → font metadata (falls out automatically)
  → spacing / layout capture (falls out automatically)
  → color normalization (post-processing step on computed values)

structured directory output
  → all other output features (every feature lands in a subdirectory)
  → diff-aware re-capture (requires prior capture to diff against)

interaction state styles
  (independent — stylesheet rule iteration, not computed state)

actual asset downloading
  → visual screenshot of captured scope (depends on assets for full fidelity)
  (otherwise independent — background service worker fetch)

component boundary detection
  → design token extraction (per-component tokens, not just page-global)
  (otherwise standalone — fiber/vdom traversal)

GA / tracking plan extraction
  (independent)

agnostic pattern-based detection
  → removes dependency on hardcoded known-site map
  (prerequisite for: all detection being trustworthy in output)
```

---

## MVP Recommendation

For the LLM UI reconstruction workflow to work at all, prioritize in this order:

1. **Structured directory output** — everything else lands here; without this, output is too large for LLM consumption
2. **Computed styles per element** (deduplicated) — the single biggest gap called out in PROJECT.md
3. **Interaction state styles** — hover/focus states are visually critical; missed by computed-state-only capture
4. **CSS custom property resolution** — design tokens are the vocabulary of modern design systems; without them, reconstructed components are tokenless
5. **Component-scoped capture** — makes all of the above tractable for real pages; without scoping, output size is the bottleneck
6. **Actual asset downloading** — icons, fonts, and images are required for pixel-perfect output

Defer to subsequent milestones:
- **Element selector overlay** (high complexity; scoping by CSS selector is sufficient for MVP)
- **Responsive breakpoint capture** (valuable but adds significant complexity; LLM can note the gap)
- **Diff-aware re-capture** (requires prior capture infrastructure; separate milestone)
- **Design token extraction** (builds on CSS variable resolution; can be phase 2 of the same milestone)

---

## Sources

- PROJECT.md — explicit requirements, active list, out-of-scope list (HIGH confidence)
- `.planning/codebase/ARCHITECTURE.md`, `CONCERNS.md`, `STRUCTURE.md` — codebase realities and constraints (HIGH confidence)
- Domain expertise: LLM context window constraints for structured data consumption (MEDIUM confidence — based on training data through August 2025; LLM capabilities evolve)
- Domain expertise: CSS rule inspection APIs (`document.styleSheets`, `CSSRuleList`, `getComputedStyle`) — browser standard APIs (HIGH confidence)
- Domain expertise: React fiber internals (`__reactFiber`, `__reactProps`) for component boundary detection — well-documented community technique (MEDIUM confidence — verify current fiber property names in React 18/19)
- Competitor landscape (Responsively, VisBug, CSS Used Chrome extension, Figma dev mode, Storybook capture): not directly verifiable without web access — LOW confidence on competitor feature comparison; findings reflect training-data knowledge of the design extraction tool category
