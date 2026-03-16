describe('Component Hierarchy Detection', () => {
  describe('React fiber detection', () => {
    test.todo('extracts component name from __reactFiber$ prefixed key');
    test.todo('walks fiber.return chain up to 20 hops to find named component');
    test.todo('returns null when no __reactFiber$ key found on element');
    test.todo('handles displayName preference over name');
  });

  describe('Vue detection', () => {
    test.todo('extracts name from __vueParentComponent.type.name (Vue 3)');
    test.todo('extracts name from __vue__.$options.name (Vue 2)');
  });

  describe('Angular detection', () => {
    test.todo('extracts component name via window.ng.getComponent');
    test.todo('falls back to __ngContext__ when ng global unavailable');
  });

  describe('data-* attribute detection', () => {
    test.todo('returns data-component value when present');
    test.todo('returns data-testid as last resort');
    test.todo('tries data-block and data-module before data-testid');
  });

  describe('BEM detection', () => {
    test.todo('extracts block name from BEM class pattern');
    test.todo('returns block from block__element--modifier format');
    test.todo('ignores non-BEM class names');
  });

  describe('Generated fallback', () => {
    test.todo('produces tag.firstClass format for elements with classes');
    test.todo('produces bare tag for elements without classes');
    test.todo('never returns null — always produces a name');
  });

  describe('Hierarchy output shape', () => {
    test.todo('each node has name, source, selector, children keys');
    test.todo('children is always an array');
    test.todo('source is one of: react, vue, angular, data-attr, bem, generated');
  });
});
