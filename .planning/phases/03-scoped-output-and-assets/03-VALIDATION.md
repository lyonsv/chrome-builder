---
phase: 3
slug: scoped-output-and-assets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-16
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (none installed — Wave 0 installs) |
| **Config file** | `jest.config.js` — Wave 0 creates |
| **Quick run command** | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=unit --passWithNoTests` |
| **Full suite command** | `node --experimental-vm-modules node_modules/.bin/jest` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=unit --passWithNoTests`
- **After every plan wave:** Run `node --experimental-vm-modules node_modules/.bin/jest`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-W0-01 | W0 | 0 | SCOPE-01,02,03,TRACK-02 | setup | `npm install --save-dev jest` | ❌ W0 | ⬜ pending |
| 3-W0-02 | W0 | 0 | SCOPE-03 | unit | `jest tests/unit/fetch-assets.test.js` | ❌ W0 | ⬜ pending |
| 3-W0-03 | W0 | 0 | SCOPE-02 | unit | `jest tests/unit/zip-structure.test.js` | ❌ W0 | ⬜ pending |
| 3-W0-04 | W0 | 0 | SCOPE-01,02 | unit | `jest tests/unit/index-json.test.js` | ❌ W0 | ⬜ pending |
| 3-W0-05 | W0 | 0 | TRACK-02 | unit | `jest tests/unit/component-hierarchy.test.js` | ❌ W0 | ⬜ pending |
| 3-01-01 | 01 | 1 | SCOPE-01 | unit | `jest tests/unit/index-json.test.js -t "scope mode"` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 1 | SCOPE-01 | manual | Manual: load extension, activate picker, select element | N/A | ⬜ pending |
| 3-02-01 | 02 | 1 | SCOPE-02 | unit | `jest tests/unit/zip-structure.test.js` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | SCOPE-03 | unit | `jest tests/unit/fetch-assets.test.js` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | SCOPE-03 | unit | `jest tests/unit/fetch-assets.test.js -t "collision"` | ❌ W0 | ⬜ pending |
| 3-04-01 | 04 | 2 | TRACK-02 | unit | `jest tests/unit/component-hierarchy.test.js -t "react"` | ❌ W0 | ⬜ pending |
| 3-04-02 | 04 | 2 | TRACK-02 | unit | `jest tests/unit/component-hierarchy.test.js -t "bem"` | ❌ W0 | ⬜ pending |
| 3-04-03 | 04 | 2 | TRACK-02 | unit | `jest tests/unit/component-hierarchy.test.js -t "generated"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/setup/chrome-mock.js` — shared Chrome API mocks (`chrome.runtime.sendMessage`, `chrome.scripting.executeScript`, `chrome.tabs.sendMessage`)
- [ ] `tests/unit/fetch-assets.test.js` — stubs for SCOPE-03 (fetch success returning Uint8Array, HTTP error, timeout, filename collision counter suffix)
- [ ] `tests/unit/zip-structure.test.js` — stubs for SCOPE-02 (ZIP has 6 subdirs + index.json at root)
- [ ] `tests/unit/index-json.test.js` — stubs for SCOPE-01/SCOPE-02 (scope.mode, scope.selector, scope.childCount keys present)
- [ ] `tests/unit/component-hierarchy.test.js` — stubs for TRACK-02 (React fiber name, BEM fallback, data-attr, generated fallback, output shape with name/source/selector/children)
- [ ] `jest.config.js` — minimal config with `testEnvironment: "node"`, `transform: {}` for vanilla JS
- [ ] Framework install: verify `package.json` exists and has jest; if not: `npm init -y && npm install --save-dev jest`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Element picker activates overlay on page | SCOPE-01 | Requires live browser DOM and extension injection | Load extension, open popup, click "Pick Element", verify highlight follows cursor with tag+class label |
| Escape key cancels picker | SCOPE-01 | Requires browser keyboard event in extension context | Activate picker, press Escape, verify popup reopens showing previous state unchanged |
| ZIP downloads correctly from browser | SCOPE-02 | Requires Chrome downloads API in live extension | Trigger full capture, verify ZIP file appears in Downloads with correct structure |
| Binary assets present in ZIP | SCOPE-03 | Requires actual HTTP fetch in browser | Capture a page with images/fonts, unzip, verify `/assets/` contains real binary files (not URL stubs) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
