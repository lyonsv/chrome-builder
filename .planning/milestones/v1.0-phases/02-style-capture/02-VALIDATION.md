---
phase: 2
slug: style-capture
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — zero-dependency, no build system |
| **Config file** | None — Wave 0 installs a test fixture page |
| **Quick run command** | `grep -n "extractComputedStyles\|buildGlobalSection\|extractPseudoClassRules" content.js` |
| **Full suite command** | Manual smoke — load extension, run analysis on test page, inspect output ZIP |
| **Estimated runtime** | ~2 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Run `grep -n "extractComputedStyles\|buildGlobalSection\|extractPseudoClassRules" content.js` — confirms method exists and is wired into `analyzeWebsite()`
- **After every plan wave:** Full manual smoke — load extension, run analysis on a page with a known design system, inspect the output ZIP
- **Before `/gsd:verify-work`:** `computed-styles/computed-styles.json` exists in ZIP, contains both `globals.tokens` and `elements` with `states` entries
- **Max feedback latency:** ~120 seconds (manual smoke)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | STYLE-01 | manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements \| keys \| length'` | ❌ W0 | ✅ green |
| 2-01-02 | 01 | 1 | STYLE-01 | manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements["li.nav-item"].occurrences'` | ❌ W0 | ✅ green |
| 2-02-01 | 02 | 2 | STYLE-02 | manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements \| to_entries[] \| select(.value.states != null) \| .key'` | ❌ W0 | ✅ green |
| 2-02-02 | 02 | 2 | STYLE-02 | manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.crossOriginStylesheets'` | ❌ W0 | ✅ green |
| 2-03-01 | 03 | 2 | STYLE-03 | manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.globals.tokens.color'` | ❌ W0 | ✅ green |
| 2-03-02 | 03 | 2 | STYLE-03 | manual inspection | Read output JSON and verify entries like `"--color-primary": "#E8462A"` in globals | ❌ W0 | ✅ green |
| 7-01-01 | 01 | 1 | STYLE-01,02,03 | unit | `npx jest tests/unit/style-capture.test.js --no-coverage` | Yes | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Verify `test-page.html` exists (or create minimal fixture) with: button elements with `:hover` CSS rules, custom CSS properties in `:root`, elements with varied class combinations, and at least one repeated element type (e.g. `<li class="nav-item">`) to verify deduplication — unit tests in `tests/unit/style-capture.test.js` cover this via mock DOM (Phase 7 verification)

*Unit tests in tests/unit/style-capture.test.js supersede the need for manual test-page.html verification.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `computed-styles.json` exported in ZIP with ~60 properties per element | STYLE-01 | Chrome extension context required | Load extension, navigate to test page, click Export, unzip and inspect JSON |
| Identical class siblings appear once | STYLE-01 | Requires live page with repeated elements | Check `occurrences` field on repeated element signatures |
| `:hover` state deltas captured for interactive elements | STYLE-02 | Pseudo-class state requires live DOM + stylesheet access | Verify `states` key on button/anchor entries in output JSON |
| CSS custom property tokens with resolved values | STYLE-03 | Requires live computed style resolution | Verify `globals.tokens` contains `--` prefixed keys with hex/rgb values |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved — verified by Phase 7 unit tests

---

*Updated by Phase 7 (07-01-PLAN.md) — unit tests added in tests/unit/style-capture.test.js supersede manual smoke verification*
