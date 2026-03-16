describe('Asset Fetching', () => {
  describe('fetchAssets()', () => {
    test.todo('returns { url, filename, data } with Uint8Array for successful fetch');
    test.todo('returns { url, error } with HTTP status for non-200 response');
    test.todo('returns { url, error: "timeout" } when fetch exceeds timeout');
    test.todo('handles AbortController cleanup on success');
  });

  describe('Filename extraction', () => {
    test.todo('extracts filename from URL path (e.g. logo.png from https://cdn.example.com/images/logo.png)');
    test.todo('handles query parameters in URL (strips ?v=123)');
    test.todo('falls back to hash-based name for URLs without filename');
  });

  describe('Filename collision resolution', () => {
    test.todo('returns original filename when no collision');
    test.todo('appends -1 suffix on first collision (logo.png -> logo-1.png)');
    test.todo('increments counter on subsequent collisions (logo-2.png, logo-3.png)');
    test.todo('handles collision for filenames without extension');
  });

  describe('Parallel fetch', () => {
    test.todo('fetches multiple URLs concurrently via Promise.all');
    test.todo('continues fetching remaining URLs when one fails');
  });
});
