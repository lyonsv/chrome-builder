---
phase: 4
slug: tracking-plan
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-17
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npm test -- --testPathPattern=tracking` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=tracking`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | TRACK-01 | unit | `npm test -- --testPathPattern=tracking` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | TRACK-01 | unit | `npm test -- --testPathPattern=tracking` | ✅ | ⬜ pending |
| 4-01-03 | 01 | 1 | TRACK-01 | unit | `npm test -- --testPathPattern=tracking` | ✅ | ⬜ pending |
| 4-01-04 | 01 | 2 | TRACK-01 | unit | `npm test -- --testPathPattern=tracking` | ✅ | ⬜ pending |
| 4-01-05 | 01 | 2 | TRACK-01 | integration | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/tracking.test.js` — stubs for TRACK-01 (9 test cases: dataLayer capture, schema derivation, GTM container extraction, event deduplication, interaction mapping, snapshot timestamp, ZIP inclusion, index.json tracking flag, malformed entry handling)

*Wave 0 creates the test file with stubs before any implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GTM container tag list depth | TRACK-01 | `window.google_tag_manager` internal structure is not a public API — requires live browser | Load page with GTM, open devtools, verify `window.google_tag_manager[id]` exposes tag names; check fallback to `tags: []` when absent |
| ZIP download contains tracking/ directory | TRACK-01 | Requires browser extension context | Install extension, capture a page, download ZIP, verify `tracking/events.json` and `tracking/schema.json` present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
