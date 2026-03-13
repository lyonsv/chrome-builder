# Phase 2: Style Capture - Research

**Researched:** 2026-03-13
**Domain:** Browser CSSOM APIs — getComputedStyle, stylesheet rule iteration, CSS custom property resolution, DOM deduplication
**Confidence:** HIGH (core claims verified against MDN official docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Property Selection**
- Capture all four categories: typography (font-family, font-size, font-weight, line-height, letter-spacing, text-transform, color), spacing & layout (margin, padding, display, flex/grid properties, gap, width, height, overflow), visual decoration (background-color, border, border-radius, box-shadow, opacity, visibility), transitions & animation, AND positioning (position, top, right, bottom, left, z-index, cursor)
- Capture ::before and ::after pseudo-element styles per element — they often hold decorative content and icons via `content`
- Target ~60 design-system-relevant properties total across these categories

**Global vs Component Separation**
- Capture a **global styles section** separately: `:root` CSS custom properties, `body`/`html` computed styles, and universal/wildcard rules (`*`, `*::before`, `*::after`)
- Per-element entries **omit properties that match the inherited global baseline** — only show what's unique to that element
- This keeps component entries lean and avoids restating inherited defaults across every element

**Deduplication Signature**
- Deduplication key: **tag + full class list (sorted alphabetically)**
- `div.btn.btn-primary.active` and `div.btn.btn-primary` are separate signatures — no stripping of state classes
- Identical signatures (same tag + same classes) are collapsed to one representative sample

**Output Structure**
- **File:** `computed-styles/computed-styles.json` — single JSON file in the pre-scaffolded subdir
- **Shape:** Two top-level keys:
  - `globals`: `:root` vars, body styles, universal rules
  - `elements`: flat map of `signature → entry`
- Each element entry contains:
  - `styles`: object of CSS property → value (only non-global-inherited properties)
  - `states`: object of pseudo-class → property delta (`:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`)
  - `pseudos`: object for `::before` and `::after` styles if present
  - `occurrences`: integer count of how many times this signature appears on the page
  - `exampleHtml`: truncated `outerHTML` of one representative instance

**Interaction States**
- Capture: `:hover`, `:focus`, `:focus-visible`, `:active`, `:disabled`
- Extracted by iterating `document.styleSheets` and matching rules by pseudo-class selector — not live computed state injection
- **Merged into each element's entry** under `states` key
- Match only rules whose base selector targets elements actually present on the page (no dead CSS)
- Cross-origin stylesheets are inaccessible (CORS block): skip silently and record their URLs in a top-level `crossOriginStylesheets: []` field

**CSS Custom Properties**
- Capture per token: name, resolved value, where it's defined (`:root` vs scoped selector), fallback value at point of use (if declared), and which element signatures reference it
- **Both global vocab and inline on element**: global section lists the full token dictionary; each element's `styles` shows the var name at point of use (e.g. `color: var(--color-primary)`) alongside the resolved value
- **Group tokens by naming pattern** in the global section: `--color-*`, `--spacing-*`, `--font-*`, etc → separate categories; uncategorised vars fall into `other`

### Claude's Discretion
- Exact list of the ~60 CSS properties (researcher to compile the canonical list from the categories above)
- Truncation length for `exampleHtml`
- How to handle elements with no classes (use tag only as signature)
- Performance strategy for iterating all DOM elements on large pages

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STYLE-01 | Extension captures `getComputedStyle` for every DOM element on the page, deduplicated by element signature (tag + class + key properties), filtered to ~60 design-system-relevant CSS properties | `window.getComputedStyle(el)` returns resolved computed values for all standard CSS properties; deduplication by `tag + sorted classList` collapses identical siblings; property filtering reduces payload before IPC |
| STYLE-02 | Extension captures interaction-state CSS rules (`:hover`, `:focus`, `:active`, `:disabled`) for elements by inspecting stylesheet rule lists, not just default computed state | `document.styleSheets[i].cssRules` gives access to all CSS rules; `CSSStyleRule.selectorText` contains the full selector string including pseudo-classes; `el.matches(baseSelector)` checks whether a rule's base selector targets live elements |
| STYLE-03 | Extension captures both CSS custom property names (`--color-primary`) and their resolved values (`#E8462A`) so an LLM understands the design token vocabulary alongside the raw values | For standard properties using `var()`: `getComputedStyle(el).color` returns the resolved rgb/hex value; for custom properties themselves: `getComputedStyle(el).getPropertyValue('--color-primary')` returns the raw token value (e.g. `#E8462A`); stylesheet iteration extracts token names from rule `style` text to pair names with resolved values |
</phase_requirements>

---

## Summary

Phase 2 implements a CSSOM-based style extraction pipeline entirely in vanilla JavaScript within `content.js`. It has three distinct sub-problems: (1) bulk computed style capture with deduplication, (2) pseudo-class state extraction from stylesheet rules, and (3) CSS custom property token vocabulary construction.

The core browser APIs are well-established and stable. `window.getComputedStyle(element)` returns fully resolved values for standard CSS properties — if `color: var(--primary)` is declared, `getComputedStyle(el).color` returns `rgb(232, 70, 42)`, not the `var()` string. However, custom property values themselves — accessed via `getComputedStyle(el).getPropertyValue('--color-primary')` — return the raw token value as defined (e.g. `#E8462A` or a hex string), not a further resolved form. This distinction drives the two-track approach for STYLE-03: standard property values come from computed style, while token names must be extracted from stylesheet rule text.

Interaction state extraction (STYLE-02) cannot use live computed state injection because you cannot programmatically trigger `:hover` or `:focus` for every element and read computed styles at scale. Instead, the technique is to walk `document.styleSheets`, identify `CSSStyleRule` objects whose `selectorText` contains a pseudo-class (`:hover`, `:focus`, etc.), strip the pseudo-class to get the base selector, test whether any live element matches that base selector with `element.matches()`, and if so, attribute the property delta to the matching signature. Cross-origin stylesheets throw a `SecurityError` on `cssRules` access — the existing `extractFonts()` pattern in `content.js` already handles this with a try/catch.

Performance on large pages is the main discretion concern. Calling `getComputedStyle()` on every element forces style recalculation. For a page with 2,000+ elements, this is measurable but acceptable for a one-shot capture tool (not a live renderer). The deduplication step makes it manageable: compute the signature first (cheap: `el.tagName + sorted classList`), skip elements whose signature is already captured, and only call `getComputedStyle()` on the first representative per signature.

**Primary recommendation:** Implement `extractComputedStyles()` as a single method on `WebsiteAnalyzer` in `content.js` with three internal phases — DOM walk + deduplication, stylesheet pseudo-class rule extraction, and `:root` token vocabulary construction — all called once per analysis and merged into a single `computedStyles` result key.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `window.getComputedStyle` | Browser built-in | Read all resolved CSS property values for a live element or pseudo-element | The only API that returns post-cascade, post-variable-substitution resolved values for every property |
| `document.styleSheets` / `cssRules` | Browser built-in | Access all CSS rule objects for pseudo-class and custom property extraction | Only way to read authored CSS declarations (as opposed to computed values) without fetching raw CSS text |
| `element.matches(selector)` | Browser built-in | Test whether a live element matches a CSS selector string | Used to filter stylesheet rules to those whose base selector targets real elements |
| `element.classList` | Browser built-in | Build deduplication signature from sorted class list | Available on every element; `[...el.classList].sort().join('.')` is the signature suffix |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getComputedStyle(el, '::before')` | Browser built-in | Read pseudo-element styles | Called per signature to capture `content`, `display`, `color` etc. on `::before`/`::after` |
| `CSSStyleRule.selectorText` | Browser built-in | Read the full selector string of a stylesheet rule | Used during pseudo-class extraction to find rules containing `:hover`, `:focus`, etc. |
| `CSSMediaRule.cssRules` | Browser built-in | Recurse into `@media` blocks | Pseudo-class rules are often nested inside `@media` queries; must recurse |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Stylesheet rule iteration for pseudo-class states | Programmatic `:hover` injection (`el.dispatchEvent(new MouseEvent('mouseover'))` + read computed style) | State injection doesn't reliably trigger `:hover` computed style reads in all browsers; also requires DOM mutation per element — impractical at scale |
| Stylesheet iteration for token names | Fetching raw CSS text and regex-parsing | Raw fetch fails on cross-origin stylesheets; CSSOM provides structured access where available |

**Installation:**
```bash
# No external libraries required — all browser built-in APIs
```

---

## Architecture Patterns

### Recommended Project Structure
```
content.js
└── WebsiteAnalyzer class
    ├── extractComputedStyles()        # NEW: orchestrates all three sub-phases
    │   ├── _buildGlobalSection()      # :root vars, body styles, universal rules
    │   ├── _walkDOMAndDeduplicate()   # per-element signature + computed styles
    │   └── _extractPseudoClassRules() # stylesheet walk for :hover/:focus deltas
    └── analyzeWebsite()               # adds computedStyles to Promise.all()

background.js
└── downloadAsZip()                    # adds computed-styles/computed-styles.json
                                       # to existing fflate fileTree
```

### Pattern 1: DOM Walk with Deduplication

**What:** Iterate `document.querySelectorAll('*')`, compute a signature for each element (tag + sorted class list), skip if already seen, call `getComputedStyle()` only on first representative.
**When to use:** The primary style capture loop.

```javascript
// Source: MDN getComputedStyle + classList API
function buildSignature(el) {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].sort().join('.');
  return classes ? `${tag}.${classes}` : tag;
}

const seen = new Map(); // signature -> { styles, occurrences, exampleHtml }
const allElements = document.querySelectorAll('*');

for (const el of allElements) {
  const sig = buildSignature(el);
  if (seen.has(sig)) {
    seen.get(sig).occurrences++;
    continue;
  }
  const computed = window.getComputedStyle(el);
  const styles = {};
  for (const prop of DESIGN_SYSTEM_PROPERTIES) {
    styles[prop] = computed.getPropertyValue(prop).trim();
  }
  seen.set(sig, {
    styles,
    pseudos: extractPseudoStyles(el),
    occurrences: 1,
    exampleHtml: el.outerHTML.slice(0, 500) // truncation length: Claude's discretion
  });
}
```

### Pattern 2: Pseudo-Class Rule Extraction

**What:** Walk `document.styleSheets`, recurse into `@media` and `@supports` blocks, find `CSSStyleRule` objects whose `selectorText` contains a known pseudo-class, strip the pseudo-class to get the base selector, test live elements with `el.matches()`, record the property delta.
**When to use:** STYLE-02 — building the `states` key per element entry.

```javascript
// Source: MDN document.styleSheets, CSSStyleRule.selectorText, element.matches
const PSEUDO_CLASSES = [':hover', ':focus', ':focus-visible', ':active', ':disabled'];

function extractPseudoClassRules() {
  const pseudoMap = {}; // signature -> { ':hover': { prop: value, ... }, ... }

  function walkRules(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const pseudo of PSEUDO_CLASSES) {
          if (rule.selectorText.includes(pseudo)) {
            // Strip pseudo-class to get base selector
            const baseSelector = rule.selectorText.replace(pseudo, '').trim();
            try {
              const matches = document.querySelectorAll(baseSelector);
              for (const el of matches) {
                const sig = buildSignature(el);
                if (!pseudoMap[sig]) pseudoMap[sig] = {};
                if (!pseudoMap[sig][pseudo]) pseudoMap[sig][pseudo] = {};
                // Capture the properties defined in this pseudo-class rule
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  pseudoMap[sig][pseudo][prop] = rule.style.getPropertyValue(prop);
                }
              }
            } catch (_) {
              // Invalid selector after stripping — skip
            }
          }
        }
      } else if (rule.cssRules) {
        // Recurse into @media, @supports, @layer
        walkRules(rule.cssRules);
      }
    }
  }

  const crossOriginUrls = [];
  for (const sheet of document.styleSheets) {
    try {
      walkRules(sheet.cssRules || []);
    } catch (e) {
      // Cross-origin stylesheet — CORS blocks cssRules access
      crossOriginUrls.push(sheet.href);
    }
  }

  return { pseudoMap, crossOriginUrls };
}
```

### Pattern 3: CSS Custom Property Vocabulary

**What:** Build the global token dictionary by (a) reading all custom properties from the `:root` computed style and (b) scanning `CSSStyleRule` text for `var(--` references in property values to capture the token name used at point of declaration.
**When to use:** STYLE-03 — building the `globals.tokens` section.

```javascript
// Source: MDN getComputedStyle custom properties, CSSStyleDeclaration iteration
function buildTokenVocabulary() {
  const tokens = {};

  // Step 1: Read all :root custom properties
  const rootStyle = window.getComputedStyle(document.documentElement);
  for (let i = 0; i < rootStyle.length; i++) {
    const prop = rootStyle[i];
    if (prop.startsWith('--')) {
      tokens[prop] = {
        value: rootStyle.getPropertyValue(prop).trim(),
        definedAt: ':root',
        usedBy: []
      };
    }
  }

  // Step 2: Scan stylesheet rules for scoped custom property definitions
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        if (rule instanceof CSSStyleRule) {
          for (let i = 0; i < rule.style.length; i++) {
            const prop = rule.style[i];
            if (prop.startsWith('--') && rule.selectorText !== ':root') {
              tokens[prop] = tokens[prop] || { usedBy: [] };
              tokens[prop].scopedAt = rule.selectorText;
              tokens[prop].value = rule.style.getPropertyValue(prop).trim();
            }
          }
        }
      }
    } catch (_) { /* cross-origin */ }
  }

  // Step 3: Group by naming pattern
  const grouped = { color: {}, spacing: {}, font: {}, other: {} };
  for (const [name, data] of Object.entries(tokens)) {
    if (name.startsWith('--color-')) grouped.color[name] = data;
    else if (name.startsWith('--spacing-')) grouped.spacing[name] = data;
    else if (name.startsWith('--font-')) grouped.font[name] = data;
    else grouped.other[name] = data;
  }
  return grouped;
}
```

### Pattern 4: Pseudo-Element Style Capture

**What:** Call `getComputedStyle(el, '::before')` and `getComputedStyle(el, '::after')` for each unique signature. Only record if the `content` property is not `'none'` or `'normal'` (indicating the pseudo-element is actively used).
**When to use:** Populating the `pseudos` key per element entry.

```javascript
// Source: MDN getComputedStyle — pseudoElt parameter
function extractPseudoStyles(el) {
  const pseudos = {};
  for (const pseudo of ['::before', '::after']) {
    const ps = window.getComputedStyle(el, pseudo);
    const content = ps.getPropertyValue('content');
    if (content && content !== 'none' && content !== 'normal') {
      pseudos[pseudo] = {};
      for (const prop of PSEUDO_ELEMENT_PROPERTIES) {
        pseudos[pseudo][prop] = ps.getPropertyValue(prop).trim();
      }
    }
  }
  return Object.keys(pseudos).length ? pseudos : undefined;
}
```

### Anti-Patterns to Avoid

- **Calling `getComputedStyle()` on every element regardless of duplicate signatures:** A page can have hundreds of `li.nav-item` elements; calling `getComputedStyle` 200 times for the same styles is pure waste. Always signature-deduplicate before calling.
- **Trying to programmatically trigger `:hover` to read its computed style:** `el.dispatchEvent(new MouseEvent('mouseover'))` does not reliably cause browsers to compute `:hover` styles for `getComputedStyle`. Stylesheet rule iteration is the correct approach.
- **Flattening all stylesheet rules with `.flat()` before walking:** Some `@media` and `@supports` rules have deeply nested `cssRules`. Use recursion, not `Array.flat(1)`, which only goes one level deep.
- **Using `rule.type === CSSRule.STYLE_RULE` (deprecated):** `CSSRule.type` is deprecated. Use `rule instanceof CSSStyleRule` instead (or `rule.constructor.name === 'CSSStyleRule'`).
- **Assuming `getComputedStyle` returns `var(--token)` for standard properties:** It does NOT. For `color: var(--primary)`, `getComputedStyle(el).color` returns `rgb(232, 70, 42)`. The token name must be recovered from stylesheet rule text, not from computed style.
- **Accessing `cssRules` on all stylesheets without try/catch:** Cross-origin stylesheets throw `SecurityError`. The existing `extractFonts()` pattern in `content.js` already demonstrates the correct try/catch handling.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolved CSS values | Custom CSS parser / regex | `window.getComputedStyle(el)` | getComputedStyle handles the full CSS cascade, specificity, inheritance, and var() substitution — a regex cannot |
| Pseudo-class state detection | DOM state manipulation (dispatch mouseover, read computed style) | Stylesheet rule iteration via `document.styleSheets` + `selectorText` | State injection at scale is unreliable, slow, and can trigger side effects (tooltips, animations, layout shifts) |
| Custom property enumeration | Fetch raw CSS text and regex for `--` | `getComputedStyle(document.documentElement)` iteration for `:root` vars | CSSOM gives structured, cascade-resolved access; raw CSS fetch fails on cross-origin sheets and misses inline styles |
| Selector matching | Custom selector parser | `element.matches(selector)` | Browser's native CSS selector engine handles all edge cases including attribute selectors, :not(), :has(), etc. |

**Key insight:** The browser's own CSSOM is the complete, correct CSS engine — it handles specificity, the cascade, inheritance, variable substitution, and selector matching. Any custom implementation reproduces a fraction of this at high risk of edge-case failure.

---

## Common Pitfalls

### Pitfall 1: getComputedStyle Returns Unresolved `var()` for Custom Properties Themselves

**What goes wrong:** Developer calls `getComputedStyle(el).getPropertyValue('--color-primary')` and gets `#E8462A` (correct). But then calls `getComputedStyle(el).getPropertyValue('color')` and gets `rgb(232, 70, 42)` — NOT `var(--color-primary)`. The `var()` reference is gone.
**Why it happens:** `getComputedStyle` returns values at the computed stage, AFTER variable substitution. Standard properties (color, font-size, etc.) have their `var()` references resolved to concrete values before `getComputedStyle` returns.
**How to avoid:** To capture the token name at point of use (e.g. `color: var(--color-primary)`), you must read it from the stylesheet rule's `style` declaration, not from `getComputedStyle`. The two-track approach: read RESOLVED values from `getComputedStyle`, read VAR NAMES from stylesheet rules.
**Warning signs:** You never see `var(--` in any `getComputedStyle` output for standard properties — if you do, something is wrong with your implementation.

### Pitfall 2: Cross-Origin Stylesheets Silently Block Rule Access

**What goes wrong:** `sheet.cssRules` throws a `SecurityError` for any stylesheet loaded from a different origin (CDN-hosted CSS is very common). If not caught, the entire extraction function crashes.
**Why it happens:** CORS restrictions prevent JavaScript from reading stylesheet rule content from other origins unless the server sets appropriate CORS headers.
**How to avoid:** Wrap every `sheet.cssRules` access in a try/catch. Collect blocked URLs in `crossOriginStylesheets[]` array in the output. Pattern already established in `content.js` `extractFonts()`.
**Warning signs:** `SecurityError: Failed to read the 'cssRules' property from 'CSSStyleSheet'`.

### Pitfall 3: Pseudo-Class Base Selector May Be Invalid After Stripping

**What goes wrong:** Stripping `:hover` from a complex selector like `a:hover > .icon` produces `a > .icon` — valid. But stripping from `.btn:not(:disabled):hover` produces `.btn:not(:hover)` wait... regex-based strip is fragile. Stripping from `.btn::before:hover` (rare but possible) can produce invalid output.
**Why it happens:** CSS selectors are complex; pseudo-classes can appear in nested positions or within `:not()`, `:is()`, `:has()`. Simple string replacement breaks these cases.
**How to avoid:** Use a safe approach: only match rules where `selectorText` ends with the pseudo-class (e.g. `selectorText.endsWith(':hover')`), OR where the pseudo-class appears as a standalone suffix after a non-pseudo part. Wrap `querySelectorAll(baseSelector)` in try/catch to handle any invalid selectors that slip through.
**Warning signs:** `SyntaxError: Failed to execute 'querySelectorAll'` — indicates the stripped selector was invalid.

### Pitfall 4: Elements Without Classes Collide in Signature Map

**What goes wrong:** All `<div>` elements without classes share signature `div`. On a typical page there are hundreds of generic `div` elements with wildly different styles (container, grid, card body, etc.). They all collapse to one entry, losing most data.
**Why it happens:** The deduplication logic correctly identifies them as "same signature" but the class-less elements have fundamentally different roles.
**How to avoid:** For elements with no classes, fall back to a richer signature: use `tag:nth-of-type-like` context or — simpler — just tag + first-non-class attribute (e.g. `div[data-component="header"]`). Claude's discretion: a reasonable default is to skip deduplication for elements with no classes and instead capture only a small sample (first N, e.g. 5) to avoid explosive output.
**Warning signs:** A single `div` entry in the output representing hundreds of distinct-looking elements.

### Pitfall 5: `getPropertyValue` Returns Trailing Whitespace for Custom Properties

**What goes wrong:** `getComputedStyle(el).getPropertyValue('--color-primary')` returns `" #E8462A"` (note the leading space). This is specified behavior — custom property values preserve whitespace.
**Why it happens:** CSS custom property values are inherited verbatim, including surrounding whitespace from the declaration (e.g. `--color-primary:  #E8462A;` — two spaces after colon).
**How to avoid:** Always call `.trim()` on custom property values before storing.
**Warning signs:** Token values in the output have leading spaces; token grouping regex fails to match.

### Pitfall 6: Large DOM Pages Make getComputedStyle Slow

**What goes wrong:** A page with 5,000+ elements, even after deduplication, may have 1,000+ unique signatures. Each `getComputedStyle` call is a style recalculation. Total time can reach 2–5 seconds on a mid-range machine.
**Why it happens:** `getComputedStyle` forces layout recalculation for certain properties (width, height, etc.). Reading 60 properties per element amplifies this.
**How to avoid:** Limit property capture to the ~60 list — don't read all computed properties. The deduplication step reduces actual `getComputedStyle` calls significantly. For properties that force layout (width, height, top, left), batch-read after all other properties are done. This is acceptable for a one-shot capture tool; it does not need to be real-time.
**Warning signs:** Capture takes >10 seconds; Chrome DevTools shows long "Recalculate Style" frames.

---

## Code Examples

Verified patterns from official sources:

### The 60-Property Canonical List

Researcher-compiled from CONTEXT.md categories:

```javascript
// Source: CONTEXT.md property categories — compiled canonical list
const DESIGN_SYSTEM_PROPERTIES = [
  // Typography
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'text-transform', 'text-decoration',
  'text-align', 'color', 'white-space', 'word-break',

  // Spacing & Layout
  'display', 'box-sizing',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height',
  'gap', 'column-gap', 'row-gap', 'overflow', 'overflow-x', 'overflow-y',

  // Flexbox / Grid
  'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self',
  'grid-template-columns', 'grid-template-rows',

  // Visual Decoration
  'background-color', 'background-image',
  'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-radius', 'box-shadow', 'outline',
  'opacity', 'visibility',

  // Positioning
  'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'cursor', 'pointer-events',

  // Transitions & Animation
  'transition', 'transform', 'animation'
];
// Total: 62 properties — trim to taste

const PSEUDO_ELEMENT_PROPERTIES = [
  'content', 'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'color', 'background-color', 'font-family', 'font-size',
  'font-weight', 'border', 'border-radius', 'opacity', 'visibility',
  'transform', 'z-index'
];
```

### Reading Resolved vs Token Values — The Two-Track Split

```javascript
// Source: MDN getComputedStyle + CSSStyleDeclaration.getPropertyValue
// Track A: Resolved value for a standard property
const color = window.getComputedStyle(el).getPropertyValue('color');
// Returns: "rgb(232, 70, 42)" — var() already substituted

// Track B: Raw token value from a custom property
const tokenVal = window.getComputedStyle(document.documentElement)
  .getPropertyValue('--color-primary').trim();
// Returns: "#E8462A" (or whatever value the token holds)

// Track C: Finding what token a property uses (requires stylesheet scan, not getComputedStyle)
// Must scan CSSStyleRule.style text for "var(--" pattern
function findVarTokensInRule(rule) {
  const tokens = {};
  for (let i = 0; i < rule.style.length; i++) {
    const prop = rule.style[i];
    const val = rule.style.getPropertyValue(prop);
    const match = val.match(/var\((--[^,)]+)/);
    if (match) tokens[prop] = match[1].trim();
  }
  return tokens;
}
```

### Enumerating All :root Custom Properties

```javascript
// Source: MDN getComputedStyle + CSSStyleDeclaration — iterating all property names
const rootComputed = window.getComputedStyle(document.documentElement);
const customProps = [];
for (let i = 0; i < rootComputed.length; i++) {
  const name = rootComputed[i];
  if (name.startsWith('--')) {
    customProps.push({
      name,
      value: rootComputed.getPropertyValue(name).trim()
    });
  }
}
```

### Safe Stylesheet Rule Walk (with CORS handling)

```javascript
// Source: MDN document.styleSheets, CSSRule.cssRules — pattern from content.js extractFonts()
function walkAllRules(visitor) {
  const crossOriginUrls = [];

  function recurse(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        visitor(rule);
      }
      if (rule.cssRules) {
        recurse(rule.cssRules); // @media, @supports, @layer nesting
      }
    }
  }

  for (const sheet of document.styleSheets) {
    try {
      recurse(sheet.cssRules || []);
    } catch (_) {
      if (sheet.href) crossOriginUrls.push(sheet.href);
    }
  }

  return crossOriginUrls;
}
```

### Global Section Construction

```javascript
// Source: MDN getComputedStyle — body and documentElement patterns
function buildGlobalSection() {
  const bodyComputed = window.getComputedStyle(document.body);
  const htmlComputed = window.getComputedStyle(document.documentElement);

  const bodyStyles = {};
  for (const prop of DESIGN_SYSTEM_PROPERTIES) {
    bodyStyles[prop] = bodyComputed.getPropertyValue(prop).trim();
  }

  return {
    tokens: buildTokenVocabulary(),
    body: bodyStyles,
    // html baseline for inheritance starting point
    html: {
      fontSize: htmlComputed.getPropertyValue('font-size').trim(),
      fontFamily: htmlComputed.getPropertyValue('font-family').trim()
    }
  };
}
```

### background.js — ZIP Integration Point

```javascript
// Source: Existing background.js downloadAsZip() pattern — Phase 2 adds one line
// In downloadAsZip(), after the existing fileTree definition:
if (analysisData.computedStyles) {
  fileTree['computed-styles/'] = {
    'computed-styles.json': fflate.strToU8(
      JSON.stringify(analysisData.computedStyles, null, 2)
    )
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `rule.type === CSSRule.STYLE_RULE` (integer constant) | `rule instanceof CSSStyleRule` | Deprecated in current CSSOM spec | `rule.type` still works but is deprecated; prefer `instanceof` |
| Manual CSS text fetching and regex parsing for custom properties | `getComputedStyle(root).getPropertyValue('--token')` | ~2017 (CSS custom properties shipped) | Browser does the cascade math; no fetch/parse needed for same-origin styles |
| Accessing all computed properties via `el.style` | `window.getComputedStyle(el)` | Baseline | `el.style` only returns inline styles; `getComputedStyle` returns the full cascade result |

**Deprecated/outdated:**
- `getPropertyCSSValue()` on `CSSStyleDeclaration`: Removed from all browsers. Do not use. Use `getPropertyValue()` instead.
- `document.getMatchingCSSRules(element)`: Non-standard, removed from Chrome. Do not use. Implement manually via `element.matches()`.

---

## Open Questions

1. **Classless element deduplication strategy**
   - What we know: Elements with no classes (e.g. bare `div`, `span`, `p`) all share the same tag-only signature, but they are stylistically diverse.
   - What's unclear: Should they be deduplicated at all? Or captured as-is (all of them)?
   - Recommendation (Claude's discretion): For elements with no classes, capture only up to `N=10` unique representative samples based on computed `display` property as a secondary distinguisher. Signature: `div[block]`, `div[flex]`, `div[grid]`, etc. This prevents the output exploding while retaining meaningful variation.

2. **ExampleHtml truncation length**
   - What we know: `outerHTML` on a complex component can easily be 2–10KB. Truncation prevents per-element bloat.
   - What's unclear: What truncation length preserves enough semantic markup for an LLM (e.g. 200 chars vs 500 chars)?
   - Recommendation (Claude's discretion): 500 characters. This captures the opening tag with all attributes plus first child context, which is usually sufficient for an LLM to understand the component type.

3. **Complex pseudo-class selectors in base-selector stripping**
   - What we know: Simple stripping (`selectorText.replace(':hover', '')`) works for most cases but fails for selectors like `.btn:not(:disabled):hover` or nested `:is()`.
   - What's unclear: How prevalent are these complex patterns in real-world design systems?
   - Recommendation: Start with the safe `endsWith(pseudo)` check before attempting base selector extraction. For complex cases where `querySelectorAll(strippedSelector)` throws, silently skip that rule — the output remains valid, just incomplete for those edge-case rules.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in repo |
| Config file | None — zero-dependency, no build system |
| Quick run command | Manual: Load extension in Chrome, navigate to test page, trigger analysis |
| Full suite command | Manual smoke + `unzip -l` inspection of output ZIP |

The project has no automated test infrastructure and no build system. All validation is manual smoke testing in a real Chrome extension context.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STYLE-01 | computed-styles.json contains element entries with ~60 properties | Manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements \| keys \| length'` | Wave 0 — need test page |
| STYLE-01 | Identical class siblings appear once (not hundreds of times) | Manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements["li.nav-item"].occurrences'` | Wave 0 — need test page |
| STYLE-02 | Output contains `states` key with `:hover` properties for interactive elements | Manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.elements \| to_entries[] \| select(.value.states != null) \| .key'` | Wave 0 |
| STYLE-02 | Cross-origin stylesheet URLs recorded in `crossOriginStylesheets` | Manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.crossOriginStylesheets'` | Wave 0 |
| STYLE-03 | globals.tokens contains `--color-*` entries with resolved hex/rgb values | Manual smoke | `unzip -p analysis-*.zip computed-styles/computed-styles.json \| jq '.globals.tokens.color'` | Wave 0 |
| STYLE-03 | Element styles show var token names (via stylesheet scan) alongside resolved values | Manual inspection | Read the output JSON and verify entries like `"--color-primary": "#E8462A"` in globals | Wave 0 |

### Sampling Rate
- Per task commit: `grep -n "extractComputedStyles\|buildGlobalSection\|extractPseudoClassRules" content.js` — confirms method exists and is wired into `analyzeWebsite()`
- Per wave merge: Full manual smoke — load extension, run analysis on a page with a known design system (e.g. a Bootstrap or Tailwind site), inspect the output ZIP
- Phase gate: `computed-styles/computed-styles.json` exists in ZIP, contains both `globals.tokens` and `elements` with `states` entries, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Verify `test-page.html` has sufficient variety: button elements with `:hover` rules, custom CSS properties in `:root`, elements with `::before`/`::after` pseudo-elements — if not, add a minimal test fixture that covers STYLE-01/02/03

*(No test framework install required — manual smoke testing only for this phase)*

---

## Sources

### Primary (HIGH confidence)
- [MDN: Window.getComputedStyle()](https://developer.mozilla.org/en-US/docs/Web/API/Window/getComputedStyle) — pseudo-element support (`::before`/`::after`), resolved value behavior, property access patterns
- [MDN: Using CSS custom properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascading_variables/Using_custom_properties) — `getPropertyValue('--token')` returns raw token value; `getComputedStyle(el).color` returns resolved value (not `var()`)
- [MDN: CSS property value processing](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Property_value_processing) — `var()` substitution happens at computed value stage; `getComputedStyle` returns post-substitution values for standard properties
- [MDN: CSSStyleRule.selectorText](https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleRule/selectorText) — returns full selector string including pseudo-classes; writable in spec but practically read-only in Chrome
- [MDN: CSSRule.type (deprecated)](https://developer.mozilla.org/en-US/docs/Web/API/CSSRule/type) — confirmed deprecated; `instanceof CSSStyleRule` is the current approach

### Secondary (MEDIUM confidence)
- [CSS-Tricks: Get All Custom Properties on a Page](https://css-tricks.com/how-to-get-all-custom-properties-on-a-page-in-javascript/) — confirms iteration pattern via `document.styleSheets` + `rule.style` for custom property extraction; notes cross-origin CORS limitation
- [dev.to: getComputedStyle the good, bad and ugly](https://dev.to/nikneym/getcomputedstyle-the-good-the-bad-and-the-ugly-parts-1l34) — confirms `getComputedStyle` does NOT return raw `var()` for custom properties themselves; `getComputedStyle(el).getPropertyValue('--box-width')` returns raw value, not computed pixels

### Tertiary (LOW confidence — for awareness only)
- [w3c/csswg-drafts Issue #2358](https://github.com/w3c/csswg-drafts/issues/2358) — spec discussion confirming custom properties return unresolved value; not authoritative on standard property behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all APIs are browser built-ins documented on MDN; no third-party dependencies
- Architecture: HIGH — patterns follow directly from MDN API documentation and existing `content.js` patterns
- Pitfalls: HIGH — cross-origin SecurityError is well-documented; `var()` substitution behavior verified from MDN and csswg spec discussion; getComputedStyle performance characteristics confirmed

**Research date:** 2026-03-13
**Valid until:** 2026-09-13 (CSSOM APIs are extremely stable; custom property behavior has been stable since Chrome 49/2016)
