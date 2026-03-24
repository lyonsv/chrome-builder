# Phase 1: Infrastructure Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the reliability infrastructure that all subsequent phases depend on: service worker keep-alive and checkpoint recovery during long-running analysis sessions, chunked IPC transport for large payloads (2-5MB computed styles), ZIP-based directory download replacing the current single-JSON download, and removal of all hardcoded site names from the codebase. This phase does NOT add new capture capabilities — it makes the existing extension robust enough to build on.

</domain>

<decisions>
## Implementation Decisions

### Service Worker Recovery
- **Strategy:** Both prevent AND recover — use `chrome.alarms` to ping the SW every ~20s during active analysis (prevents dormancy), AND checkpoint progress to `chrome.storage.session` for recovery if it still dies
- **Checkpoint granularity:** Per-stage (after each major stage completes: DOM capture, style extraction, network capture, etc.) — resume from the last completed stage, not from scratch
- **On popup reopen after SW restart:** Show a brief dismissable "Analysis resumed from checkpoint" notice, then auto-continue — no user decision required

### ZIP Library
- **Library:** fflate (preferred: ~35KB, pure-JS, fastest, service-worker compatible)
- **Inclusion:** Vendor file — commit as `/vendor/fflate.min.js`, import via `importScripts()` in background.js. No inlining.
- **Replace old download:** Remove the single-JSON `chrome.downloads` path entirely — ZIP is the only output from Phase 1 forward. No fallback.
- **ZIP directory structure:** Pre-scaffold the final layout from Phase 1: `index.json` at root + empty `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` subdirs. Phase 1 populates what exists; later phases fill the rest.

### Detection Cleanup (TRACK-03)
- **Scope:** Remove the 2 named comment references (content.js:337, popup.js:484) AND audit all detection logic to ensure no site names appear in string literals, regexes, or conditions anywhere in the codebase
- **Detection approach:** Observable signals only — detect by global variables (e.g. `window.__MF_REMOTES__`), DOM attributes, script URL patterns, and data structures. No site-name wrapping conditions.
- **site4source.html:** Remove or rename to a generic name (e.g. `test-page.html`) — it's in the public repo and violates the generic-only rule

### IPC Chunked Transport
- **Failure handling:** Retry failed chunks — each chunk requires an ack; if no ack within timeout, resend that chunk. After N retries exhausted, surface an error to the user.
- **Chunk sizing:** Dynamic / auto-sized — start at a sensible default (researcher to determine safe default based on Chrome IPC limits), back off to smaller chunks if errors occur
- **Progress display:** Show transfer progress in the popup status bar during large transfers (e.g. "Transferring data... 3 / 12 chunks")
- **Exhausted retry error:** Show "Transfer failed after N retries — the page may be too large." with a [Retry Analysis] button that starts fresh

### Claude's Discretion
- Exact chunk retry count (3 is reasonable) and timeout values
- Alarm interval for SW keep-alive (20s suggested)
- Exact error messages and copy
- Storage key naming conventions for checkpoints
- Whether to preserve `output.json` in repo as a gitignored sample or delete it

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `background.js` (484L): Already has `chrome.storage.local` persistence logic — extend to `storage.session` for checkpoints
- `background.js` `downloadAnalysisPackage()`: Current single-file download target — replace with ZIP assembly + single `chrome.downloads` call
- `chrome.runtime.onMessage` listener in background.js: Extend for chunked message protocol

### Established Patterns
- **No build system**: All JS files are plain vanilla JS, loaded directly. New vendor files go in `/vendor/` and are loaded via `importScripts()` in the SW or `<script>` in popup pages
- **Permissions already declared**: `downloads`, `storage`, `scripting`, `tabs`, `webRequest` all in manifest — no manifest changes needed for this phase
- **Single SW file**: background.js is the only service worker; all SW logic lives there

### Integration Points
- `popup.js` triggers analysis and listens for results — chunk receiver and progress UI live here
- `content.js` runs in the page context — chunk sender lives here
- `background.js` orchestrates download — ZIP assembly and `chrome.downloads` call live here

</code_context>

<specifics>
## Specific Ideas

- fflate specifically called out in STATE.md as the preferred ZIP candidate
- ZIP structure must match the final Phase 3 directory layout from day 1 (index.json + 6 subdirs) — don't design Phase 1 ZIP structure in isolation
- Detection audit success criterion: `grep -r "site4\|site1\|site2" .` returns zero matches in shipped code (comments included)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-infrastructure-foundation*
*Context gathered: 2026-03-13*
