# Phase 6: Fix Detection and CSS Export - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 06-fix-detection-and-css-export
**Areas discussed:** Fallback detection strategy, CSS directory contents, Fallback path behavior

---

## Fallback Detection Strategy

### Q1: What should replace detectServicesForKnownSites()?

| Option | Description | Selected |
|--------|-------------|----------|
| Remove entirely (Recommended) | Delete detectServicesForKnownSites() and all callers. Content script's generic detection is source of truth. If content script fails (CSP), accept empty services. | ✓ |
| Script URL pattern matching | Replace hostname map with generic patterns scanning network requests for known analytics/service script URLs | |
| Merge with content.js detection | Move all service detection to content.js categorizeService() and have popup always pull results from content script | |

**User's choice:** Remove entirely (Recommended)
**Notes:** None

### Q2: Fallback returns empty array or tries lightweight alternative?

| Option | Description | Selected |
|--------|-------------|----------|
| Empty array | thirdPartyServices: [] in fallback. Honest output when DOM inspection fails. | |
| Network-based detection | Query background.js for captured network requests and infer services from request URLs. Works even when CSP blocks DOM inspection. | ✓ |

**User's choice:** Network-based detection
**Notes:** Network requests already captured by chrome.webRequest in background, so data is available regardless of CSP.

### Q3: New utility or reuse categorizeService()?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse categorizeService() approach | Same category mapping from content.js, applied to network request URLs. One source of truth. | ✓ |
| You decide | Claude picks cleanest implementation | |

**User's choice:** Reuse categorizeService() approach
**Notes:** None

---

## CSS Directory Contents

### Q1: What should css/ contain?

| Option | Description | Selected |
|--------|-------------|----------|
| External stylesheets only (Recommended) | Fetch each linked stylesheet href via background SW. Inline <style> blocks already in HTML output. | ✓ |
| External + inline <style> | Both fetched external sheets AND extracted inline <style> contents as separate files. | |
| All CSS sources | External sheets, inline <style>, plus CSS-in-JS from computed styles. Maximum coverage. | |

**User's choice:** External stylesheets only (Recommended)
**Notes:** None

### Q2: How should files be named?

| Option | Description | Selected |
|--------|-------------|----------|
| Original filename from URL | e.g., styles.css, main.css. Collisions with counter suffix. Same as Phase 3 assets. | ✓ |
| Index-based naming | e.g., stylesheet-001.css. Predictable ordering, no collision handling. | |
| You decide | Claude picks based on consistency | |

**User's choice:** Original filename from URL
**Notes:** None

### Q3: How to handle fetch failures?

| Option | Description | Selected |
|--------|-------------|----------|
| Same as asset failures (Recommended) | Skip from css/, record URL + failure reason in index.json failedAssets. Consistent with Phase 3. | ✓ |
| Placeholder file | Write placeholder with URL and error comment | |

**User's choice:** Same as asset failures (Recommended)
**Notes:** None

### Q4: Should css/ respect element scoping?

| Option | Description | Selected |
|--------|-------------|----------|
| Include all stylesheets always | Simpler. CSS files are small. LLM can filter. | ✓ |
| Scope-aware filtering | Only include sheets with matching selectors. More precise but complex. | |
| You decide | Claude picks based on complexity vs value | |

**User's choice:** Include all stylesheets always
**Notes:** None

---

## Fallback Path Behavior

### Q1: Should fallback path also fetch CSS?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, fetch CSS in fallback too | CSS link hrefs discoverable even when DOM inspection fails. Gives LLM stylesheet data in degraded mode. | ✓ |
| No, CSS only in normal path | Keep fallback minimal. CSS only on successful DOM inspection. | |
| You decide | Claude picks based on href availability in fallback | |

**User's choice:** Yes, fetch CSS in fallback too
**Notes:** None

### Q2: Where do stylesheet URLs come from in fallback?

| Option | Description | Selected |
|--------|-------------|----------|
| Network request log (Recommended) | Background SW captures all requests via chrome.webRequest. Filter for text/css. Same source as network-based service detection. | ✓ |
| HTML string parsing | Fetch page HTML via background SW, parse link rel=stylesheet hrefs from raw HTML. | |

**User's choice:** Network request log (Recommended)
**Notes:** None

---

## Claude's Discretion

- Exact implementation of network request URL → service name mapping
- How to extract CSS URLs from network request log (content-type filtering vs URL pattern matching)
- Whether to add a css summary field to index.json

## Deferred Ideas

None — discussion stayed within phase scope.
