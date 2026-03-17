# Phase 4: Tracking Plan - Research

**Researched:** 2026-03-17
**Domain:** Chrome Extension — dataLayer/GTM capture, JSON schema derivation, ZIP integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**dataLayer capture approach**
- Capture strategy: Snapshot `window.dataLayer` at analysis time — read the array the moment the user clicks Analyze. No `document_start` content script, no manifest changes, no architectural conflict with the on-demand injection model.
- Coverage: Captures all events that fired from page load up to the moment of analysis (page_view, GTM lifecycle events, any custom events the user triggered before clicking Analyze).
- Filter: Export everything — include all dataLayer entries as-is. No filtering. The LLM consuming the output can filter by type if needed.
- Scope: `window.dataLayer` only. Do not attempt to capture `window.gtag` call history, `window._satellite`, `window.mixpanel`, etc.

**GTM container extraction**
- What to extract: Container ID and tag list from `window.google_tag_manager`. Do not fetch or parse the full container script.
- How to find container ID: Check `window.google_tag_manager` object keys (each key is a container ID), or parse the GTM script `src` URL from `<script>` tags (pattern: `gtm.js?id=GTM-XXXXX`).
- If no GTM detected: Export `dataLayer` (which may be empty or contain GA4-only pushes), add a `note` field describing what was found. Reference Phase 1 third-party service detection output.
- If no dataLayer at all: Export empty array for `dataLayer`, set `hasGtm: false`, include note. `tracking: true` still gets set in index.json.

**Event schema derivation**
- Schema output: From the raw `dataLayer` entries, derive a deduplicated event schema with unique event names, the union of all property keys per event type, and one example value per property key (first occurrence).
- Primary artifact: `tracking/schema.json` — an LLM reads schema.json first to understand what events exist and what properties they carry, then reads events.json for the full history.
- No interaction mapping: Do not attempt to attribute events to DOM elements, parse GTM trigger rules, or map events to CSS selectors.

**Tracking output structure**
- `tracking/events.json` — raw `window.dataLayer` array, as-is
- `tracking/schema.json` — derived event schema: `{ events: [{ name, properties: [{ key, exampleValue }] }], gtm: { containerId, tags }, analytics: { detected: [...] } }`
- Scope behavior: Tracking capture is always full-page. The scope selector (if set) is ignored for tracking capture.
- index.json tracking summary:
  ```json
  "tracking": {
    "hasGtm": true,
    "containerId": "GTM-XXXXX",
    "eventCount": 42,
    "uniqueEventNames": ["page_view", "add_to_cart", "search"]
  }
  ```

**No build system**
- New logic goes directly in `content.js` and `background.js`. No new files.
- Message actions: SCREAMING_SNAKE_CASE.
- `trackingData` is a new top-level key on the analysis result object alongside `computedStyles`, `scopedHtml`, `componentHierarchy`.
- Background SW handles ZIP assembly: `content.js` captures and sends data; `background.js` processes and writes to ZIP.

### Claude's Discretion
- Exact JSON key names within schema.json and events.json (beyond the structure defined above)
- How to handle malformed or non-standard dataLayer entries (entries without an `event` key)
- Whether to include a `timestamp` estimate on events (dataLayer doesn't store timestamps natively)
- GTM tag list depth (tag name only vs tag type + name)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRACK-01 | Extension captures `dataLayer` push history and GTM event schema — what events fire, what properties they carry, and which user interactions trigger them | Covered by: dataLayer snapshot in content.js, schema derivation in background.js, events.json + schema.json written into tracking/ ZIP dir, tracking summary in index.json |

</phase_requirements>

---

## Summary

Phase 4 adds tracking plan capture to the existing analysis pipeline. The implementation is entirely additive: a new `captureTrackingData()` method in `content.js` reads `window.dataLayer` and `window.google_tag_manager` at snapshot time, returning a `trackingData` top-level key on the analysis result object. In `background.js`, `downloadAsZip()` receives this data, derives a deduplicated event schema, writes `tracking/events.json` and `tracking/schema.json`, and populates the tracking summary in `index.json`. The `tracking/` directory is already scaffolded in the fileTree.

The critical architectural decision — resolved in CONTEXT.md — is that the snapshot approach (read `window.dataLayer` at click time) entirely avoids the `document_start` persistent content script conflict. This means no manifest changes, no new content script injection points, and no risk to the on-demand injection model established in Phase 1.

The schema derivation logic (grouping pushes by `event` key, collecting property union, selecting first-occurrence example values) is straightforward array reduction and belongs in `background.js` where ZIP assembly occurs. `content.js` only needs to snapshot and return the raw data — the processing stays on the background side, consistent with the existing split for network data and computed styles.

**Primary recommendation:** Implement as two isolated additions — `captureTrackingData()` in `content.js` and a `deriveEventSchema()` helper plus `tracking/` file writes in `background.js` — with the tracking summary replacing the `tracking: false` placeholder already in `indexData`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.2 (already loaded) | ZIP file assembly | Already in use via `importScripts('/vendor/fflate.min.js')` — no new dependency |
| Jest | (already configured) | Unit testing | Already in use — `jest.config.js` + `tests/unit/` established in Phase 3 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | — | — | No new libraries needed — pure JS DOM access (`window.dataLayer`, `window.google_tag_manager`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Snapshot approach | Proxy/intercept approach (`document_start`, defineProperty) | Proxy catches future pushes but conflicts with on-demand injection model — rejected in CONTEXT.md |
| Schema derivation in background.js | Schema derivation in content.js | Background keeps content.js lightweight; processing belongs with ZIP assembly — consistent with Phase 3 pattern |

**Installation:**
```bash
# No new packages required
```

---

## Architecture Patterns

### Recommended Project Structure
```
content.js
├── captureTrackingData()    # NEW: reads window.dataLayer + window.google_tag_manager
└── analyzeWebsite()         # MODIFIED: add captureTrackingData() call, add trackingData to return object

background.js
├── deriveEventSchema()      # NEW: pure function — reduce raw dataLayer to schema
└── downloadAsZip()          # MODIFIED: receive trackingData, write events.json + schema.json, populate tracking summary
```

### Pattern 1: Content Script Snapshot (content.js)
**What:** Read `window.dataLayer` and `window.google_tag_manager` synchronously at analysis time.
**When to use:** Always — no special conditions. GTM presence detected from Phase 1 `thirdPartyServices` result or from direct `window.google_tag_manager` check.
**Example:**
```javascript
// In content.js — new method on WebsiteAnalyzer class
captureTrackingData() {
  // Snapshot dataLayer — safe to read even if undefined
  const rawDataLayer = Array.isArray(window.dataLayer)
    ? JSON.parse(JSON.stringify(window.dataLayer))  // deep clone — avoid reference aliasing
    : [];

  // Extract GTM container info
  const gtm = {};
  if (window.google_tag_manager) {
    // Keys are container IDs (e.g. "GTM-XXXXX")
    const containerIds = Object.keys(window.google_tag_manager)
      .filter(k => k.startsWith('GTM-'));
    if (containerIds.length > 0) {
      gtm.containerId = containerIds[0]; // primary container
      gtm.allContainerIds = containerIds;
      // Extract tag list if available
      try {
        const container = window.google_tag_manager[containerIds[0]];
        // google_tag_manager[id] has a dataLayer property and optionally tags
        gtm.tags = container && container.dataLayer
          ? Object.keys(container).filter(k => k !== 'dataLayer')
          : [];
      } catch (_) {
        gtm.tags = [];
      }
    }
  }

  // Fallback: parse GTM container ID from script src if google_tag_manager absent
  if (!gtm.containerId) {
    const gtmScript = document.querySelector('script[src*="gtm.js?id="]');
    if (gtmScript) {
      const match = gtmScript.src.match(/[?&]id=(GTM-[A-Z0-9]+)/);
      if (match) gtm.containerId = match[1];
    }
  }

  return {
    dataLayer: rawDataLayer,
    gtm: Object.keys(gtm).length > 0 ? gtm : null,
    hasGtm: !!gtm.containerId,
    note: !gtm.containerId && rawDataLayer.length === 0
      ? 'No GTM container detected. No dataLayer pushes observed.'
      : !gtm.containerId
        ? 'No GTM container detected. dataLayer present but no google_tag_manager object found.'
        : null
  };
}
```

### Pattern 2: Schema Derivation (background.js)
**What:** Pure function that reduces raw dataLayer array to a deduplicated event schema.
**When to use:** Called inside `downloadAsZip()` before writing tracking files.
**Example:**
```javascript
// In background.js — pure helper function (not a class method, consistent with other helpers)
function deriveEventSchema(dataLayerEntries) {
  const eventMap = new Map(); // event name -> { properties: Map<key, exampleValue> }

  for (const entry of dataLayerEntries) {
    if (typeof entry !== 'object' || entry === null) continue;

    const eventName = entry.event || '__no_event_key__';

    if (!eventMap.has(eventName)) {
      eventMap.set(eventName, { name: eventName, properties: new Map() });
    }

    const eventDef = eventMap.get(eventName);

    // Collect all keys except 'event' itself
    for (const [key, value] of Object.entries(entry)) {
      if (!eventDef.properties.has(key)) {
        // First occurrence — record as example value
        // Truncate long values to keep schema.json context-efficient
        const exampleValue = typeof value === 'string' && value.length > 200
          ? value.slice(0, 200) + '...'
          : value;
        eventDef.properties.set(key, exampleValue);
      }
    }
  }

  return Array.from(eventMap.values()).map(e => ({
    name: e.name,
    properties: Array.from(e.properties.entries()).map(([key, exampleValue]) => ({ key, exampleValue }))
  }));
}
```

### Pattern 3: ZIP Assembly Integration (background.js — downloadAsZip)
**What:** Add tracking file writes alongside the existing network and computed-styles writes.
**When to use:** Always — even when no GTM/dataLayer found, write files (with empty/note content). Consistent with how network/ is handled.
**Example:**
```javascript
// Inside downloadAsZip(), after the network/ block:

const trackingData = analysisData.trackingData || null;
const rawDataLayer = trackingData ? trackingData.dataLayer : [];
const gtmData = trackingData ? trackingData.gtm : null;
const hasGtm = trackingData ? trackingData.hasGtm : false;

// Derive schema
const schemaEvents = deriveEventSchema(rawDataLayer);

// Reference detected analytics from thirdPartyServices
const detectedAnalytics = (analysisData.thirdPartyServices || [])
  .filter(s => s.category === 'Analytics')
  .map(s => s.name);

const schemaJson = {
  events: schemaEvents,
  gtm: hasGtm ? {
    containerId: gtmData.containerId,
    allContainerIds: gtmData.allContainerIds || [],
    tags: gtmData.tags || []
  } : null,
  analytics: {
    detected: detectedAnalytics
  },
  ...(trackingData && trackingData.note ? { note: trackingData.note } : {})
};

fileTree['tracking/'] = {
  'events.json': fflate.strToU8(JSON.stringify(rawDataLayer, null, 2)),
  'schema.json': fflate.strToU8(JSON.stringify(schemaJson, null, 2))
};

// Replace tracking: false placeholder in indexData
indexData.stages.tracking = true;
indexData.tracking = {
  hasGtm,
  containerId: hasGtm ? gtmData.containerId : null,
  eventCount: rawDataLayer.length,
  uniqueEventNames: schemaEvents
    .filter(e => e.name !== '__no_event_key__')
    .map(e => e.name)
};
```

### Pattern 4: analyzeWebsite() Integration (content.js)
**What:** Add `captureTrackingData()` to the parallel analysis calls and add `trackingData` to the return object.
**When to use:** The tracking capture is synchronous — it reads globals, no async needed. Can be added after the `Promise.all()` block or called as a sync step.
**Example:**
```javascript
// In analyzeWebsite(), after the existing Promise.all() block:
const trackingData = this.captureTrackingData();

// Add to the return object:
return {
  // ... existing keys ...
  trackingData,
  timestamp: new Date().toISOString()
};
```

### Anti-Patterns to Avoid
- **Filtering dataLayer before export:** Don't strip `gtm.js`, `gtm.dom`, `gtm.load` entries. Export everything — the LLM consumer filters. Premature filtering loses data.
- **Re-running third-party detection in captureTrackingData():** `this.thirdPartyServices` is already populated by `identifyThirdPartyServices()`. Pass detected services from the analysis result to background.js; don't re-scrape scripts.
- **Writing tracking files before index.json is finalized:** In `downloadAsZip()`, `indexData` is built then written to `fileTree['index.json']` at the end. The tracking summary modifies `indexData` in-place — ensure the tracking block runs before `fflate.strToU8(JSON.stringify(indexData))`.
- **Placing schema derivation in content.js:** Schema derivation is processing work. Content.js sends raw data; background.js processes and assembles. Consistent with Phase 3 split.
- **Using `window.gtag` call history:** `window.gtag` is a function, not an array. Intercepting its call history requires a persistent proxy — out of scope and requires `document_start`. The snapshot approach reads `window.dataLayer` which IS an array.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization of large dataLayer | Custom serializer | `JSON.stringify` with null reviver | dataLayer entries are plain objects; circular refs are rare and can be caught with try/catch |
| ZIP file encoding | Custom base64/binary encoder | `fflate.strToU8()` (already in use) | Already used for all other JSON files in the ZIP |
| Deep clone of dataLayer | Manual recursive clone | `JSON.parse(JSON.stringify(arr))` | Sufficient for plain data; avoids reference aliasing where site code mutates the array post-snapshot |

**Key insight:** This phase is almost entirely data wiring — read globals, reduce to schema, write JSON. There are no complex algorithms to implement. The hard problems (chunked IPC transport, ZIP assembly, fflate integration) are already solved.

---

## Common Pitfalls

### Pitfall 1: window.dataLayer undefined vs empty array
**What goes wrong:** Sites without GTM have no `window.dataLayer` — accessing it throws or returns `undefined`. Code that does `window.dataLayer.length` without a guard crashes.
**Why it happens:** `dataLayer` is initialized by the GTM snippet. Sites with GA4 (no GTM) may or may not initialize it. Sites with no analytics have nothing.
**How to avoid:** Always guard: `Array.isArray(window.dataLayer) ? window.dataLayer : []`. Do not use `window.dataLayer || []` alone — a non-array value passes `|| []` and breaks downstream `.map()`.
**Warning signs:** TypeError in content.js; `trackingData.dataLayer` is undefined.

### Pitfall 2: index.json tracking summary written before tracking files
**What goes wrong:** `indexData` is constructed at the top of `downloadAsZip()` with `tracking: false`. If Phase 4 code runs after `fileTree['index.json']` is set, the index file still shows `tracking: false`.
**Why it happens:** The existing code sets `fileTree['index.json'] = fflate.strToU8(JSON.stringify(indexData, null, 2))` once. Mutations to `indexData` after that point don't affect the already-encoded bytes.
**How to avoid:** Ensure all `indexData` modifications (including `indexData.tracking = {...}` and `indexData.stages.tracking = true`) happen BEFORE the `fileTree['index.json']` assignment. Alternatively, move the `fileTree['index.json']` assignment to after all blocks run.
**Warning signs:** ZIP contains `"tracking": false` even after Phase 4 is implemented.

### Pitfall 3: Deep-cloning circular or non-serializable dataLayer entries
**What goes wrong:** Some sites push DOM element references or function references into `dataLayer`. `JSON.stringify` throws on these.
**Why it happens:** The GTM spec says dataLayer entries should be plain data, but sites don't always comply. React-based sites sometimes push component instances.
**How to avoid:** Wrap `JSON.parse(JSON.stringify(window.dataLayer))` in try/catch. If it fails, fall back to `window.dataLayer.map(entry => { try { return JSON.parse(JSON.stringify(entry)); } catch (_) { return { _serializationError: true, keys: Object.keys(entry || {}) }; } })`.
**Warning signs:** Content script crashes on certain sites; `trackingData` is null when it should have data.

### Pitfall 4: google_tag_manager object structure is not documented
**What goes wrong:** Accessing `window.google_tag_manager[containerId].tags` throws because the internal structure varies by GTM version and configuration.
**Why it happens:** `window.google_tag_manager` is an internal GTM object, not a public API. Its structure is reverse-engineered from GTM's minified output and can change.
**How to avoid:** Wrap all `window.google_tag_manager` property access in try/catch. Only extract what is reliably present: the container ID keys (always present), and optionally iterate the object shallowly for known-safe properties. Use `Object.keys(window.google_tag_manager)` to get container IDs — this is stable.
**Warning signs:** `gtm.tags` throws on certain sites; schema.json missing gtm block.

### Pitfall 5: dataLayer entries without an `event` key
**What goes wrong:** Some pushes set variables without firing events: `dataLayer.push({ userId: '123' })`. These have no `event` property. The schema derivation groups them under `__no_event_key__` (or similar), which is fine for raw capture but looks odd in `uniqueEventNames`.
**Why it happens:** GTM supports two push types: event pushes (have `event` key) and variable pushes (no `event` key). Both are valid.
**How to avoid:** In `deriveEventSchema`, group non-event pushes under a sentinel key (e.g. `__variables__` or `__no_event_key__`). In the tracking summary for `index.json`, exclude the sentinel from `uniqueEventNames` — only list actual event names.
**Warning signs:** `uniqueEventNames` contains `"__no_event_key__"` in the index.json summary.

### Pitfall 6: Large dataLayer arrays crossing IPC via sendChunked
**What goes wrong:** Sites with heavy analytics (ecommerce with many product impressions) can have dataLayer arrays with thousands of entries — easily exceeding the 256 KB chunking threshold.
**Why it happens:** Product listing pages push one entry per product impression. 200 products × typical entry size = large payload.
**How to avoid:** `sendChunked()` already handles this. The `trackingData` key is part of the full analysis result object returned by `analyzeWebsite()` — it routes through `sendChunked` automatically at the ANALYZE_WEBSITE action handler (content.js line ~1724). No special handling needed; the existing chunked transport covers it.
**Warning signs:** None — this is handled automatically by the existing infrastructure.

---

## Code Examples

Verified from codebase inspection:

### Existing fileTree pattern (from background.js ~line 697)
```javascript
// Network data — same pattern tracking/ should follow
if (networkData && networkData.length > 0) {
  fileTree['network/'] = {
    'requests.json': fflate.strToU8(JSON.stringify(networkData, null, 2))
  };
}
```

### Existing thirdPartyServices structure (from content.js ~line 695)
```javascript
// Each service has: { name, urls: [...], category }
// Category 'Analytics' covers Google Analytics, Adobe Analytics, Mixpanel, Segment, etc.
services.push({
  name: service.name,
  urls: [url],
  category: this.categorizeService(service.name)
});
```

### Existing analysis return object (from content.js ~line 210)
```javascript
return {
  url: window.location.href,
  title: document.title,
  assets: this.assets,
  frameworks: this.frameworks,
  thirdPartyServices: this.thirdPartyServices,
  // ... other keys ...
  // Phase 4 adds: trackingData: this.captureTrackingData()
};
```

### Existing index.json structure (from background.js ~line 641)
```javascript
const indexData = {
  url: analysisData.url || packageData.url,
  // ...
  stages: {
    html: !!(analysisData.scopedHtml),
    css: false,
    computedStyles: !!(analysisData.computedStyles),
    assets: fetchedAssets.length > 0,
    network: networkData && networkData.length > 0,
    tracking: false  // <-- Phase 4 replaces with true + summary object
  },
  // ...
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `document_start` content script for dataLayer proxy | Snapshot `window.dataLayer` at click time | Decided in Phase 4 CONTEXT | No manifest changes, no architectural conflict |
| Full GTM container script fetch/parse | Container ID + tag list from `window.google_tag_manager` | Decided in Phase 4 CONTEXT | Simpler, sufficient for LLM reconstruction |

**Resolved research flags from STATE.md:**
- `document_start` persistent content script conflict: RESOLVED — snapshot approach avoids this entirely. No `document_start` needed.

---

## Open Questions

1. **GTM tag list depth — tag name only vs tag type + name**
   - What we know: `window.google_tag_manager[id]` internal structure varies; tag list is not guaranteed to be present in a stable form.
   - What's unclear: Whether attempting to extract tag names from `window.google_tag_manager` is reliable enough to be useful, or whether it consistently yields useful data.
   - Recommendation (Claude's Discretion): Attempt shallow extraction of `window.google_tag_manager[containerId]` keys; if the structure yields recognizable tag objects, include tag names. If it returns internal implementation keys, omit `tags` entirely from schema.json rather than expose confusing data. The planner should decide whether to include a defensive fallback that sets `tags: []` when extraction is unreliable.

2. **Malformed dataLayer entries — entries without `event` key**
   - What we know: These are valid GTM variable pushes. They need to appear in events.json but should be excluded from `uniqueEventNames` in index.json.
   - What's unclear: Whether to group them under a sentinel key in schema.json or skip them in schema derivation entirely (while keeping them in events.json).
   - Recommendation (Claude's Discretion): Group under `__variables__` in schema.json for completeness. Exclude sentinel from index.json `uniqueEventNames`. This preserves all data while keeping the summary clean.

3. **Timestamp estimation for dataLayer events**
   - What we know: `dataLayer` is a plain array of push objects — GTM does not store timestamps natively. Adding timestamps would require an intercept proxy, which is ruled out.
   - What's unclear: Whether to include an `_capturedAt` ISO timestamp on the events.json output level (when the snapshot was taken) as context for the LLM.
   - Recommendation (Claude's Discretion): Add a single top-level `snapshotAt` ISO timestamp to events.json (not per-entry) indicating when the dataLayer was read. This gives the LLM temporal context without fabricating per-event timestamps.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (node environment) |
| Config file | `jest.config.js` (project root) |
| Quick run command | `npx jest tests/unit/tracking.test.js --no-coverage` |
| Full suite command | `npx jest tests/unit/ --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRACK-01 | captureTrackingData() returns dataLayer array + gtm object | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | deriveEventSchema() deduplicates by event name | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | deriveEventSchema() collects property union across pushes | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | deriveEventSchema() records first-occurrence example value per property | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | schema.json output shape: `{ events, gtm, analytics }` | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | index.json tracking summary shape: `{ hasGtm, containerId, eventCount, uniqueEventNames }` | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | Handles absent window.dataLayer gracefully (empty array output) | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | Handles absent google_tag_manager gracefully (hasGtm: false) | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |
| TRACK-01 | ZIP tracking/ directory contains events.json and schema.json | unit | `npx jest tests/unit/tracking.test.js --no-coverage` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/tracking.test.js --no-coverage`
- **Per wave merge:** `npx jest tests/unit/ --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/tracking.test.js` — covers all TRACK-01 test cases above
- [ ] No new fixtures needed — tests use inline mock data (consistent with established Phase 3 pattern: inline function copies, no module system)

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `background.js` lines 626-733 (`downloadAsZip`), 640-668 (fileTree scaffolding, index.json structure)
- Direct codebase inspection: `content.js` lines 144-230 (`analyzeWebsite`), 590-690 (`identifyThirdPartyServices`)
- Direct codebase inspection: `tests/unit/*.test.js` (established test patterns)
- `.planning/phases/04-tracking-plan/04-CONTEXT.md` — all architectural decisions locked

### Secondary (MEDIUM confidence)
- `window.dataLayer` as a plain JavaScript array is the GTM standard — GTM initializes it as `window.dataLayer = window.dataLayer || []` in the snippet, making `Array.isArray(window.dataLayer)` a reliable check
- `window.google_tag_manager` keyed by container ID is observable behavior, consistent across GTM versions inspected in devtools

### Tertiary (LOW confidence)
- GTM `window.google_tag_manager[id]` internal structure for tag list extraction — not a public API, may vary

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing fflate and Jest
- Architecture: HIGH — all decisions locked in CONTEXT.md; codebase integration points verified by direct inspection
- Pitfalls: HIGH — most pitfalls derived from direct code reading (existing patterns, existing fileTree construction)
- GTM internal object: LOW — `window.google_tag_manager` internals are not a public API

**Research date:** 2026-03-17
**Valid until:** 2026-04-17 (stable domain — Chrome extension APIs and GTM dataLayer spec are stable)
