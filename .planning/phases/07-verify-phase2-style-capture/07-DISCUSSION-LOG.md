# Phase 7: Verify Phase 2 Style Capture - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 07-verify-phase2-style-capture
**Areas discussed:** Verification depth, Test fixture design, VERIFICATION.md structure, Coverage scope, Test organization, 02-VALIDATION.md update, Regression guard

---

## Verification Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Unit tests only | Jest tests against extractComputedStyles() logic with mock DOM. Fast, repeatable, catches regressions. | ✓ |
| Manual smoke only | Load extension on real page, export ZIP, inspect output. Not automated. | |
| Both unit + manual | Unit tests for logic, plus documented manual smoke procedure. | |

**User's choice:** Unit tests only
**Notes:** None

### Follow-up: Assertion depth

| Option | Description | Selected |
|--------|-------------|----------|
| Shape + values | Assert JSON structure AND specific computed values from mock elements. | ✓ |
| Shape only | Assert correct keys and types only. | |
| Shape + sampling | Structure everywhere, spot-check values on 2-3 elements. | |

**User's choice:** Shape + values
**Notes:** None

---

## Test Fixture Design

| Option | Description | Selected |
|--------|-------------|----------|
| Mock DOM in JS | Build mock DOM in test file using jsdom/Jest. Matches existing tests/unit/ pattern. | ✓ |
| Dedicated HTML fixture | Static HTML file loaded in tests. More realistic but adds maintenance. | |
| Extend test-page.html | Add style elements to existing test page. Mixes concerns. | |

**User's choice:** Mock DOM in JS
**Notes:** None

### Follow-up: CORS simulation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include it | Mock stylesheet that throws on cssRules access. Verifies crossOriginStylesheets field. | ✓ |
| No, skip CORS mocking | Keep fixture simple, skip edge case. | |

**User's choice:** Yes, include it
**Notes:** None

---

## VERIFICATION.md Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Test results + code refs | Pass/fail, test files, key assertions, code pointers (file:line). Compact and verifiable. | ✓ |
| Detailed narrative | Prose explanation with inline code snippets. | |
| Checklist only | Simple pass/fail with one-line justification. | |

**User's choice:** Test results + code refs
**Notes:** None

### Follow-up: Gap handling

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with remediation notes | Document gaps with severity and suggested fix. Honest assessment. | ✓ |
| Pass/fail only | Mark pass or fail without prescribing fixes. | |
| Block on gaps | Stop and flag as blocker if any requirement fails. | |

**User's choice:** Yes, with remediation notes
**Notes:** None

---

## Coverage Scope

| Option | Description | Selected |
|--------|-------------|----------|
| STYLE reqs + key edges | STYLE-01/02/03 fully, plus no-class elements, cross-origin degradation, dedup correctness. | ✓ |
| STYLE requirements only | Strictly STYLE-01/02/03 only. | |
| Comprehensive edge cases | STYLE reqs + shadow DOM, iframes, large DOM perf, inline styles, etc. | |

**User's choice:** STYLE reqs + key edges
**Notes:** None

### Follow-up: Global/element separation

| Option | Description | Selected |
|--------|-------------|----------|
| Yes | Dedicated test to confirm per-element entries omit global baseline properties. | ✓ |
| No, trust Phase 2 | Don't re-verify the design, just confirm requirements. | |

**User's choice:** Yes
**Notes:** None

---

## Test Organization

| Option | Description | Selected |
|--------|-------------|----------|
| One file per feature | Single style-capture.test.js with describe blocks per requirement. Matches existing convention. | ✓ |
| Split by requirement | Three separate test files per STYLE requirement. | |
| Split by layer | Two files split by implementation layer (extraction vs rules). | |

**User's choice:** One file per feature
**Notes:** None

---

## 02-VALIDATION.md Update

| Option | Description | Selected |
|--------|-------------|----------|
| Update it | Mark items green/complete where new tests cover them. Keeps artifacts accurate. | ✓ |
| Leave as-is | VERIFICATION.md supersedes it, don't touch Phase 2 artifacts. | |
| Archive it | Rename or add superseded note. | |

**User's choice:** Update it
**Notes:** None

---

## Regression Guard

| Option | Description | Selected |
|--------|-------------|----------|
| npx jest | Keep existing pattern, run via npx jest from project root. | ✓ |
| npm test script | Add test script to package.json for discoverability. | |
| You decide | Claude picks best fit. | |

**User's choice:** npx jest
**Notes:** None

---

## Claude's Discretion

- Exact mock DOM structure (element count, class combinations, CSS rule content)
- How to mock getComputedStyle return values in jsdom
- How to simulate document.styleSheets with pseudo-class rules
- Ordering and naming of describe/it blocks

## Deferred Ideas

None — discussion stayed within phase scope
