# Phase 2: Style Capture - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Export a deduplicated map of computed styles for every element on the page, interaction-state rules (:hover, :focus, :active, :disabled), and resolved CSS custom property values — structured so an LLM understands which styles apply to which element. This phase does NOT add asset downloading, scoped element selection, or directory restructuring — those are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Property Selection
- Capture all four categories: typography (font-family, font-size, font-weight, line-height, letter-spacing, text-transform, color), spacing & layout (margin, padding, display, flex/grid properties, gap, width, height, overflow), visual decoration (background-color, border, border-radius, box-shadow, opacity, visibility), transitions & animation, AND positioning (position, top, right, bottom, left, z-index, cursor)
- Capture ::before and ::after pseudo-element styles per element — they often hold decorative content and icons via `content`
- Target ~60 design-system-relevant properties total across these categories

### Global vs Component Separation
- Capture a **global styles section** separately: `:root` CSS custom properties, `body`/`html` computed styles, and universal/wildcard rules (`*`, `*::before`, `*::after`)
- Per-element entries **omit properties that match the inherited global baseline** — only show what's unique to that element
- This keeps component entries lean and avoids restating inherited defaults across every element

### Deduplication Signature
- Deduplication key: **tag + full class list (sorted alphabetically)**
- `div.btn.btn-primary.active` and `div.btn.btn-primary` are separate signatures — no stripping of state classes
- Identical signatures (same tag + same classes) are collapsed to one representative sample

### Output Structure
- **File:** `computed-styles/computed-styles.json` — single JSON file in the pre-scaffolded subdir
- **Shape:** Two top-level keys:
  - `globals`: `:root` vars, body styles, universal rules
  - `elements`: flat map of `signature → entry`
- Each element entry contains:
  - `styles`: object of CSS property → value (only non-global-inherited properties)
  - `states`: object of pseudo-class → property delta (`:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`)
  - `pseudos`: object for `::before` and `::after` styles if present
  - `occurrences`: integer count of how many times this signature appears on the page
  - `exampleHtml`: truncated `outerHTML` of one representative instance so an LLM can see markup alongside styles

### Interaction States
- Capture: `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`
- Extracted by iterating `document.styleSheets` and matching rules by pseudo-class selector — not live computed state injection
- **Merged into each element's entry** under `states` key — LLM sees all styling for a component in one place
- Match only rules whose base selector targets elements actually present on the page (no dead CSS)
- Cross-origin stylesheets are inaccessible (CORS block): skip silently and record their URLs in a top-level `crossOriginStylesheets: []` field so the LLM knows some interaction rules may be missing

### CSS Custom Properties
- Capture per token: name, resolved value, where it's defined (`:root` vs scoped selector), fallback value at point of use (if declared), and which element signatures reference it
- **Both global vocab and inline on element**: global section lists the full token dictionary; each element's `styles` shows the var name at point of use (e.g. `color: var(--color-primary)`) alongside the resolved value
- **Group tokens by naming pattern** in the global section: `--color-*`, `--spacing-*`, `--font-*`, etc → separate categories; uncategorised vars fall into `other`

### Claude's Discretion
- Exact list of the ~60 CSS properties (researcher to compile the canonical list from the categories above)
- Truncation length for `exampleHtml`
- How to handle elements with no classes (use tag only as signature)
- Performance strategy for iterating all DOM elements on large pages

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `content.js` `analyzeWebsite()`: Already orchestrates multiple capture tasks with `Promise.all()` — computed style extraction plugs in as a new parallel task returning to the same result object
- `content.js` stylesheet iteration (line ~282): `document.styleSheets` / `cssRules` loop already exists for font-face extraction — extend this for interaction-state rule extraction
- `content.js` `getComputedStyle` (line ~265): Already used for background-image extraction — pattern established for per-element style reading
- `sendChunked()` (content.js line 13): Already handles large IPC payloads — computed styles output routes through this automatically

### Established Patterns
- **No build system**: All JS plain vanilla, no imports. New logic goes directly in content.js or a new vendored helper
- **Result object shape**: `analyzeWebsite()` returns a flat object with top-level keys per capture type — add `computedStyles` as a new top-level key
- **ZIP subdir pre-scaffolded**: `computed-styles/` subdir already exists in the ZIP output from Phase 1 — Phase 2 populates `computed-styles/computed-styles.json` into it

### Integration Points
- `content.js`: New `extractComputedStyles()` method added to `WebsiteAnalyzer` class, called in `analyzeWebsite()` Promise.all block
- `background.js`: Receives computed styles payload via chunked IPC, writes `computed-styles/computed-styles.json` into the ZIP
- `popup.js`: No UI changes required — progress display for chunked transfer already exists from Phase 1

</code_context>

<specifics>
## Specific Ideas

- The primary use case is design system extraction from a stock photo platform — the output should make it easy for an LLM to reconstruct typography, color, spacing, and interactive states from the component level up
- Global section is read once; element entries are component-focused and lean — this mirrors how a design system is actually documented (tokens defined globally, components reference them)
- Token grouping by naming pattern (--color-*, --spacing-*, --font-*) is a heuristic — real-world sites may not follow conventions, so the `other` bucket is important

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-style-capture*
*Context gathered: 2026-03-13*
