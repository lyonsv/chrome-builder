// tests/unit/style-capture.test.js
// Verification tests for Phase 2 style capture: STYLE-01, STYLE-02, STYLE-03.
// Uses inline function copies — content.js has no module system (established Phase 3 pattern).
// Test environment: node (no jsdom). All browser APIs mocked with plain objects.

// === Inline constants from content.js lines 5-43 ===

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

const PSEUDO_ELEMENT_PROPERTIES = [
  'content', 'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'color', 'background-color', 'font-family', 'font-size',
  'font-weight', 'border', 'border-radius', 'opacity', 'visibility',
  'transform', 'z-index'
];

// === Mock infrastructure ===

function makeMockComputedStyle(styleMap) {
  const keys = Object.keys(styleMap);
  const obj = {
    getPropertyValue(prop) { return styleMap[prop] !== undefined ? styleMap[prop] : ''; },
    length: keys.length
  };
  keys.forEach((k, i) => { obj[i] = k; });
  return obj;
}

// === Inline copies of functions under test (with dependency injection) ===

// buildSignature — verbatim copy of content.js lines 1310-1314
// No browser APIs needed — plain element object with tagName + classList array
function buildSignature(el) {
  const tag = el.tagName.toLowerCase();
  const classes = [...el.classList].sort().join('.');
  return classes ? `${tag}.${classes}` : tag;
}

// buildGlobalSection — adapted from content.js _buildGlobalSection (lines 1333-1350)
// Replaces window.getComputedStyle with mockWindow.getComputedStyle
// Replaces document.body/documentElement with mockDocument equivalents
function buildGlobalSection(mockWindow, mockDocument, dsProps) {
  const bodyComputed = mockWindow.getComputedStyle(mockDocument.body);
  const htmlComputed = mockWindow.getComputedStyle(mockDocument.documentElement);

  const bodyStyles = {};
  for (const prop of dsProps) {
    bodyStyles[prop] = bodyComputed.getPropertyValue(prop).trim();
  }

  return {
    tokens: {},
    body: bodyStyles,
    html: {
      fontSize: htmlComputed.getPropertyValue('font-size').trim(),
      fontFamily: htmlComputed.getPropertyValue('font-family').trim()
    }
  };
}

// extractStylesheetData — adapted from content.js _extractStylesheetData (lines 1358-1436)
// Key changes:
//   - document.styleSheets replaced with mockDocument.styleSheets
//   - document.querySelectorAll replaced with mockDocument.querySelectorAll
//   - rule instanceof CSSStyleRule replaced with duck-type: rule && typeof rule.selectorText === 'string'
//     (Pitfall 1 — CSSStyleRule does not exist in Node environment)
//   - this.buildSignature(el) replaced with buildSignatureFn(el)
//   - Deadline check removed (set effectively to never timeout in tests)
function extractStylesheetData(mockDocument, buildSignatureFn) {
  const PSEUDO_CLASSES = [':hover', ':focus', ':focus-visible', ':active', ':disabled'];
  const pseudoMap = {};
  const crossOriginUrls = [];
  const tokenUsage = {};
  const scopedTokens = {};

  const selectorCache = new Map();
  const queryWithCache = (selector) => {
    if (!selectorCache.has(selector)) {
      try {
        selectorCache.set(selector, Array.from(mockDocument.querySelectorAll(selector)));
      } catch (_) {
        selectorCache.set(selector, []);
      }
    }
    return selectorCache.get(selector);
  };

  const walkRules = (rules) => {
    for (const rule of rules) {
      // Duck-type check instead of instanceof CSSStyleRule (Pitfall 1)
      if (rule && typeof rule.selectorText === 'string') {
        // 1. Pseudo-class state extraction
        for (const pseudo of PSEUDO_CLASSES) {
          if (rule.selectorText.endsWith(pseudo)) {
            const baseSelector = rule.selectorText.slice(0, -pseudo.length).trim();
            if (baseSelector) {
              for (const el of queryWithCache(baseSelector)) {
                const sig = buildSignatureFn(el);
                if (!pseudoMap[sig]) pseudoMap[sig] = {};
                if (!pseudoMap[sig][pseudo]) pseudoMap[sig][pseudo] = {};
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style[i];
                  pseudoMap[sig][pseudo][prop] = rule.style.getPropertyValue(prop).trim();
                }
              }
            }
          }
        }

        // 2. Scoped custom prop definitions + var() usage
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          const val = rule.style.getPropertyValue(prop);

          if (prop.startsWith('--') && rule.selectorText !== ':root') {
            scopedTokens[prop] = { scopedAt: rule.selectorText, value: val.trim() };
          }

          const match = val.match(/var\((--[^,)]+)/);
          if (match) {
            const tokenName = match[1].trim();
            if (!tokenUsage[tokenName]) tokenUsage[tokenName] = new Set();
            tokenUsage[tokenName].add(rule.selectorText);
          }
        }
      }
      if (rule.cssRules) walkRules(rule.cssRules);
    }
  };

  for (const sheet of mockDocument.styleSheets) {
    try {
      walkRules(sheet.cssRules || []);
    } catch (_) {
      if (sheet.href) crossOriginUrls.push(sheet.href);
    }
  }

  return { pseudoMap, crossOriginUrls, tokenUsage, scopedTokens };
}

// buildTokenVocabulary — adapted from content.js _buildTokenVocabulary (lines 1440-1472)
// Replaces window.getComputedStyle(document.documentElement) with mockWindow/mockDocument equivalents
function buildTokenVocabulary(mockWindow, mockDocument, tokenUsage, scopedTokens) {
  const tokens = {};

  const rootStyle = mockWindow.getComputedStyle(mockDocument.documentElement);
  for (let i = 0; i < rootStyle.length; i++) {
    const prop = rootStyle[i];
    if (prop.startsWith('--')) {
      tokens[prop] = {
        value: rootStyle.getPropertyValue(prop).trim(),
        definedAt: ':root',
        usedBy: Array.from(tokenUsage[prop] || [])
      };
    }
  }

  for (const [prop, { scopedAt, value }] of Object.entries(scopedTokens)) {
    if (!tokens[prop]) tokens[prop] = { usedBy: Array.from(tokenUsage[prop] || []) };
    tokens[prop].scopedAt = scopedAt;
    tokens[prop].value = value;
  }

  const grouped = { color: {}, spacing: {}, font: {}, other: {} };
  for (const [name, data] of Object.entries(tokens)) {
    if (name.startsWith('--color-')) grouped.color[name] = data;
    else if (name.startsWith('--spacing-')) grouped.spacing[name] = data;
    else if (name.startsWith('--font-')) grouped.font[name] = data;
    else grouped.other[name] = data;
  }
  return grouped;
}

// extractComputedStyles — adapted from content.js extractComputedStyles (lines 1474-1523)
// Wires together buildGlobalSection, extractStylesheetData, buildTokenVocabulary
// with injected mock objects replacing all globals
function extractComputedStyles(mockWindow, mockDocument, dsProps) {
  const globals = buildGlobalSection(mockWindow, mockDocument, dsProps);
  const seen = new Map();

  for (const el of mockDocument.querySelectorAll('*')) {
    const sig = buildSignature(el);
    if (seen.has(sig)) {
      seen.get(sig).occurrences++;
      continue;
    }

    const computed = mockWindow.getComputedStyle(el);
    const styles = {};
    for (const prop of dsProps) {
      styles[prop] = computed.getPropertyValue(prop).trim();
    }

    const entry = {
      styles,
      states: {},
      occurrences: 1,
      exampleHtml: el.outerHTML.slice(0, 500)
    };

    seen.set(sig, entry);
  }

  const { pseudoMap, crossOriginUrls, tokenUsage, scopedTokens } = extractStylesheetData(mockDocument, buildSignature);

  for (const [sig, entry] of seen) {
    entry.states = pseudoMap[sig] || {};
  }

  globals.tokens = buildTokenVocabulary(mockWindow, mockDocument, tokenUsage, scopedTokens);

  return {
    globals,
    elements: Object.fromEntries(seen),
    crossOriginStylesheets: crossOriginUrls
  };
}

// === Mock DOM setup ===

// Mock elements for the DOM walk
const mockLiNavItem1 = { tagName: 'LI', classList: ['nav-item'], outerHTML: '<li class="nav-item">Item 1</li>' };
const mockLiNavItem2 = { tagName: 'LI', classList: ['nav-item'], outerHTML: '<li class="nav-item">Item 2</li>' };
const mockLiNavItem3 = { tagName: 'LI', classList: ['nav-item'], outerHTML: '<li class="nav-item">Item 3</li>' };
const mockButton = { tagName: 'BUTTON', classList: ['btn', 'btn-primary'], outerHTML: '<button class="btn btn-primary">Click</button>' };
const mockDiv = { tagName: 'DIV', classList: [], outerHTML: '<div>Plain</div>' };
const mockInput = { tagName: 'INPUT', classList: ['form-control'], outerHTML: '<input class="form-control"/>' };

// Mock CSS rules for stylesheet simulation
const mockHoverRule = {
  selectorText: '.btn.btn-primary:hover',
  style: {
    length: 1,
    0: 'background-color',
    getPropertyValue(p) { return p === 'background-color' ? '#0056b3' : ''; }
  },
  cssRules: null
};

const mockFocusRule = {
  selectorText: '.form-control:focus',
  style: {
    length: 1,
    0: 'border-color',
    getPropertyValue(p) { return p === 'border-color' ? '#80bdff' : ''; }
  },
  cssRules: null
};

const mockTokenRule = {
  selectorText: '.nav-item',
  style: {
    length: 1,
    0: 'color',
    getPropertyValue(p) { return p === 'color' ? 'var(--color-primary)' : ''; }
  },
  cssRules: null
};

// Cross-origin sheet — throws on cssRules access (simulates SecurityError)
const mockCrossOriginSheet = {
  href: 'https://cdn.external.com/bootstrap.min.css',
  get cssRules() { throw new DOMException('Blocked', 'SecurityError'); }
};

// Root computed style — includes custom property tokens AND font-size/font-family
// (used by both buildGlobalSection globals.html and buildTokenVocabulary :root properties)
const rootStyleMap = {
  '--color-primary': ' #E8462A',    // leading whitespace — tests .trim()
  '--spacing-sm': ' 8px',           // leading whitespace — tests .trim()
  '--font-size-base': ' 16px',      // --font- prefix
  'font-size': '16px',              // for globals.html.fontSize
  'font-family': 'Arial, sans-serif' // for globals.html.fontFamily
};
const mockRootComputedStyle = makeMockComputedStyle(rootStyleMap);

// Body style map — one value per DESIGN_SYSTEM_PROPERTY
const bodyStyleMap = {};
DESIGN_SYSTEM_PROPERTIES.forEach(p => { bodyStyleMap[p] = ''; });
bodyStyleMap['font-size'] = '16px';
bodyStyleMap['color'] = '#333';

const htmlStyleMap = {
  'font-size': '16px',
  'font-family': 'Arial, sans-serif'
};

// Element-level style maps (all 62 DSP returned as empty strings for most,
// with a couple concrete values)
function makeElementStyleMap(overrides = {}) {
  const map = {};
  DESIGN_SYSTEM_PROPERTIES.forEach(p => { map[p] = ''; });
  return Object.assign(map, overrides);
}

const liStyleMap = makeElementStyleMap({ display: 'list-item', color: '#333' });
const btnStyleMap = makeElementStyleMap({ display: 'inline-block', 'background-color': '#007bff' });
const divStyleMap = makeElementStyleMap({ display: 'block' });
const inputStyleMap = makeElementStyleMap({ display: 'inline-block', 'border-top': '1px solid #ccc' });

// Build the mock document
const allElements = [mockLiNavItem1, mockLiNavItem2, mockLiNavItem3, mockButton, mockDiv, mockInput];

const mockDocument = {
  body: { tagName: 'BODY', classList: [], outerHTML: '<body>...</body>' },
  documentElement: { tagName: 'HTML', classList: [] },
  querySelectorAll(selector) {
    if (selector === '*') return allElements;
    // For base selector matching in pseudo-class state extraction
    if (selector === '.btn.btn-primary') return [mockButton];
    if (selector === '.form-control') return [mockInput];
    if (selector === '.nav-item') return [mockLiNavItem1, mockLiNavItem2, mockLiNavItem3];
    return [];
  },
  styleSheets: [
    {
      cssRules: [mockHoverRule, mockFocusRule, mockTokenRule]
    },
    mockCrossOriginSheet
  ]
};

// Build the mock window
const mockWindow = {
  getComputedStyle(el, pseudo) {
    if (el === mockDocument.documentElement) return mockRootComputedStyle;
    if (el === mockDocument.body) return makeMockComputedStyle(bodyStyleMap);
    if (pseudo) return makeMockComputedStyle({});  // pseudo-elements return empty
    if (el === mockLiNavItem1 || el === mockLiNavItem2 || el === mockLiNavItem3) {
      return makeMockComputedStyle(liStyleMap);
    }
    if (el === mockButton) return makeMockComputedStyle(btnStyleMap);
    if (el === mockDiv) return makeMockComputedStyle(divStyleMap);
    if (el === mockInput) return makeMockComputedStyle(inputStyleMap);
    return makeMockComputedStyle({});
  }
};

// === Test suite ===

describe('Phase 2: Style Capture Verification', () => {

  describe('STYLE-01: Computed Style Capture', () => {

    describe('buildSignature', () => {
      it('returns tag.class-a.class-b with sorted classes', () => {
        expect(buildSignature({ tagName: 'BUTTON', classList: ['btn', 'btn-primary'] })).toBe('button.btn.btn-primary');
        expect(buildSignature({ tagName: 'BUTTON', classList: ['btn-primary', 'btn'] })).toBe('button.btn.btn-primary');
      });

      it('returns bare tagname for elements with no classes', () => {
        expect(buildSignature({ tagName: 'DIV', classList: [] })).toBe('div');
        expect(buildSignature({ tagName: 'SPAN', classList: [] })).toBe('span');
      });

      it('lowercases the tag name', () => {
        expect(buildSignature({ tagName: 'LI', classList: ['nav-item'] })).toBe('li.nav-item');
        expect(buildSignature({ tagName: 'H1', classList: [] })).toBe('h1');
      });
    });

    describe('extractComputedStyles', () => {
      let result;

      beforeEach(() => {
        result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
      });

      it('deduplicates identical siblings and counts occurrences', () => {
        expect(result.elements['li.nav-item']).toBeDefined();
        expect(result.elements['li.nav-item'].occurrences).toBe(3);
      });

      it('produces styles object with all DESIGN_SYSTEM_PROPERTIES keys per element', () => {
        expect(Object.keys(result.elements['li.nav-item'].styles)).toHaveLength(DESIGN_SYSTEM_PROPERTIES.length);
        expect(Object.keys(result.elements['button.btn.btn-primary'].styles)).toHaveLength(DESIGN_SYSTEM_PROPERTIES.length);
        expect(Object.keys(result.elements['div'].styles)).toHaveLength(DESIGN_SYSTEM_PROPERTIES.length);
      });

      it('styles keys match exactly the DESIGN_SYSTEM_PROPERTIES array', () => {
        const liStyles = result.elements['li.nav-item'].styles;
        for (const prop of DESIGN_SYSTEM_PROPERTIES) {
          expect(liStyles).toHaveProperty(prop);
        }
      });

      it('truncates exampleHtml to 500 characters', () => {
        // Build an element with long outerHTML to verify truncation
        const longHtml = '<div>' + 'x'.repeat(1000) + '</div>';
        const longEl = { tagName: 'SECTION', classList: ['long'], outerHTML: longHtml };
        const testDoc = {
          body: mockDocument.body,
          documentElement: mockDocument.documentElement,
          querySelectorAll(sel) { return sel === '*' ? [longEl] : []; },
          styleSheets: []
        };
        const longResult = extractComputedStyles(mockWindow, testDoc, DESIGN_SYSTEM_PROPERTIES);
        expect(longResult.elements['section.long'].exampleHtml).toHaveLength(500);
      });

      it('includes globals.body with all DESIGN_SYSTEM_PROPERTIES properties', () => {
        expect(result.globals.body).toBeDefined();
        expect(Object.keys(result.globals.body)).toHaveLength(DESIGN_SYSTEM_PROPERTIES.length);
      });

      it('includes globals.html with fontSize and fontFamily', () => {
        expect(result.globals.html).toBeDefined();
        expect(result.globals.html).toHaveProperty('fontSize');
        expect(result.globals.html).toHaveProperty('fontFamily');
        expect(result.globals.html.fontSize).toBe('16px');
        expect(result.globals.html.fontFamily).toBe('Arial, sans-serif');
      });

      it('captures element with no classes as tag-only signature key', () => {
        expect(result.elements['div']).toBeDefined();
        expect(result.elements['div'].occurrences).toBe(1);
      });

      it('captures button with multi-class sorted signature', () => {
        expect(result.elements['button.btn.btn-primary']).toBeDefined();
      });

      it('trims computed style values', () => {
        // The body style map values should be trimmed (empty string is already trimmed)
        const bodyFontSize = result.globals.body['font-size'];
        expect(bodyFontSize).toBe(bodyFontSize.trim());
      });
    });

    describe('global/element structural separation', () => {
      it('output has separate globals and elements top-level keys', () => {
        const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
        expect(result).toHaveProperty('globals');
        expect(result).toHaveProperty('elements');
        expect(result.globals).toHaveProperty('body');
        expect(result.globals).toHaveProperty('html');
        expect(result.globals).toHaveProperty('tokens');
      });

      it('elements key contains per-signature entries', () => {
        const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
        const keys = Object.keys(result.elements);
        expect(keys.length).toBeGreaterThan(0);
        // Each entry should have the expected shape
        for (const key of keys) {
          const entry = result.elements[key];
          expect(entry).toHaveProperty('styles');
          expect(entry).toHaveProperty('states');
          expect(entry).toHaveProperty('occurrences');
          expect(entry).toHaveProperty('exampleHtml');
        }
      });
    });

  });

  describe('STYLE-02: Interaction-State CSS Rules', () => {

    describe('_extractStylesheetData', () => {
      let ssData;

      beforeEach(() => {
        ssData = extractStylesheetData(mockDocument, buildSignature);
      });

      it('populates states with :hover properties for matching elements', () => {
        // button.btn.btn-primary matches .btn.btn-primary:hover rule
        expect(ssData.pseudoMap['button.btn.btn-primary']).toBeDefined();
        expect(ssData.pseudoMap['button.btn.btn-primary'][':hover']).toBeDefined();
        expect(ssData.pseudoMap['button.btn.btn-primary'][':hover']['background-color']).toBe('#0056b3');
      });

      it('populates states with :focus properties for matching elements', () => {
        // input.form-control matches .form-control:focus rule
        expect(ssData.pseudoMap['input.form-control']).toBeDefined();
        expect(ssData.pseudoMap['input.form-control'][':focus']).toBeDefined();
        expect(ssData.pseudoMap['input.form-control'][':focus']['border-color']).toBe('#80bdff');
      });

      it('records cross-origin stylesheet URLs in crossOriginStylesheets', () => {
        expect(ssData.crossOriginUrls).toContain('https://cdn.external.com/bootstrap.min.css');
      });

      it('does not crash when processing cross-origin sheets', () => {
        expect(() => extractStylesheetData(mockDocument, buildSignature)).not.toThrow();
      });
    });

    it('full extractComputedStyles populates states on matching elements', () => {
      const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
      expect(result.elements['button.btn.btn-primary'].states[':hover']['background-color']).toBe('#0056b3');
      expect(result.elements['input.form-control'].states[':focus']['border-color']).toBe('#80bdff');
    });

    it('full extractComputedStyles records cross-origin sheets', () => {
      const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
      expect(result.crossOriginStylesheets).toContain('https://cdn.external.com/bootstrap.min.css');
    });

  });

  describe('STYLE-03: CSS Custom Property Token Vocabulary', () => {

    describe('_buildTokenVocabulary', () => {
      let tokens;

      beforeEach(() => {
        const ssData = extractStylesheetData(mockDocument, buildSignature);
        tokens = buildTokenVocabulary(mockWindow, mockDocument, ssData.tokenUsage, ssData.scopedTokens);
      });

      it('groups tokens by --color-*, --spacing-*, --font-*, other', () => {
        expect(tokens).toHaveProperty('color');
        expect(tokens).toHaveProperty('spacing');
        expect(tokens).toHaveProperty('font');
        expect(tokens).toHaveProperty('other');
      });

      it('puts --color-* tokens in the color group', () => {
        expect(tokens.color['--color-primary']).toBeDefined();
      });

      it('puts --spacing-* tokens in the spacing group', () => {
        expect(tokens.spacing['--spacing-sm']).toBeDefined();
      });

      it('puts --font-* tokens in the font group', () => {
        expect(tokens.font['--font-size-base']).toBeDefined();
      });

      it('trims leading whitespace from token values', () => {
        // rootStyleMap has ' #E8462A' (leading space) — trim must produce '#E8462A'
        expect(tokens.color['--color-primary'].value).toBe('#E8462A');
        expect(tokens.spacing['--spacing-sm'].value).toBe('8px');
        expect(tokens.font['--font-size-base'].value).toBe('16px');
      });

      it('includes value, definedAt, usedBy fields per token', () => {
        const token = tokens.color['--color-primary'];
        expect(token).toHaveProperty('value');
        expect(token).toHaveProperty('definedAt');
        expect(token).toHaveProperty('usedBy');
      });

      it('definedAt is :root for root-level custom properties', () => {
        expect(tokens.color['--color-primary'].definedAt).toBe(':root');
        expect(tokens.spacing['--spacing-sm'].definedAt).toBe(':root');
      });

      it('records var() usage in usedBy from stylesheet rules', () => {
        // .nav-item rule uses var(--color-primary)
        expect(tokens.color['--color-primary'].usedBy).toContain('.nav-item');
      });

      it('usedBy is an array', () => {
        expect(Array.isArray(tokens.color['--color-primary'].usedBy)).toBe(true);
      });
    });

    it('full extractComputedStyles includes tokens in globals', () => {
      const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
      expect(result.globals.tokens).toBeDefined();
      expect(result.globals.tokens.color['--color-primary'].value).toBe('#E8462A');
      expect(result.globals.tokens.color['--color-primary'].definedAt).toBe(':root');
      expect(result.globals.tokens.color['--color-primary'].usedBy).toContain('.nav-item');
    });

  });

  describe('Edge Cases', () => {

    it('handles elements with empty classList gracefully', () => {
      const emptyClassEl = { tagName: 'P', classList: [], outerHTML: '<p>Text</p>' };
      expect(buildSignature(emptyClassEl)).toBe('p');
    });

    it('cross-origin stylesheet does not crash extraction', () => {
      const onlyCrossOriginDoc = {
        body: mockDocument.body,
        documentElement: mockDocument.documentElement,
        querySelectorAll(sel) { return sel === '*' ? [] : []; },
        styleSheets: [mockCrossOriginSheet]
      };
      expect(() => extractStylesheetData(onlyCrossOriginDoc, buildSignature)).not.toThrow();
      const result = extractStylesheetData(onlyCrossOriginDoc, buildSignature);
      expect(result.crossOriginUrls).toContain('https://cdn.external.com/bootstrap.min.css');
    });

    it('dedup correctness for identical siblings: 3 li.nav-item elements produce 1 entry', () => {
      const result = extractComputedStyles(mockWindow, mockDocument, DESIGN_SYSTEM_PROPERTIES);
      const keys = Object.keys(result.elements).filter(k => k === 'li.nav-item');
      expect(keys).toHaveLength(1);
      expect(result.elements['li.nav-item'].occurrences).toBe(3);
    });

    it('signature classes are sorted alphabetically', () => {
      // btn-primary comes before btn alphabetically after sorting
      expect(buildSignature({ tagName: 'BUTTON', classList: ['btn-primary', 'btn'] }))
        .toBe('button.btn.btn-primary');
      expect(buildSignature({ tagName: 'BUTTON', classList: ['btn', 'btn-primary'] }))
        .toBe('button.btn.btn-primary');
    });

    it('empty stylesheets array produces empty pseudoMap and no cross-origin entries', () => {
      const emptySheetDoc = {
        body: mockDocument.body,
        documentElement: mockDocument.documentElement,
        querySelectorAll(sel) { return sel === '*' ? [mockDiv] : []; },
        styleSheets: []
      };
      const result = extractStylesheetData(emptySheetDoc, buildSignature);
      expect(result.pseudoMap).toEqual({});
      expect(result.crossOriginUrls).toEqual([]);
      expect(result.tokenUsage).toEqual({});
    });

  });

});
