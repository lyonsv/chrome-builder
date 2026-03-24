# Phase 7: Verify Phase 2 Style Capture - Research

**Researched:** 2026-03-24
**Domain:** Jest unit testing for browser DOM/CSS APIs in a Node environment; verification documentation
**Confidence:** HIGH

## Summary

Phase 7 is a verification-only phase. No implementation code changes. The deliverables are: (1) a new test file `tests/unit/style-capture.test.js` that asserts STYLE-01, STYLE-02, and STYLE-03 behaviours against the already-implemented functions in `content.js`, (2) a `07-VERIFICATION.md` document summarising pass/fail per requirement with code pointers, and (3) updates to `02-VALIDATION.md` marking completed items green.

The core technical challenge is that the style-capture functions (`buildSignature`, `_buildGlobalSection`, `_extractPseudoStyles`, `_extractStylesheetData`, `_buildTokenVocabulary`, `extractComputedStyles`) are class methods on `WebsiteAnalyzer` that depend entirely on browser-only globals: `window.getComputedStyle`, `document.querySelectorAll`, `document.styleSheets`, and `CSSStyleRule`. The project test environment is `testEnvironment: 'node'` (confirmed by `jest.config.js`). `jest-environment-jsdom` and `jsdom` are NOT installed — `node_modules/` contains only `jest-environment-node`.

The project's established pattern (confirmed across `component-hierarchy.test.js`, `tracking.test.js`, `css-export.test.js`) is to extract pure function logic inline in the test file and replace all browser-API calls with plain JavaScript object mocks. This pattern must be followed for style-capture too.

**Primary recommendation:** Write inline copies of the style-capture functions that accept injected mock objects instead of relying on globals, then build lightweight plain-object mocks for `window`, `document`, and `styleSheets` inside the test file. Do NOT install jsdom or change `testEnvironment`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Verification is unit-test-based only — no manual smoke procedure required
- **D-02:** Tests assert both output shape (correct JSON keys/types) AND specific computed values from mock elements — catches structural and logic bugs
- **D-03:** Mock DOM built in JS within the test file (jsdom/Jest), not a separate HTML fixture file — consistent with existing `tests/unit/` pattern
- **D-04:** Mock DOM must include a cross-origin stylesheet simulation (throws SecurityError on `cssRules` access) to verify `crossOriginStylesheets` field population and graceful degradation
- **D-05:** Each STYLE requirement gets: pass/fail status, covering test file(s), key assertions cited, and code pointer to implementation (`file:line`)
- **D-06:** If any requirement isn't fully met, include a "gaps found" section with severity and suggested remediation — honest assessment, not rubber-stamping
- **D-07:** Verify STYLE-01, STYLE-02, STYLE-03 fully, plus key edge cases: elements with no classes (tag-only signature), cross-origin stylesheet graceful degradation, and dedup correctness for identical siblings
- **D-08:** Tests verify global/element separation — per-element entries omit properties matching the global baseline, confirming the subtraction logic works
- **D-09:** Single `tests/unit/style-capture.test.js` file with `describe` blocks per requirement (STYLE-01, STYLE-02, STYLE-03) and edge cases — matches existing one-file-per-feature convention
- **D-10:** Update `02-VALIDATION.md` to mark items as green/complete where new tests cover them
- **D-11:** Tests run via `npx jest` from project root — no new scripts or CI setup needed

### Claude's Discretion
- Exact mock DOM structure (number of elements, class combinations, CSS rule content)
- How to mock `getComputedStyle` return values in jsdom
- How to simulate `document.styleSheets` with pseudo-class rules
- Ordering and naming of `describe`/`it` blocks within the test file

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STYLE-01 | Extension captures `getComputedStyle` for every DOM element, deduplicated by signature (tag + class + key properties), filtered to ~60 design-system-relevant CSS properties | `buildSignature`, `extractComputedStyles`, `DESIGN_SYSTEM_PROPERTIES` — all implemented at content.js lines 1310-1523. Tests verify signature building, dedup count, `occurrences` field, 60-property coverage, `exampleHtml` truncation. |
| STYLE-02 | Extension captures interaction-state CSS rules (`:hover`, `:focus`, `:active`, `:disabled`) by inspecting stylesheet rule lists | `_extractStylesheetData` at content.js lines 1358-1436 — walks `document.styleSheets`, matches pseudo-class selectors, maps to element signatures via `buildSignature`. Tests verify `states` key population and cross-origin degradation. |
| STYLE-03 | Extension captures both CSS custom property names and their resolved values so LLM understands design token vocabulary | `_buildTokenVocabulary` at content.js lines 1440-1472 — groups tokens by `--color-*`, `--spacing-*`, `--font-*`, `other`. Tests verify grouped structure, `value`/`definedAt`/`usedBy` fields per token, and `.trim()` on values. |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Jest | ^29.7.0 | Test runner | Already installed, already running all other tests |
| Node test environment | built-in | Test execution | Project's `jest.config.js` sets `testEnvironment: 'node'` — no jsdom |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Plain JS object mocks | n/a | Simulate browser DOM/CSS APIs | Used by all existing tests; the only viable approach given no jsdom |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Plain object mocks | jest-environment-jsdom | jsdom gives real DOM but requires adding a dependency, changing jest.config.js, and diverges from every existing test in the project |
| Plain object mocks | Manual smoke only | Manual smoke already exists in 02-VALIDATION.md; D-01 locks this as unit-test-based |

**Installation:**
```bash
# No new packages required — Jest 29 is already installed
npx jest tests/unit/style-capture.test.js
```

---

## Architecture Patterns

### Recommended Project Structure
```
tests/
└── unit/
    └── style-capture.test.js   # New file — single file per feature convention
.planning/phases/07-verify-phase2-style-capture/
    └── 07-VERIFICATION.md      # New verification document
.planning/phases/02-style-capture/
    └── 02-VALIDATION.md        # Updated to mark completed items green
```

### Pattern 1: Inline Function Copies with Injected Dependencies

**What:** Copy the functions under test verbatim into the test file, but modify them to accept mock objects (window, document) as parameters instead of reading from globals.

**When to use:** Any time content.js functions use `window.*` or `document.*` — the established pattern across all 8 existing test files.

**Example from tracking.test.js:**
```javascript
// Source: tests/unit/tracking.test.js lines 8-55
// captureTrackingData — copy of the WebsiteAnalyzer method (accepts mock window for testability)
function captureTrackingData(windowObj = {}) {
  // uses windowObj.dataLayer instead of window.dataLayer
}
```

**Applied to style-capture:**
```javascript
// In tests/unit/style-capture.test.js

// Inline copy of buildSignature — no browser APIs, safe to copy as-is
function buildSignature(el) {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].sort().join('.');
  return classes ? `${tag}.${classes}` : tag;
}

// Inline copy of _extractStylesheetData — inject document.styleSheets and document.querySelectorAll
function extractStylesheetData(mockStyleSheets, mockQuerySelectorAll) {
  // replace document.styleSheets with mockStyleSheets
  // replace document.querySelectorAll with mockQuerySelectorAll
}
```

### Pattern 2: Plain Object Element Mocks

**What:** Build mock DOM elements as plain JS objects with `tagName`, `classList`, `outerHTML`, and any other properties the function reads.

**When to use:** Any test that needs an "element" to pass to style-capture functions.

**Example:**
```javascript
// Mock element — sufficient for buildSignature and extractComputedStyles inline copy
const mockButton = {
  tagName: 'BUTTON',
  classList: ['btn', 'btn-primary'],  // array-like, [...classList].sort() works
  outerHTML: '<button class="btn btn-primary">Click</button>'
};
```

**Note:** `[...classList]` spread requires classList to be iterable. Arrays are iterable. No issue.

### Pattern 3: Mock getComputedStyle Return Object

**What:** A function that returns an object simulating `CSSStyleDeclaration` with `getPropertyValue(prop)` and `length`/index enumeration.

**When to use:** Anywhere the inline function calls `window.getComputedStyle(el)` or `window.getComputedStyle(el, pseudo)`.

**Example:**
```javascript
function makeMockComputedStyle(styleMap) {
  const props = Object.keys(styleMap);
  return {
    getPropertyValue(prop) { return styleMap[prop] || ''; },
    length: props.length,
    [Symbol.iterator]: function*() { yield* props; },
    // numeric index access for _buildTokenVocabulary loop (for let i = 0; i < length; i++)
    ...Object.fromEntries(props.map((p, i) => [i, p]))
  };
}

// Usage:
const mockGetComputedStyle = (el, pseudo) => {
  if (el === mockDocument.body) return makeMockComputedStyle({ 'color': '#333', 'font-size': '16px' });
  if (pseudo === '::before') return makeMockComputedStyle({ 'content': '"→"', 'color': 'red' });
  return makeMockComputedStyle({ 'background-color': 'blue' });
};
```

### Pattern 4: Mock StyleSheets for Pseudo-class and Token Tests

**What:** Build mock `document.styleSheets` as an array of objects with `cssRules` arrays containing mock `CSSStyleRule` objects.

**When to use:** Tests for STYLE-02 (pseudo-class states) and STYLE-03 (CSS tokens).

**Example:**
```javascript
// Mock CSSStyleRule for .btn:hover
const mockHoverRule = {
  // Signals instanceof CSSStyleRule check — use a class or duck-type
  selectorText: '.btn:hover',
  style: {
    length: 1,
    0: 'background-color',
    getPropertyValue(prop) {
      return prop === 'background-color' ? '#0056b3' : '';
    }
  },
  cssRules: null  // no nesting
};

// Mock cross-origin sheet — throws SecurityError on cssRules access
const mockCrossOriginSheet = {
  href: 'https://cdn.external.com/bootstrap.min.css',
  get cssRules() { throw new DOMException('SecurityError'); }
};
```

**IMPORTANT:** The `instanceof CSSStyleRule` check in `_extractStylesheetData` will FAIL for plain objects. The inline copy must replace this with duck-typing (`rule.selectorText !== undefined`) or the test must set up the prototype chain. Duck-typing replacement is simpler and is what the test file inline copy must do.

### Anti-Patterns to Avoid

- **Installing jsdom:** Do NOT add `jest-environment-jsdom` as a dependency. The project explicitly uses `node` environment and all other tests follow plain-object mock pattern.
- **Using `@jest-environment jsdom` docblock:** This per-file override would work but conflicts with the established project pattern and requires jsdom to be installed.
- **Forgetting `instanceof CSSStyleRule` replacement:** The real implementation uses `rule instanceof CSSStyleRule`. The inline copy for tests must replace this with a duck-type check (`'selectorText' in rule`) or the cross-origin and pseudo-class tests will silently pass without testing anything.
- **Missing `.trim()` assertions:** Token values in real CSS have leading whitespace (` #E8462A` not `#E8462A`). The implementation calls `.trim()`. Tests must verify trimmed values to confirm the trim is in place.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test runner | Custom assertion framework | Jest 29 (already installed) | Already runs all other tests |
| DOM simulation | Custom HTML parser | Plain object mocks (project pattern) | jsdom not installed; all existing tests use this approach |
| CSS parsing | Custom CSS rule walker | Inline `walkRules` copy in test file | The logic under test IS the CSS walker |

**Key insight:** The functions being verified are pure enough to be extracted as inline copies. The main complexity is setting up the mock objects that simulate CSSStyleDeclaration, CSSStyleSheet, and CSSStyleRule APIs accurately enough for the test paths to execute.

---

## Common Pitfalls

### Pitfall 1: `instanceof CSSStyleRule` Always Returns False in Node
**What goes wrong:** The real `_extractStylesheetData` checks `rule instanceof CSSStyleRule`. In Node, `CSSStyleRule` is not defined, so this always evaluates to false. Pseudo-class state tests pass vacuously (no rules matched, no assertions triggered).
**Why it happens:** `instanceof` requires the prototype chain to include the constructor. Plain objects don't have it. Node has no `CSSStyleRule` global.
**How to avoid:** In the inline copy for tests, replace `rule instanceof CSSStyleRule` with a duck-type check: `rule && typeof rule.selectorText === 'string'`.
**Warning signs:** `states` is always `{}` in test output even when mock rules are set up.

### Pitfall 2: `[...classList].sort()` Spread Fails on Non-Iterables
**What goes wrong:** `classList` on mock elements must be iterable for the spread to work. `classList: ['btn', 'btn-primary']` (array) works. `classList: 'btn btn-primary'` (string) won't produce correct sort.
**How to avoid:** Always use arrays for `classList` in mock elements. The real DOM `classList` is DOMTokenList which is array-like and iterable.

### Pitfall 3: `rootStyle[i]` Numeric Index Access in `_buildTokenVocabulary`
**What goes wrong:** `_buildTokenVocabulary` loops `for (let i = 0; i < rootStyle.length; i++) { const prop = rootStyle[i]; ... }`. Mock computed style objects must support numeric index access (`rootStyle[0]`, `rootStyle[1]`, etc.) OR the inline copy must be adapted to iterate `Object.keys(styleMap)` directly.
**How to avoid:** Either add numeric indexes to the mock (`{ 0: '--color-primary', 1: '--spacing-sm', length: 2 }`) or adapt the inline copy to accept a plain object `{ '--color-primary': '#E8462A' }` and iterate with `Object.entries()`.
**Warning signs:** Token vocabulary is empty even though mock styleMap has `--` prefixed keys.

### Pitfall 4: `_buildGlobalSection` Reads `document.body` and `document.documentElement`
**What goes wrong:** The inline copy of `_buildGlobalSection` calls `window.getComputedStyle(document.body)` and `window.getComputedStyle(document.documentElement)`. In Node, `document` is undefined.
**How to avoid:** In the inline copy, replace direct `document.body`/`document.documentElement` references with injected mock objects. Pass `mockDocument` as a parameter or set up a module-level `document` mock via `global.document = mockDocument` in a `beforeAll`.

### Pitfall 5: Cross-Origin SecurityError Type
**What goes wrong:** The implementation catches any exception on `sheet.cssRules` access and records `sheet.href`. If the mock throws a generic `Error` instead of a `DOMException` with name 'SecurityError', the catch block still fires but tests may not accurately reflect real behaviour.
**How to avoid:** `throw new DOMException('Blocked', 'SecurityError')` or simply `throw new Error('SecurityError')` — the implementation's catch is a bare `catch (_)`, so any throw type works. Verify the test uses `{ href: 'https://...' }` on the mock sheet so `sheet.href` is populated.

### Pitfall 6: D-08 Global/Element Separation — No Subtraction Logic in Implementation
**What goes wrong:** D-08 says "Tests verify global/element separation — per-element entries omit properties matching the global baseline." But reading `extractComputedStyles()` in content.js (lines 1474-1523), there is NO baseline subtraction in the current implementation. Each element's `styles` object contains all ~60 DESIGN_SYSTEM_PROPERTIES regardless of whether they match body/html globals. The "separation" in the output structure is architectural (globals vs elements keys) but NOT implemented as property subtraction.
**Impact:** The test for D-08 must assert the structural separation (globals key present, elements key present) rather than asserting that matching properties are absent from element entries. Otherwise tests will fail against the real implementation.
**Warning signs:** Tests that check `expect(entry.styles).not.toHaveProperty('color')` when body and element share the same color — these will fail.

---

## Code Examples

Verified patterns from the actual implementation:

### buildSignature — no browser APIs, safe to copy verbatim
```javascript
// Source: content.js line 1310-1314
function buildSignature(el) {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].sort().join('.');
  return classes ? `${tag}.${classes}` : tag;
}
```

### Mock element pattern
```javascript
// Plain object element — sufficient for buildSignature
const mockEl = {
  tagName: 'LI',
  classList: ['nav-item'],
  outerHTML: '<li class="nav-item">Item</li>'
};
```

### Mock getComputedStyle for STYLE-01 and globals
```javascript
// Simulates CSSStyleDeclaration
function makeMockComputedStyle(styleMap) {
  const keys = Object.keys(styleMap);
  const obj = {
    getPropertyValue(prop) { return styleMap[prop] !== undefined ? styleMap[prop] : ''; },
    length: keys.length
  };
  keys.forEach((k, i) => { obj[i] = k; });
  return obj;
}
```

### Mock CSSStyleRule with duck-type (for inline copy)
```javascript
// In inline copy, replace: rule instanceof CSSStyleRule
// With: rule && typeof rule.selectorText === 'string'

const mockHoverRule = {
  selectorText: '.btn-primary:hover',
  style: {
    length: 1,
    0: 'background-color',
    getPropertyValue(p) { return p === 'background-color' ? '#0056b3' : ''; }
  },
  cssRules: null
};
```

### Mock cross-origin stylesheet
```javascript
// Simulates SecurityError on cssRules access (CORS-blocked sheet)
const mockCrossOriginSheet = {
  href: 'https://cdn.external.com/bootstrap.min.css',
  get cssRules() { throw new Error('SecurityError'); }
};
```

### Mock document.styleSheets with token definitions
```javascript
// For STYLE-03 token vocabulary tests
const mockTokenRule = {
  selectorText: ':root',
  style: {
    length: 2,
    0: '--color-primary',
    1: '--spacing-sm',
    getPropertyValue(p) {
      if (p === '--color-primary') return ' #E8462A'; // leading space — tests trim()
      if (p === '--spacing-sm') return ' 8px';
      return '';
    }
  },
  cssRules: null
};
```

### VERIFICATION.md per-requirement structure
```markdown
## STYLE-01: Computed Style Capture
**Status:** PASS
**Test file:** `tests/unit/style-capture.test.js`
**Key assertions:**
- `buildSignature` returns `tag.class-a.class-b` (sorted) for classed elements — line 1310
- `buildSignature` returns bare `tagname` for elements with no classes — line 1313
- Identical siblings produce one entry with `occurrences: 2` — line 1483-1486
- `elements` entries have 62-key `styles` object — line 1492-1495
- `exampleHtml` is truncated to 500 chars — line 1502
**Implementation pointer:** `content.js` lines 1310-1523
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual smoke verification only (02-VALIDATION.md) | Unit tests covering all STYLE requirements | Phase 7 (now) | STYLE-01, STYLE-02, STYLE-03 move from `pending` to `verified` |
| `_extractPseudoClassRules()` (plan 02 design) | `_extractStylesheetData()` combined pass | Phase 2 implementation | Single stylesheet walk for both pseudo states AND token usage — tests must use `_extractStylesheetData` not `_extractPseudoClassRules` |

**Deprecated/outdated:**
- `02-VALIDATION.md` manual smoke commands: These will be superseded by the unit tests. The validation document should be updated (D-10) to reference the new test file.
- The plan 02 function name `_extractPseudoClassRules`: The actual implementation merged this into `_extractStylesheetData`. Tests must reference the implemented function name, not the plan name.

---

## Open Questions

1. **D-08: Global/element baseline subtraction**
   - What we know: The context decision D-08 says "per-element entries omit properties matching the global baseline, confirming the subtraction logic works." The actual `extractComputedStyles()` in content.js does NOT subtract global properties from element entries. Every element entry has all 62 DESIGN_SYSTEM_PROPERTIES.
   - What's unclear: Was baseline subtraction intentionally skipped in Phase 2 implementation, or is D-08 referring only to the structural separation (globals key vs elements key)?
   - Recommendation: Read the test as verifying structural separation only — globals key exists with `body` and `html` sub-keys, elements key contains per-signature entries. Do NOT write tests asserting property subtraction (they will fail). If subtraction is genuinely missing, flag it as a gap in VERIFICATION.md per D-06.

2. **CSSStyleRule instanceof check in Node**
   - What we know: `instanceof CSSStyleRule` always returns false in Node. The inline function copy must use duck-typing.
   - What's unclear: Whether the test should use `global.CSSStyleRule = function() {}` mock at the module level to avoid changing the inline copy.
   - Recommendation: Duck-type in the inline copy is simpler and more explicit. Use `typeof rule.selectorText === 'string'` as the guard.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.7.0 |
| Config file | `jest.config.js` (exists) |
| Quick run command | `npx jest tests/unit/style-capture.test.js --no-coverage` |
| Full suite command | `npx jest --no-coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STYLE-01 | `buildSignature` produces correct tag+class key | unit | `npx jest tests/unit/style-capture.test.js -t "buildSignature"` | ❌ Wave 0 |
| STYLE-01 | Identical tag+class siblings deduped, occurrences incremented | unit | `npx jest tests/unit/style-capture.test.js -t "deduplication"` | ❌ Wave 0 |
| STYLE-01 | Element entry has 62-key styles object with resolved values | unit | `npx jest tests/unit/style-capture.test.js -t "STYLE-01"` | ❌ Wave 0 |
| STYLE-01 | Elements with no classes use tag-only signature | unit | `npx jest tests/unit/style-capture.test.js -t "tag-only"` | ❌ Wave 0 |
| STYLE-02 | Elements with matching pseudo-class rules get states populated | unit | `npx jest tests/unit/style-capture.test.js -t "STYLE-02"` | ❌ Wave 0 |
| STYLE-02 | Cross-origin sheets recorded in crossOriginStylesheets | unit | `npx jest tests/unit/style-capture.test.js -t "cross-origin"` | ❌ Wave 0 |
| STYLE-03 | Token vocabulary grouped by --color-/--spacing-/--font-/other | unit | `npx jest tests/unit/style-capture.test.js -t "STYLE-03"` | ❌ Wave 0 |
| STYLE-03 | Token values are trimmed (no leading whitespace) | unit | `npx jest tests/unit/style-capture.test.js -t "trim"` | ❌ Wave 0 |
| STYLE-03 | Token entries have value, definedAt, usedBy fields | unit | `npx jest tests/unit/style-capture.test.js -t "token"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx jest tests/unit/style-capture.test.js --no-coverage`
- **Per wave merge:** `npx jest --no-coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/style-capture.test.js` — covers STYLE-01, STYLE-02, STYLE-03 (entire file is new)

*(No existing test infrastructure gaps — jest.config.js exists, setupFilesAfterEnv is configured, all other unit tests pass)*

---

## Sources

### Primary (HIGH confidence)
- Direct read of `content.js` lines 1310-1573 — full implementation of all style-capture methods
- Direct read of `jest.config.js` — confirmed `testEnvironment: 'node'`, no jsdom
- Direct read of `package.json` — confirmed jest ^29.7.0 only devDependency
- Direct read of `tests/unit/tracking.test.js`, `css-export.test.js`, `component-hierarchy.test.js` — confirmed inline-copy + plain-object-mock pattern
- Direct read of `tests/setup/chrome-mock.js` — confirmed chrome API mock setup
- Direct read of `.planning/phases/07-verify-phase2-style-capture/07-CONTEXT.md` — all locked decisions
- Direct read of `.planning/phases/02-style-capture/02-CONTEXT.md`, `02-01-PLAN.md`, `02-02-PLAN.md` — Phase 2 design decisions and implementation contracts
- Direct read of `.planning/phases/02-style-capture/02-VALIDATION.md` — existing validation state

### Secondary (MEDIUM confidence)
- Shell verification: `ls node_modules | grep jsdom` returned empty — jsdom confirmed absent
- Shell verification: `npx jest --listTests` — all 8 existing test files confirmed passing pattern

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — jest.config.js and package.json directly read
- Architecture: HIGH — all existing test files directly read; inline-copy pattern confirmed across 8 files
- Pitfalls: HIGH — derived from reading actual implementation code and comparing with what Node provides
- VERIFICATION.md structure: HIGH — D-05/D-06 locked decisions are specific and unambiguous

**Research date:** 2026-03-24
**Valid until:** Stable — no external dependencies; only changes if content.js style-capture implementation changes
