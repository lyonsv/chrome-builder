# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-24
**Phases:** 7 | **Plans:** 16 | **Tasks:** 31

### What Was Built
- ZIP-based structured directory export (index.json + 7 subdirectories) replacing single JSON bundle
- Computed style capture with signature-based deduplication, interaction-state rules, and CSS custom property resolution
- Element-scoped capture via popup picker with click-to-lock selection
- Chunked IPC transport (512KB chunks, ack/retry, progress bar) for 2-5MB payloads
- Tracking plan extraction (dataLayer snapshot, GTM config, event schema derivation)
- Component hierarchy annotation via React fiber walk, Vue/Angular internals, BEM patterns
- Service worker keep-alive with chrome.alarms and storage.session checkpoints

### What Worked
- **Milestone audit caught real bugs early** — the v1.0 audit identified 3 integration issues (popup display zeros, hardcoded site names, empty css/) and missing Phase 2 verification before they became user-facing problems
- **Gap closure phases (5-7) were surgical** — each addressed a specific audit finding with minimal scope, quick execution
- **Test suite grew organically** — 272 tests across 18 suites by end of milestone, caught regressions during later phases
- **Chunked IPC design proved robust** — no message channel crashes reported after implementation

### What Was Inefficient
- **Phase 2 verification was missed during initial execution** — required a separate Phase 7 to retroactively verify STYLE-01/02/03
- **ROADMAP.md progress table drifted** — Phase 2 and 3 showed "Not started" / "In Progress" in the table even after completion, requiring manual fixes
- **Popup data display bug (Phase 5)** — the response shape mismatch between content script and popup should have been caught by integration tests during Phase 1-3, not discovered in audit

### Patterns Established
- **GET_ANALYSIS pull pattern** — popup pulls display data from background after analysis, decoupling data assembly from display
- **Vendored dependencies via importScripts** — fflate loaded without build system, keeps extension loadable unpacked
- **Signal-based detection** — all third-party service identification uses URL/DOM patterns, no hostname lookups

### Key Lessons
1. **Always run phase verification immediately after execution** — skipping formal verification creates debt that compounds (Phase 2 → Phase 7)
2. **Integration tests between message-passing boundaries are critical** — the content-script → background → popup data flow had a shape mismatch that unit tests on each side couldn't catch
3. **Milestone audits before completion are high-value** — 30 minutes of audit saved hours of user-reported bug investigation

### Cost Observations
- Model mix: ~30% opus (planning, verification), ~70% sonnet (execution)
- Notable: Single-plan phases (5, 6, 7) executed very efficiently — gap closure works best as small, focused phases

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 7 | 16 | Established audit-driven gap closure pattern (phases 5-7) |

### Cumulative Quality

| Milestone | Tests | Suites | Key Metric |
|-----------|-------|--------|------------|
| v1.0 | 272 | 18 | 12/12 requirements verified, 0 regressions |

### Top Lessons (Verified Across Milestones)

1. Run formal verification immediately after phase execution — never defer
2. Integration tests at message-passing boundaries catch bugs unit tests miss
