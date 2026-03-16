# Phase 3: Scoped Output and Assets - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can select a specific element or component on the page and receive a structured ZIP containing only that subtree's HTML, computed styles, and downloaded asset files — scoped for LLM context windows, not a full-page dump. The structured directory layout (already scaffolded in Phase 1) is populated: `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking`. Component boundary annotation is added as `html/component-hierarchy.json`. Full-page capture remains the default when no element is selected.

This phase does NOT add tracking plan extraction (Phase 4) or visual screenshot capture (v2).

</domain>

<decisions>
## Implementation Decisions

### Element Picker UX
- **Activation**: "Pick Element" button in the popup. Clicking it hides/minimises the popup and activates a picker overlay on the page.
- **Visual feedback**: A colored border outline follows the cursor with a small label showing the element's tag and primary class (e.g., `div.header-nav`). Same feel as Chrome DevTools element inspector.
- **After selection**: Click locks in the element, picker deactivates, popup reopens showing a selection summary (tag, class, child count). User can then start analysis or re-pick.
- **Clear button**: Once an element is selected, a clear/× button appears next to the summary in the popup. Clearing reverts to full-page capture mode.
- **Escape key**: Pressing Escape during picker mode cancels selection without changing current state.

### Scope Boundary & Coverage
- **When element is selected**: HTML, computed styles, and assets are ALL scoped to the selected subtree. Network data stays full-page (it's tab-level by nature and cannot be scoped).
- **When no element is selected**: Full-page capture — existing behavior unchanged. Scoped capture is opt-in.
- **Scope metadata in index.json**: Top-level `scope` object with:
  - `mode`: `"element"` or `"full-page"`
  - `selector`: CSS selector string identifying the selected element (e.g., `"div.header-nav"`)
  - `outerHtml`: truncated `outerHTML` of the selected element (first 500 chars)
  - `childCount`: number of direct children

### Asset Download Behavior
- **Asset types fetched**: `<img>` src URLs, CSS `@font-face` source URLs, and `background-image` URLs from computed styles — all within the scoped subtree (or full page if no scope).
- **Auth-gated assets**: Out of scope — only publicly fetchable assets are downloaded (per REQUIREMENTS.md).
- **File naming**: Preserve the original filename from the URL path (e.g., `logo.png`, `inter-regular.woff2`). Collisions resolved with a counter suffix (`logo-1.png`, `logo-2.png`).
- **Fetch routing**: All fetches routed through the background service worker to bypass CORS (per PROJECT.md decision).
- **On fetch failure** (404, CORS block, timeout): Skip silently from `/assets/` but record the URL and failure reason in `index.json` under `failedAssets: [{ url, reason }]`. LLM can see what's missing and why.

### Component Boundary Format
- **Location**: `html/component-hierarchy.json` — a separate file alongside `html/index.html`. LLM loads them together: HTML for markup, hierarchy for named structure.
- **Detection signals, in priority order**:
  1. React fiber internals (`__reactFiber`, `__reactInternalInstance`, `__reactFiber$...` dynamic keys)
  2. Vue bindings (`__vue_app__`, `_vei`, `__vueParentComponent`)
  3. Angular metadata (`ng-version`, `__ngContext__`, `NG_COMP_DEF` on constructor)
  4. `data-*` attributes (`data-component`, `data-testid`, `data-block`, `data-module`)
  5. BEM class patterns (block--modifier style, block__element patterns) as last-resort fallback
- **Anonymous elements**: When no component name is detectable, use `tag.class` as a generated name (e.g., `"div.header-nav"`, `"section.hero-block"`). Never omit — always annotate.
- **Output shape**: A tree structure mirroring DOM nesting, each node with: `name` (detected or generated), `source` (which signal detected it: `"react"`, `"vue"`, `"angular"`, `"data-attr"`, `"bem"`, `"generated"`), `selector` (CSS selector for the element), `children: []`.

### Claude's Discretion
- Exact color and styling of the picker overlay and highlight box
- Picker overlay z-index and cleanup strategy (ensure it doesn't leak into page state)
- Specific counter format for filename collision resolution
- Timeout value for asset fetch requests
- How deeply to traverse the fiber tree (stop at leaf components vs include all internal nodes)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §SCOPE-01, SCOPE-02, SCOPE-03, TRACK-02 — acceptance criteria for all four Phase 3 requirements

### Infrastructure (carry-forward)
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — ZIP structure decisions (pre-scaffolded subdirs, fflate usage, background SW download routing), chunked IPC transport
- `.planning/phases/02-style-capture/02-CONTEXT.md` — computed styles output shape (`globals` + `elements` keys in `computed-styles/computed-styles.json`) that Phase 3 scoping must filter

### State flags (research required before implementation)
- React 18/19 fiber property names (`__reactFiber`, `__reactProps`) flagged for verification in `.planning/STATE.md` — researcher must confirm current property names before implementation

No external design docs or ADRs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `background.js` `downloadAsZip()` (line 525): ZIP file tree is already built and pre-scaffolded with all 6 subdirs. Phase 3 populates `html/`, `css/`, and `assets/` entries into the existing `fileTree` object.
- `background.js` `MigrationAnalyzer`: Already handles `chrome.downloads` and `fetch` — asset fetching via background SW adds new fetch calls here (background has `<all_urls>` host permission).
- `content.js` `WebsiteAnalyzer.analyzeWebsite()`: Returns the result object Phase 3 extends. Element-scoped analysis adds a new method called with the selected element's selector.
- `content.js` stylesheet iteration (~line 282): `document.styleSheets` / `cssRules` loop already established for font-face extraction — extend to extract background-image URLs per element.
- `content.js` component/window detection (~line 459): Existing `window.experiences` and module federation detection uses observable patterns — React fiber detection extends this block.
- `popup.js` `PopupController`: Has `initializeElements()` and `setupEventListeners()` entry points for adding the picker button and selection summary UI.
- `sendChunked()` (content.js line 13): Already handles large payloads — scoped HTML and asset manifest route through this.

### Established Patterns
- **No build system**: New logic goes directly in `content.js`, `popup.js`, or `background.js`. No new files unless clearly necessary.
- **Message actions**: SCREAMING_SNAKE_CASE. New picker activation and asset fetch actions follow this pattern.
- **Analysis result object**: Flat top-level keys per capture type — `scopedHtml`, `componentHierarchy`, `assetManifest` are new top-level keys.
- **Picker overlay**: Must be injected/removed cleanly via `chrome.scripting.executeScript` — same injection model as the existing content script.

### Integration Points
- `popup.js`: "Pick Element" button triggers `chrome.scripting.executeScript` to inject picker overlay; receives selected element data back via `chrome.tabs.sendMessage` or scripting return value.
- `content.js`: New `activatePicker()` method injects overlay, captures element on click, returns selector + metadata to popup.
- `background.js`: New `fetchAssets(urls)` method does parallel `fetch()` calls, returns `{ url, data: Uint8Array, filename }[]` to caller. Results written into `assets/` in the ZIP file tree.
- `background.js` `downloadAsZip()`: Receives scoped HTML, component hierarchy, and asset binaries alongside existing computed styles and network data.

</code_context>

<specifics>
## Specific Ideas

- The picker should feel like Chrome DevTools element inspector — the highlight box + label interaction is a known, trusted UX pattern for this kind of tool.
- "Everything scoped" is the right call for the primary use case (design system extraction from a component) — an LLM handed a scoped ZIP should be able to reconstruct that component without loading unrelated page context.
- Component hierarchy tree + HTML as a pair is the right LLM interface — same pattern as how design system docs work (component names + markup, side by side).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-scoped-output-and-assets*
*Context gathered: 2026-03-16*
