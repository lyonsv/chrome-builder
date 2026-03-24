# Milestones

## v1.0 MVP (Shipped: 2026-03-24)

**Phases completed:** 7 phases, 16 plans, 31 tasks

**Key accomplishments:**

- Grep audit for istock/getty/shutterstock passes zero matches across all .js, .html, .json files; detection comments now describe observable signals not site names
- chrome.alarms keep-alive (30s interval per tab) and chrome.storage.session checkpoints prevent data loss in long analysis sessions, with SW startup recovery resuming or discarding stale sessions
- fflate 0.8.2 vendored via importScripts; single-JSON download replaced by ZIP assembly with index.json + 6-directory Phase 3 scaffold, no OS save dialog
- Chunked IPC transport with 512 KB chunks, per-chunk ack, 3-retry backoff, and live progress bar — routes 2-5 MB payloads through background service worker without hitting Chrome IPC limits
- Jest installed with Chrome API mocks and 53 test.todo() stubs covering all Phase 3 requirements (SCOPE-01/02/03, TRACK-02)
- Popup element picker with injected overlay, blue outline hover highlight, click-to-lock selection, Escape cancel, selection summary panel, and scope-aware analysis button label
- DOM component name detection via React fiber walk, Vue/Angular internal properties, BEM class patterns, and data-attribute scanning — returns { name, source, selector, children } tree usable by Plan 04
- 1. [Rule 1 - Bug] Fixed Jest toHaveProperty() with slash/dot keys in zip-structure.test.js
- captureTrackingData() on WebsiteAnalyzer snapshots window.dataLayer with deep clone + GTM container ID extraction, wired into analyzeWebsite() return object, with 13 unit tests
- Event schema derivation in background.js with ZIP writes to tracking/ directory, index.json tracking summary, and popup Tracking Events count display
- GET_ANALYSIS pull pattern: popup now fetches display summary from background after content script analysis, fixing all-zero count bug caused by reading undefined response.data
- Network-request-based third-party service detection via URL pattern matching in background.js, replacing popup.js hardcoded hostname map — TRACK-03 fully satisfied.
- CSS URL extraction with three-strategy detection and ZIP population via fetchAssets() pattern, closing SCOPE-02 gap for the css/ directory
- 35 Jest unit tests verify STYLE-01, STYLE-02, STYLE-03 via inline function copies with plain-object mock DOM — all pass, full suite green

---
