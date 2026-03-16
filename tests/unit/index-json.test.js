describe('index.json Structure', () => {
  describe('Scope metadata', () => {
    test.todo('scope.mode is "element" when element selected');
    test.todo('scope.mode is "full-page" when no element selected');
    test.todo('scope.selector contains CSS selector string when scoped');
    test.todo('scope.outerHtml is truncated to 500 chars');
    test.todo('scope.childCount is a number');
  });

  describe('Stage flags', () => {
    test.todo('stages.html is true when scoped HTML present');
    test.todo('stages.assets is true when assets downloaded');
    test.todo('stages.computedStyles is true when computed styles present');
  });

  describe('Failed assets', () => {
    test.todo('failedAssets is an array of { url, reason } objects');
    test.todo('failedAssets is empty array when all assets succeed');
  });
});
