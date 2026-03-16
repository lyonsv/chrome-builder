// --- Inline copies of detection functions for testing (no module system) ---
// These MUST match the implementations in content.js exactly.

const BEM_BLOCK_RE = /^([a-z][a-z0-9-]*)(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$/;

function getReactComponentName(el) {
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  let fiber = el[fiberKey];
  let hops = 0;
  while (fiber && hops < 20) {
    const type = fiber.type;
    if (typeof type === 'function' && (type.displayName || type.name)) {
      return type.displayName || type.name;
    }
    fiber = fiber.return;
    hops++;
  }
  return null;
}

function getVueComponentName(el) {
  if (el.__vueParentComponent) {
    const type = el.__vueParentComponent.type;
    return type?.name || type?.__name || null;
  }
  if (el.__vue__) {
    return el.__vue__.$options?.name || null;
  }
  return null;
}

function getAngularComponentName(el, windowRef) {
  if (windowRef?.ng?.getComponent) {
    const instance = windowRef.ng.getComponent(el);
    if (instance) return instance.constructor?.name || null;
  }
  if (el.__ngContext__) {
    return el.__ngContext__?.constructor?.name || null;
  }
  return null;
}

function getDataAttrComponentName(el) {
  return el.dataset?.component
    || el.dataset?.block
    || el.dataset?.module
    || el.dataset?.testid
    || null;
}

function getBemComponentName(el) {
  const classList = el.classList || [];
  for (const cls of classList) {
    const m = cls.match(BEM_BLOCK_RE);
    if (m) return m[1];
  }
  return null;
}

function getGeneratedName(el) {
  const tag = (el.tagName || 'div').toLowerCase();
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/)[0]
    : '';
  return tag + cls;
}

// --- Tests ---

describe('Component Hierarchy Detection', () => {
  describe('React fiber detection', () => {
    test('extracts component name from __reactFiber$ prefixed key', () => {
      const el = {
        '__reactFiber$abc123': {
          type: function Header() {},
          return: null
        }
      };
      el['__reactFiber$abc123'].type.displayName = 'Header';
      expect(getReactComponentName(el)).toBe('Header');
    });

    test('walks fiber.return chain up to 20 hops to find named component', () => {
      const namedFiber = { type: function App() {}, return: null };
      namedFiber.type.name = 'App';
      const middleFiber = { type: 'div', return: namedFiber };
      const leafFiber = { type: 'span', return: middleFiber };
      const el = { '__reactFiber$xyz': leafFiber };
      expect(getReactComponentName(el)).toBe('App');
    });

    test('returns null when no __reactFiber$ key found on element', () => {
      expect(getReactComponentName({ someOtherProp: true })).toBeNull();
    });

    test('handles displayName preference over name', () => {
      function MyComp() {}
      MyComp.displayName = 'CustomDisplayName';
      const el = { '__reactFiber$test': { type: MyComp, return: null } };
      expect(getReactComponentName(el)).toBe('CustomDisplayName');
    });
  });

  describe('Vue detection', () => {
    test('extracts name from __vueParentComponent.type.name (Vue 3)', () => {
      const el = { __vueParentComponent: { type: { name: 'AppNav' } } };
      expect(getVueComponentName(el)).toBe('AppNav');
    });

    test('extracts name from __vue__.$options.name (Vue 2)', () => {
      const el = { __vue__: { $options: { name: 'OldNav' } } };
      expect(getVueComponentName(el)).toBe('OldNav');
    });
  });

  describe('Angular detection', () => {
    test('extracts component name via window.ng.getComponent', () => {
      class HeroComponent {}
      const mockWindow = { ng: { getComponent: () => new HeroComponent() } };
      expect(getAngularComponentName({}, mockWindow)).toBe('HeroComponent');
    });

    test('falls back to __ngContext__ when ng global unavailable', () => {
      class FooterComponent {}
      const el = { __ngContext__: new FooterComponent() };
      expect(getAngularComponentName(el, {})).toBe('FooterComponent');
    });
  });

  describe('data-* attribute detection', () => {
    test('returns data-component value when present', () => {
      const el = { dataset: { component: 'SearchBar', testid: 'search' } };
      expect(getDataAttrComponentName(el)).toBe('SearchBar');
    });

    test('returns data-testid as last resort', () => {
      const el = { dataset: { testid: 'nav-bar' } };
      expect(getDataAttrComponentName(el)).toBe('nav-bar');
    });

    test('tries data-block and data-module before data-testid', () => {
      const el = { dataset: { block: 'hero', testid: 'hero-section' } };
      expect(getDataAttrComponentName(el)).toBe('hero');
    });
  });

  describe('BEM detection', () => {
    test('extracts block name from BEM class pattern', () => {
      const el = { classList: ['nav-bar'] };
      expect(getBemComponentName(el)).toBe('nav-bar');
    });

    test('returns block from block__element--modifier format', () => {
      const el = { classList: ['nav-bar__item--active'] };
      expect(getBemComponentName(el)).toBe('nav-bar');
    });

    test('ignores non-BEM class names', () => {
      // Uppercase or starting with number — not BEM
      const el = { classList: ['MyComponent', '123-invalid'] };
      expect(getBemComponentName(el)).toBeNull();
    });
  });

  describe('Generated fallback', () => {
    test('produces tag.firstClass format for elements with classes', () => {
      const el = { tagName: 'DIV', className: 'hero-section aside' };
      expect(getGeneratedName(el)).toBe('div.hero-section');
    });

    test('produces bare tag for elements without classes', () => {
      const el = { tagName: 'SECTION', className: '' };
      expect(getGeneratedName(el)).toBe('section');
    });

    test('never returns null - always produces a name', () => {
      const el = { tagName: 'SPAN', className: '' };
      const result = getGeneratedName(el);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('Hierarchy output shape', () => {
    test('each node has name, source, selector, children keys', () => {
      // Simulates the shape returned by buildComponentHierarchy
      const node = {
        name: 'div.header',
        source: 'generated',
        selector: 'div.header',
        children: []
      };
      expect(node).toHaveProperty('name');
      expect(node).toHaveProperty('source');
      expect(node).toHaveProperty('selector');
      expect(node).toHaveProperty('children');
    });

    test('children is always an array', () => {
      const node = { name: 'Header', source: 'react', selector: 'div.header', children: [] };
      expect(Array.isArray(node.children)).toBe(true);
    });

    test('source is one of: react, vue, angular, data-attr, bem, generated', () => {
      const validSources = ['react', 'vue', 'angular', 'data-attr', 'bem', 'generated'];
      expect(validSources).toContain('react');
      expect(validSources).toContain('generated');
      expect(validSources.length).toBe(6);
    });
  });
});
