# Phase 6: Fix Detection and CSS Export - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the last hardcoded site names from popup.js (the `detectServicesForKnownSites()` hostname map) and populate the currently-empty `css/` directory in the ZIP with fetched external stylesheet content. This is a gap closure phase closing Integration Issues B + C from the v1.0 audit.

</domain>

<decisions>
## Implementation Decisions

### Fallback Detection Strategy
- **D-01:** Delete `detectServicesForKnownSites()` entirely and remove all callers in popup.js. The content script's generic signal-based detection (`categorizeService()`) is the source of truth.
- **D-02:** Replace the hardcoded fallback with network-based service detection — query background.js for captured `chrome.webRequest` data and infer services from request URLs (google-analytics.com, segment.com, etc.). This works even when CSP blocks DOM inspection.
- **D-03:** Reuse the same `categorizeService()` category mapping approach from content.js, applied to network request URLs instead of DOM-detected script elements. One source of truth for service categorization.

### CSS Directory Contents
- **D-04:** Populate `css/` with fetched external stylesheets only — each linked `<link rel="stylesheet">` href fetched via background SW and saved as individual .css files. Inline `<style>` blocks are already in the HTML output.
- **D-05:** File naming uses original filename from the URL (e.g., `styles.css`, `main.css`). Collisions resolved with counter suffix (`styles-1.css`). Same pattern as Phase 3 asset downloads.
- **D-06:** Fetch failures handled same as asset failures — skip from `css/` directory, record URL + failure reason in `index.json` `failedAssets` array. Consistent with Phase 3 behavior.
- **D-07:** CSS directory does NOT respect element scoping — include all page stylesheets regardless of whether an element is selected. CSS files are small relative to other outputs and LLM can filter what's relevant.

### Fallback Path Behavior
- **D-08:** The CSP-restricted fallback path also attempts CSS fetching. CSS `<link>` hrefs are discoverable even when DOM inspection fails.
- **D-09:** Stylesheet URLs in the fallback path come from the network request log (background SW's `chrome.webRequest` capture, filtered for text/css content type) — same data source as the network-based service detection.

### Claude's Discretion
- Exact implementation of network request URL → service name mapping
- How to extract CSS URLs from the network request log (content-type filtering vs URL pattern matching)
- Whether to add a `css` summary field to `index.json` alongside the existing asset summaries

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §TRACK-03 — no hardcoded site names in codebase
- `.planning/REQUIREMENTS.md` §SCOPE-02 — structured directory output including `/css`

### Prior Phase Decisions
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` §Detection Cleanup — observable signals only, no site-name wrapping conditions
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` §ZIP Library — fflate, pre-scaffolded directory structure
- `.planning/phases/03-scoped-output-and-assets/03-CONTEXT.md` §Asset Download Behavior — fetch routing through background SW, failure handling pattern (skip + record in failedAssets)

### Source Files
- `popup.js` lines 761-796 — `detectServicesForKnownSites()` to be removed
- `popup.js` lines 320-339 — CSP-restricted fallback path that calls the function
- `content.js` `categorizeService()` — existing generic service categorization logic to reuse
- `background.js` lines 706-716 — ZIP file tree scaffolding with empty `css/` directory

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `content.js` `categorizeService()` (line 711): Category mapping for service names — reuse this logic for network-based detection
- `content.js` stylesheet iteration (~line 282): Already iterates `document.styleSheets` / `cssRules` for font-face extraction — CSS URL discovery extends this
- `background.js` `downloadAsZip()` (line 706): ZIP file tree already scaffolded with `css/` empty directory — just populate it
- `background.js` asset fetching: Already fetches binary assets via `fetch()` in the SW — stylesheet fetching uses the same pattern

### Established Patterns
- **Asset failure handling**: Skip silently from output directory, record in `index.json` `failedAssets` array (Phase 3 pattern)
- **File naming**: Original filename from URL with counter suffix for collisions (Phase 3 asset pattern)
- **Message actions**: SCREAMING_SNAKE_CASE for chrome.runtime.onMessage actions
- **Network data**: Background SW captures requests via `chrome.webRequest` — already available for querying

### Integration Points
- `popup.js` fallback path: Replace `detectServicesForKnownSites()` call with message to background for network-based detection
- `background.js` `downloadAsZip()`: Add CSS file population into `fileTree['css/']` before ZIP encoding
- `background.js`: New message handler to return captured network requests filtered by content type

</code_context>

<specifics>
## Specific Ideas

- Network request log is the single data source for both fallback service detection AND fallback CSS URL discovery — keeps the implementation cohesive
- Phase 3's asset download pattern (fetch via background SW, original filename, failure recording) is the blueprint for CSS file handling — no new patterns needed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-fix-detection-and-css-export*
*Context gathered: 2026-03-24*
