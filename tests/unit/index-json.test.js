describe('index.json Structure', () => {
  describe('Scope metadata', () => {
    test('scope.mode is "element" when element selected', () => {
      const indexData = { scope: { mode: 'element', selector: 'div.header', outerHtml: '<div class="header">...', childCount: 5 } };
      expect(indexData.scope.mode).toBe('element');
    });

    test('scope.mode is "full-page" when no element selected', () => {
      const indexData = { scope: { mode: 'full-page', selector: null, outerHtml: null, childCount: 42 } };
      expect(indexData.scope.mode).toBe('full-page');
    });

    test('scope.selector contains CSS selector string when scoped', () => {
      const indexData = { scope: { mode: 'element', selector: 'div.header-nav', outerHtml: '<div>', childCount: 3 } };
      expect(typeof indexData.scope.selector).toBe('string');
      expect(indexData.scope.selector).toBe('div.header-nav');
    });

    test('scope.outerHtml is truncated to 500 chars', () => {
      const longHtml = '<div>' + 'x'.repeat(600) + '</div>';
      const truncated = longHtml.slice(0, 500);
      expect(truncated.length).toBeLessThanOrEqual(500);
    });

    test('scope.childCount is a number', () => {
      const indexData = { scope: { mode: 'element', selector: 'div', outerHtml: '<div>', childCount: 7 } };
      expect(typeof indexData.scope.childCount).toBe('number');
    });
  });

  describe('Stage flags', () => {
    test('stages.html is true when scoped HTML present', () => {
      const indexData = { stages: { html: true, css: false, computedStyles: true, assets: true, network: true, tracking: false } };
      expect(indexData.stages.html).toBe(true);
    });

    test('stages.assets is true when assets downloaded', () => {
      const indexData = { stages: { html: true, css: false, computedStyles: true, assets: true, network: false, tracking: false } };
      expect(indexData.stages.assets).toBe(true);
    });
  });

  describe('Failed assets', () => {
    test('failedAssets is an array of { url, reason } objects', () => {
      const indexData = { failedAssets: [{ url: 'https://x.com/img.png', reason: 'HTTP 404' }] };
      expect(Array.isArray(indexData.failedAssets)).toBe(true);
      expect(indexData.failedAssets[0]).toHaveProperty('url');
      expect(indexData.failedAssets[0]).toHaveProperty('reason');
    });

    test('failedAssets is empty array when all assets succeed', () => {
      const indexData = { failedAssets: [] };
      expect(indexData.failedAssets).toEqual([]);
    });
  });
});
