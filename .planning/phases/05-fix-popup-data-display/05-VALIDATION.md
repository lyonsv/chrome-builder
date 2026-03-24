---
phase: 5
slug: fix-popup-data-display
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (node environment) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npx jest tests/unit/popup-data-display.test.js --no-coverage` |
| **Full suite command** | `npx jest --no-coverage` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/unit/popup-data-display.test.js --no-coverage`
- **After every plan wave:** Run `npx jest --no-coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | TRACK-01 | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | SCOPE-01 | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | SCOPE-03 | unit | `npx jest tests/unit/popup-data-display.test.js --no-coverage` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/popup-data-display.test.js` — stubs for TRACK-01, SCOPE-01, SCOPE-03 (GET_ANALYSIS handler + startAnalysis branch logic, inline function copy pattern)

*Existing Jest infrastructure covers framework install; only new test file needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Popup shows correct counts after real analysis | TRACK-01, SCOPE-01, SCOPE-03 | Requires live Chrome extension context with real page | 1. Load extension in Chrome 2. Navigate to a page with GTM/dataLayer 3. Run analysis 4. Verify popup shows non-zero counts for tracking, assets, services |
| Popup reopen restores results | SCOPE-01 | Requires popup lifecycle (close/reopen) | 1. Run analysis 2. Close popup 3. Reopen popup 4. Verify counts are still displayed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
