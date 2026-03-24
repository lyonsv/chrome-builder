---
phase: 1
slug: infrastructure-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual browser testing (Chrome extension — no automated test runner configured) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `grep -ri "site4\|site1\|site2" . --include="*.js" --include="*.html"` |
| **Full suite command** | Load unpacked extension in Chrome, run manual verification steps |
| **Estimated runtime** | ~60 seconds manual |

---

## Sampling Rate

- **After every task commit:** Run `grep -ri "site4\|site1\|site2" . --include="*.js" --include="*.html"` (TRACK-03 gate)
- **After every plan wave:** Load extension in Chrome, verify behavior per manual steps
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | INFRA-03 | automated | `grep -ri "site4\|site1\|site2" . --include="*.js" --include="*.html"` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 1 | INFRA-01 | manual | Load extension, trigger long analysis, check SW stays alive | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 2 | INFRA-02 | manual | Load extension, trigger analysis on large page, verify payload arrives in popup | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | INFRA-02 | manual | Send 3 MB payload, verify chunks arrive in order without stall | ❌ W0 | ⬜ pending |
| 1-05-01 | 05 | 3 | INFRA-03 | automated | `grep -ri "site4\|site1\|site2" . --include="*.js" --include="*.html"` should return 0 matches | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Manual test checklist doc for service worker keep-alive verification
- [ ] Manual test checklist doc for large payload transfer verification

*Extension testing requires a real Chrome browser — no headless test runner applies for MV3 extension behavior verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SW stays alive during 60+ second analysis | INFRA-01 | Chrome extension SWs cannot be unit-tested headlessly | Load unpacked extension, open DevTools → Service Workers, trigger full analysis on large page (100+ elements), observe SW does not terminate mid-analysis |
| Payload arrives in popup without crash | INFRA-02 | Message channel behavior requires real Chrome IPC | Trigger analysis on computed-style-heavy page, verify popup receives and renders all data without "message port closed" error |
| ZIP download produces single file | INFRA-03 | Browser download behavior requires manual observation | Click download, verify single .zip file appears in OS downloads folder (not multiple dialogs) |
| ZIP contains correct directory structure | INFRA-03 | File tree verification requires opening the ZIP | Open downloaded ZIP, verify nested directories and all expected output files present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
