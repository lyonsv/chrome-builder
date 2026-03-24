---
phase: 6
slug: fix-detection-and-css-export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest tests/unit/detect-services.test.js tests/unit/css-export.test.js --no-coverage` |
| **Full suite command** | `npx jest tests/unit/ --no-coverage` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/detect-services.test.js tests/unit/css-export.test.js --no-coverage`
- **After every plan wave:** Run `npx jest tests/unit/ --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | TRACK-03 | unit | `npx jest tests/unit/detect-services.test.js -t "detects"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | TRACK-03 | unit | `npx jest tests/unit/detect-services.test.js -t "empty"` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | TRACK-03 | unit | `npx jest tests/unit/detect-services.test.js -t "dedup"` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | TRACK-03 | smoke | manual grep check | N/A | ⬜ pending |
| 06-02-01 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "stylesheet type"` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "content-type"` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "url pattern"` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "dedup"` | ❌ W0 | ⬜ pending |
| 06-02-05 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "filename"` | ❌ W0 | ⬜ pending |
| 06-02-06 | 02 | 1 | SCOPE-02 | unit | `npx jest tests/unit/css-export.test.js -t "failures"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/detect-services.test.js` — stubs for TRACK-03 (inline copies of `detectServicesFromNetworkRequests`, `categorizeServiceName`)
- [ ] `tests/unit/css-export.test.js` — stubs for SCOPE-02 (inline copies of `extractCssUrlsFromNetworkRequests`, uses existing `extractFilename`/`resolveFilename`)

*Existing test infrastructure (chrome-mock.js, jest.config.js) covers all new test files with no additional setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| No reference to `detectServicesForKnownSites` in popup.js | TRACK-03 | One-time grep check post-removal | `grep -r "detectServicesForKnownSites" popup.js` returns 0 matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
