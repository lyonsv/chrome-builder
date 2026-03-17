# Phase 4: Tracking Plan - Context

**Gathered:** 2026-03-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture and export a structured tracking plan into the `/tracking/` directory of the ZIP — `dataLayer` push history, GTM container metadata, and a derived event schema. The output is designed for LLM consumption: an LLM handed `tracking/schema.json` and `tracking/events.json` can reproduce the analytics instrumentation for any component without manual reverse-engineering of the original site.

This phase does NOT add interaction simulation, full GTM trigger-rule parsing, or support for non-GTM analytics stacks (Adobe, Mixpanel, etc. are already covered by Phase 1 third-party detection). Tracking capture is always full-page (tab-level) — it cannot be scoped to a selected element.

</domain>

<decisions>
## Implementation Decisions

### dataLayer capture approach
- **Capture strategy:** Snapshot `window.dataLayer` at analysis time — read the array the moment the user clicks Analyze. No `document_start` content script, no manifest changes, no architectural conflict with the on-demand injection model.
- **Coverage:** Captures all events that fired from page load up to the moment of analysis (page_view, GTM lifecycle events, any custom events the user triggered before clicking Analyze).
- **Filter:** Export everything — include all dataLayer entries as-is (GTM lifecycle events like `gtm.js`, `gtm.dom`, `gtm.load`, plus all custom and ecommerce events). No filtering. The LLM consuming the output can filter by type if needed; we lose nothing.
- **Scope:** `window.dataLayer` only. Do not attempt to capture `window.gtag` call history, `window._satellite`, `window.mixpanel`, etc. — other analytics tools are already covered by Phase 1 third-party service detection.

### GTM container extraction
- **What to extract:** Container ID and tag list from `window.google_tag_manager`. Do not fetch or parse the full container script — container ID + tag list is sufficient for LLM reconstruction purposes.
- **How to find container ID:** Check `window.google_tag_manager` object keys (each key is a container ID), or parse the GTM script `src` URL from `<script>` tags (pattern: `gtm.js?id=GTM-XXXXX`).
- **If no GTM detected:** Export `dataLayer` (which may be empty or contain GA4-only pushes), add a `note` field describing what was found (`"No GTM container detected. DataLayer present but no google_tag_manager object found."`). The existing Phase 1 third-party service detection already identifies which analytics tools are present — reference that from the tracking output.
- **If no dataLayer at all:** Export empty array for `dataLayer`, set `hasGtm: false`, include note. `tracking: true` still gets set in index.json (we did attempt tracking capture).

### Event schema derivation
- **Schema output:** From the raw `dataLayer` entries, derive a deduplicated event schema:
  - Unique event names (the `event` property value from each push)
  - For each unique event: the union of all property keys observed across all pushes of that event type
  - One example value per property key (first occurrence)
- **Included in:** `tracking/schema.json` — this is the primary artifact for LLM consumption. An LLM reads schema.json first to understand what events exist and what properties they carry, then reads events.json for the full history.
- **No interaction mapping:** Do not attempt to attribute events to DOM elements, parse GTM trigger rules, or map events to CSS selectors. Event property names (e.g. `event: 'click_search_bar'`) carry sufficient intent for LLM reproduction.

### Tracking output structure
- **Files in /tracking/:**
  - `tracking/events.json` — raw `window.dataLayer` array, as-is
  - `tracking/schema.json` — derived event schema: `{ events: [{ name, properties: [{ key, exampleValue }] }], gtm: { containerId, tags }, analytics: { detected: [...] } }`
- **Scope behavior:** Tracking capture is always full-page — same as network data in Phase 3. `dataLayer` is a tab-level global, cannot be filtered to a selected element subtree. The scope selector (if set) is ignored for tracking capture.
- **index.json tracking summary:** Include a tracking summary object at the top level of index.json:
  ```json
  "tracking": {
    "hasGtm": true,
    "containerId": "GTM-XXXXX",
    "eventCount": 42,
    "uniqueEventNames": ["page_view", "add_to_cart", "search"]
  }
  ```
  This is consistent with how other sections (computedStyles, assets, network) are summarised in index.json.

### Claude's Discretion
- Exact JSON key names within schema.json and events.json (beyond the structure defined above)
- How to handle malformed or non-standard dataLayer entries (entries without an `event` key)
- Whether to include a `timestamp` estimate on events (dataLayer doesn't store timestamps natively)
- GTM tag list depth (tag name only vs tag type + name)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §TRACK-01 — acceptance criteria: dataLayer push history, GTM event schema, what events fire, what properties they carry, which interactions trigger them

### Infrastructure (carry-forward)
- `.planning/phases/01-infrastructure-foundation/01-CONTEXT.md` — ZIP structure decisions (tracking/ subdir pre-scaffolded, fflate usage, background SW download routing), no-build-system constraint
- `.planning/STATE.md` — Phase 4 research flag: `document_start` persistent content script conflict with on-demand injection model (decided: do NOT use document_start, use snapshot approach)

### Prior phase context
- `.planning/phases/03-scoped-output-and-assets/03-CONTEXT.md` — network data is always full-page (same rule applies to tracking); index.json structure for section summaries; background SW fetch routing pattern

No external design docs or ADRs — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `content.js` third-party detection (~line 598): Already identifies GA/GTM by script URL patterns (`googletagmanager.com`, `gtag`) — use this detection to set `hasGtm` flag and to find the GTM script `src` URL for container ID extraction
- `background.js` `downloadAsZip()`: `tracking/` dir already pre-scaffolded in the ZIP file tree (line 667). Phase 4 writes `tracking/events.json` and `tracking/schema.json` into the existing `fileTree['tracking/']` object
- `background.js` index.json manifest assembly (~line 648): `tracking: false` placeholder already exists — Phase 4 replaces this with the full tracking summary object
- `content.js` `WebsiteAnalyzer.analyzeWebsite()`: Returns the result object — Phase 4 adds `trackingData: { dataLayer, gtm }` as a new top-level key
- `sendChunked()` (content.js line 13): `window.dataLayer` can be large on sites with many events — route through existing chunked transport

### Established Patterns
- **No build system**: New logic goes directly in `content.js` and `background.js`. No new files.
- **Message actions**: SCREAMING_SNAKE_CASE — any new message types follow this pattern
- **Analysis result object**: Flat top-level keys per capture type — `trackingData` joins `computedStyles`, `scopedHtml`, `componentHierarchy` as a new top-level key
- **Background SW handles ZIP assembly**: `content.js` captures and sends data; `background.js` processes and writes to ZIP. Same split for tracking data.

### Integration Points
- `content.js` `WebsiteAnalyzer.analyzeWebsite()`: Add tracking data capture — read `window.dataLayer`, extract GTM container ID from `window.google_tag_manager` or script tags, return as `trackingData`
- `background.js` `downloadAsZip()`: Receive `trackingData`, derive schema, write `events.json` and `schema.json` into `fileTree['tracking/']`, populate tracking summary in index.json manifest

</code_context>

<specifics>
## Specific Ideas

- The `schema.json` file is the primary LLM artifact — it answers "what events exist on this site and what do they look like" in a single context-efficient file. Design it for LLM consumption first, human readability second.
- The STATE.md research flag about `document_start` is resolved: snapshot approach avoids the conflict entirely. The researcher does not need to investigate this further.
- Phase 1 third-party detection already knows if GA/GTM is present — the tracking capture can use that detection result rather than re-running detection from scratch.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-tracking-plan*
*Context gathered: 2026-03-17*
