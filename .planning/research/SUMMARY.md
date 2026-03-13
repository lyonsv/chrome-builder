# Project Research Summary

**Project:** Website Asset Capture Extension (LLM-Ready UI Reconstruction)
**Domain:** Chrome Extension MV3 — computed style extraction, cross-origin asset capture, structured directory output
**Researched:** 2026-03-13
**Confidence:** HIGH (core MV3 APIs stable; findings derived from live codebase analysis and authoritative API documentation)

## Executive Summary

This is a subsequent milestone for an existing Chrome MV3 extension that already captures HTML, CSS/JS URLs, assets, framework detection, network requests, and Next.js/module-federation metadata. The new milestone's goal is to make the extension's output consumable by an LLM for pixel-perfect React component reconstruction and design system extraction. The three capabilities that unlock this goal — computed styles per element, structured directory output, and actual asset file downloading — are all technically achievable using only APIs already declared in the manifest, with no new dependencies or build tooling required.

The recommended approach is to extend the existing four-context architecture (content script extracts, background assembles and proxies, popup orchestrates, background downloads) rather than restructure it. Computed style extraction belongs in the content script with aggressive deduplication applied before data crosses any message boundary. Cross-origin asset fetching belongs exclusively in the background service worker, which holds `<all_urls>` host permissions and is exempt from page CSP. Structured output should be assembled as a flat manifest of JSON files per category (not one giant JSON blob and not hundreds of individual binary downloads) to stay within LLM context window limits and avoid catastrophic "Ask where to save" UX for users.

The dominant risks are service worker dormancy killing in-memory state during long-running analysis, `getComputedStyle` blocking the page's main thread if called naively in a loop, and `chrome.downloads` producing one OS dialog per asset file if the download strategy is not decided upfront. All three are fully preventable with known patterns and must be addressed as design constraints in the first phase of implementation, not as follow-up optimisations.

---

## Key Findings

### Recommended Stack

The entire milestone is implementable with native Chrome Extension APIs already declared in `manifest.json`. No npm packages, no build system, no new permissions beyond what is already present. The only version gate is Chrome 132+ for `URL.createObjectURL` in service workers (released November 2024; safe to target by 2026). The existing `debugger` permission should NOT be extended to cover computed styles — a content-script `getComputedStyle` approach is equivalent in output, faster for batch extraction, and avoids the alarming install warning that CDP requires.

**Core technologies:**
- `chrome.scripting.executeScript` (content script context) — computed style extraction, dataLayer capture, component boundary annotation — the page's live DOM is only accessible here
- Background service worker `fetch()` with `<all_urls>` host permission — cross-origin asset fetching — extension origin bypasses page CORS restrictions
- `chrome.downloads.download` with path-prefixed `filename` — structured directory output — Chrome creates subdirectory structure automatically from forward-slash-separated paths
- `chrome.storage.session` (Chrome 102+) — large in-flight state staging — ephemeral, survives service worker restarts, not subject to `storage.local` 10 MB quota trap
- `chrome.runtime.connect` long-lived port — service worker keepalive during long-running analysis — prevents dormancy-induced state loss

### Expected Features

The LLM reconstruction workflow fails without all six table-stakes features. The differentiators are what distinguish this from a generic "save page" tool and are what power users need for design system migration work.

**Must have (table stakes) — this milestone:**
- Computed styles per element (deduplicated, property-allowlisted ~60 properties) — without this, LLM sees class names with no idea what they resolve to
- Interaction state styles (`:hover`, `:focus`, `:active`, `:disabled`) — critical for button and input reconstruction fidelity
- CSS custom property resolution — dual output: resolved values plus the token variable names; required for design system vocabulary
- Structured directory output with manifest index — single JSON blob is too large for LLM context windows; directory lets callers load only what they need
- Component-scoped capture — full-page computed style dumps are 20–100 MB; scoping to a subtree makes output tractable
- Actual asset files downloaded (images, fonts, icons) — URL references are insufficient for pixel-perfect SVG icons and custom fonts

**Should have (competitive differentiators):**
- Component boundary detection (React fiber `__reactFiber`, Vue `__vue__`, Angular, `data-component` / `data-testid` patterns) — enables LLM to generate reusable components rather than monolithic pages
- GA/tracking plan extraction (dataLayer history, GTM container config, event schema) — full-fidelity migration including analytics instrumentation
- Agnostic pattern-based detection — removes all hardcoded site names; required for public repo trust and correctness
- Design token extraction — CSS custom property declarations structured as a token file alongside raw computed values
- Visual screenshot of captured scope — ground truth for LLM visual comparison

**Defer to subsequent milestone (v2+):**
- Element selector overlay (interactive click-to-select UI) — high complexity; CSS selector scoping is sufficient for MVP
- Responsive breakpoint capture — valuable but adds significant stylesheet iteration complexity
- Diff-aware re-capture — requires persistent storage of prior captures; separate milestone
- `window.showDirectoryPicker()` custom save location — unnecessary complexity for V1; `chrome.downloads` with path prefixes is adequate

**Explicit anti-features (do not build):**
- Full JS runtime execution tracing via CDP — prohibitive complexity, output not useful for visual reconstruction
- Site-specific hardcoded detection (`detectServicesForKnownSites`) — currently in codebase, must be removed not extended
- Database / MCP integration — the extension's job ends at the filesystem
- Build system or bundler — violates the no-toolchain constraint; extension must remain loadable unpacked

### Architecture Approach

The existing four-context architecture is sound and requires no restructuring. New capabilities map cleanly onto it using additive extension of the `analyzeWebsite()` return shape (new top-level keys, existing callers unaffected) and options-gated execution (expensive operations default off, user opt-in). The single most important architectural discipline is: run all size-reducing transformations (deduplication, property filtering) inside the content script before any data crosses a message boundary.

**Major components:**
1. `content.js` (WebsiteAnalyzer) — computed styles extraction (with dedup-first), interaction-state CSS rule iteration, dataLayer/GTM capture, component hierarchy DOM traversal
2. `background.js` (MigrationAnalyzer) — cross-origin asset fetch proxy, directory package assembly, sequential multi-file download orchestration, service worker keepalive via long-lived port
3. `popup.js` (PopupController) — orchestration, options toggles for heavy extraction, per-file download progress display

### Critical Pitfalls

1. **Service worker dormancy kills in-memory state** — getComputedStyle extraction on large DOMs takes 5–30+ seconds, exposing the ~30-second inactivity termination window. Prevention: use `chrome.runtime.connect` long-lived port (keeps service worker alive) for the entire analysis session. Address before any computed-style implementation.

2. **getComputedStyle forced reflow in a tight loop** — calling it synchronously on every DOM element serialises forced layout recalculations and can timeout the content script. Prevention: deduplicate by tag+class signature first (reducing calls from 2000+ to hundreds), then extract in idle-scheduled chunks of ~50 elements. Must be a design constraint in initial implementation, not a later optimisation.

3. **chrome.downloads spawning one OS dialog per asset file** — users with "Ask where to save" enabled get a dialog per file. Prevention: decide the download strategy before implementation. For JSON output files (5–10 files), sequential `chrome.downloads` with path prefixes is fine. For binary asset files (potentially 50–200), zip all assets into a single download.

4. **Oversized sendMessage payload crashes the message channel** — undeduped computed styles for a full page can reach 20–100 MB; Chrome's practical limit is ~5–10 MB before renderer stall. Prevention: deduplication + property allowlist in content script reduces payload to 2–3 MB on typical pages; chunk streaming via long-lived port for any remainder.

5. **Cross-origin asset fetch returns opaque 0-byte response from content script** — CORS opaque responses resolve successfully but contain no data. Prevention: route all asset fetches through the background service worker (extension origin + `<all_urls>` host permission bypasses CORS); always validate `response.type !== 'opaque'` and `response.status !== 0`.

---

## Implications for Roadmap

Based on research, the following six-phase structure is recommended. Phases 1–3 are the core milestone. Phases 4–6 are differentiators.

### Phase 1: Service Worker Reliability and Output Foundation
**Rationale:** Every subsequent feature depends on in-memory state surviving the full analysis session and on a directory output format that replaces the current single-JSON download. These are infrastructure, not features — but without them, every other phase ships on an unstable foundation. The service worker dormancy pitfall is triggered by Phase 2 work; it must be fixed first.
**Delivers:** Long-lived port keepalive architecture, `chrome.storage.session` staging for large state, multi-file directory output format with manifest index, removal of hardcoded site-specific detection patterns
**Addresses:** Structured directory output (table stakes), agnostic pattern-based detection (differentiator)
**Avoids:** Pitfall 1 (service worker dormancy), Pitfall 10 (storage.local quota), Anti-pattern 4 (persisting full analysis to storage)

### Phase 2: Computed Styles Extraction
**Rationale:** Computed styles are the single highest-value gap identified in PROJECT.md and the core capability the entire LLM reconstruction workflow requires. Must follow Phase 1 so the keepalive infrastructure is in place before triggering long-running extraction.
**Delivers:** Deduplicated `getComputedStyle` map with ~60-property allowlist, CSS custom property resolution (resolved values + token names), interaction-state rules from `document.styleSheets`, viewport metadata at capture time
**Addresses:** Computed styles per element (table stakes), CSS custom property resolution (table stakes), interaction state styles (table stakes), font metadata, spacing/layout capture, color normalization
**Uses:** `chrome.scripting.executeScript` in content script context, idle-scheduled chunked extraction, long-lived port streaming
**Avoids:** Pitfall 2 (forced reflow), Pitfall 5 (oversized message payload), Pitfall 6 (computed values losing responsive intent), Pitfall 11 (re-injection guard defeating re-capture)

### Phase 3: Cross-Origin Asset Downloading
**Rationale:** Binary assets (icons, fonts, images) are required for pixel-perfect output but are blocked from content-script fetch by page CSP and CORS. Must follow Phase 1 (directory structure) because assets land in `/assets/` subdirectories established in Phase 1.
**Delivers:** Background service worker fetch proxy for cross-origin binary assets, filename sanitisation and collision handling, dual-path font fetch (background first, content-script fallback), per-file download progress reporting, configurable asset size cap with URL-only fallback for oversized assets
**Addresses:** Actual asset files downloaded (table stakes)
**Uses:** Background `fetch()` with `<all_urls>` host permission, `chrome.downloads.download` with path prefixes
**Avoids:** Pitfall 3 (chrome.downloads OS dialog explosion — zip binary assets into one call), Pitfall 4 (CORS opaque 0-byte responses), Pitfall 8 (invalid filename characters), Pitfall 13 (font CORS dual-origin)

### Phase 4: Component Boundary Detection and Scope Selection
**Rationale:** Without scoping, full-page computed style output is 20–100 MB — too large for any single LLM context window. Component boundary detection enables both the component-scoped capture feature and the differentiating component hierarchy output. Depends on the DOM traversal infrastructure built in Phase 2.
**Delivers:** Component boundary annotation using React fiber / Vue / Angular / data-attribute patterns, component-scoped capture (CSS selector or subtree), component-map output file correlating component names to style fingerprints
**Addresses:** Component-scoped capture (table stakes critical gap), component boundary detection (differentiator)
**Avoids:** Anti-pattern 5 (hardcoded site-specific selectors), full-page unscoped dump anti-feature

### Phase 5: Tracking Plan Extraction
**Rationale:** Self-contained in content script with no dependencies on prior phases. Can ship independently but benefits from Phase 1's directory output (tracking data lands in `/tracking/`). The dataLayer proxy requires a `document_start` content script declaration — evaluate against persistent content-script constraints before implementation.
**Delivers:** `window.dataLayer` push history capture, GTM container config (`window.google_tag_manager`), GA4 event schema via `gtag` proxy, tracking output in structured directory
**Addresses:** GA/tracking plan extraction (differentiator)
**Avoids:** Pitfall 9 (dataLayer capture missing pre-injection events — decide between `document_start` proxy vs documented point-in-time limitation)

### Phase 6: Design Token Extraction and Visual Screenshot
**Rationale:** Both build on completed prior phases. Design token extraction is a post-processing layer on Phase 2's CSS variable resolution. Screenshot scoping extends existing `chrome.tabs.captureVisibleTab` with element coordinate clipping.
**Delivers:** Structured design token file (`--spacing-*`, `--color-*`, `--font-*`, `--radius-*` patterns), per-component token association, scoped visual screenshot clipped to captured element bounds
**Addresses:** Design token extraction (differentiator), visual screenshot of captured scope (differentiator)

### Phase Ordering Rationale

- Phase 1 must come first because service worker dormancy is triggered by Phase 2 work; the infrastructure must be stable before any long-running operation ships
- Phases 2 and 3 are the core table-stakes deliverables; they are ordered because asset downloading requires the directory structure Phase 1 establishes and benefits from knowing which assets were referenced in Phase 2's style extraction
- Phase 4 (scoping) logically follows Phase 2 (styles) because it builds on the same DOM traversal loop and reduces the output size that Phase 2 produces
- Phase 5 (tracking) is independent and can be reprioritised ahead of Phase 4 if stakeholders value analytics migration over component scoping
- Phase 6 (tokens + screenshot) is purely additive and has no downstream dependents; defer without risk

### Research Flags

Phases needing deeper research during planning:
- **Phase 3 (asset downloading):** The zip-vs-multi-download decision requires a concrete evaluation of JSZip/fflate as a zero-dependency single-file include. Research whether fflate can be inlined as a plain JS file without a build step before committing to the zip approach.
- **Phase 4 (component boundaries):** React 18/19 fiber property names (`__reactFiber`, `__reactProps`) should be verified against current React internals before implementation. These are community-documented, not officially stable APIs.
- **Phase 5 (tracking):** The `document_start` persistent content script approach needs evaluation against the project's no-persistent-content-script preference documented in existing CONCERNS.md.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1:** Service worker keepalive via long-lived ports is a documented, stable MV3 pattern; `chrome.storage.session` API is stable since Chrome 102
- **Phase 2:** `getComputedStyle`, `document.styleSheets` / `CSSRuleList` iteration are standard browser APIs with no ambiguity
- **Phase 6:** Design token naming conventions and screenshot coordinate clipping are straightforward post-processing on already-collected data

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All APIs are stable MV3 APIs already declared in manifest; Chrome 132+ `URL.createObjectURL` constraint is verified; no external dependencies |
| Features | MEDIUM | Table stakes and differentiators derived from codebase analysis and domain expertise; competitor feature landscape not directly verified (no web access during research) |
| Architecture | HIGH | Derived from live codebase inspection; component context boundaries are hard constraints of the MV3 API model, not design preferences |
| Pitfalls | HIGH | Core MV3 pitfalls (dormancy, message size, downloads API) are well-documented stable behavior; CORS opaque response behavior is specified; GTM dataLayer timing is MEDIUM (GTM internals vary) |

**Overall confidence:** HIGH for implementation-ready phases (1–3); MEDIUM for differentiator phases (4–6) pending React fiber API verification and zip library evaluation.

### Gaps to Address

- **Zip strategy for binary asset downloads:** The decision between single-zip-download (better UX, requires an inlined pure-JS zip library) vs multi-file downloads (zero dependencies, poor UX with "Ask where to save") must be made before Phase 3 begins. Evaluate fflate as a zero-dependency single-file include.
- **React fiber property names in React 18/19:** `__reactFiber` and `__reactProps` are the documented community approach for component name extraction; verify these are still the correct property names in React 18 and 19 before Phase 4 implementation.
- **Persistent vs on-demand content script for dataLayer proxy:** `document_start` injection gives complete dataLayer capture but implies a persistent content script on every page load. Evaluate whether this conflicts with the extension's existing on-demand injection model before Phase 5 design.
- **Shadow DOM component traversal:** `querySelectorAll('*')` does not pierce shadow roots. Phase 2 and Phase 4 both need a recursive shadow-root traversal helper. Note as known limitation in output metadata when shadow roots are detected.
- **Auth-gated assets:** Assets requiring page session cookies cannot be fetched from the service worker (which runs without page cookies). Phase 3 needs a content-script fallback path for these cases, with binary data relayed via messaging.

---

## Sources

### Primary (HIGH confidence)
- Chrome Extension MV3 API documentation (developer.chrome.com/docs/extensions) — scripting, downloads, storage, runtime messaging, host permissions, service worker lifecycle
- Live codebase: `content.js`, `background.js`, `popup.js`, `manifest.json`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/ARCHITECTURE.md` — existing constraints and patterns directly observed
- MDN Web APIs: `window.getComputedStyle`, `document.styleSheets`, `CSSRuleList`, CORS opaque responses — browser standard behavior

### Secondary (MEDIUM confidence)
- Chrome 132 release notes re: `URL.createObjectURL` in service workers (knowledge cutoff August 2025; Chrome 132 released November 2024)
- React fiber internals (`__reactFiber`, `__reactProps`) for component boundary detection — well-documented community technique, React 16–17 era; verify for React 18/19
- GTM dataLayer timing behavior — widely observed but GTM internals vary by container configuration

### Tertiary (LOW confidence)
- Competitor landscape (Responsively, VisBug, CSS Used Chrome extension, Figma dev mode, Storybook capture) — not directly verifiable without web access; reflects training-data knowledge through August 2025

---
*Research completed: 2026-03-13*
*Ready for roadmap: yes*
