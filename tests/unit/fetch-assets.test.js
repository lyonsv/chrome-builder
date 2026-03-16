// Tests for asset fetching utility functions (background.js)
// Since background.js has no module exports, we test by extracting pure functions inline.

function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    return last || 'asset';
  } catch (_) {
    return 'asset';
  }
}

function resolveFilename(filename, seen) {
  if (!seen.has(filename)) {
    seen.set(filename, 0);
    return filename;
  }
  let counter = seen.get(filename) + 1;
  seen.set(filename, counter);
  const dotIdx = filename.lastIndexOf('.');
  if (dotIdx === -1) return filename + '-' + counter;
  return filename.slice(0, dotIdx) + '-' + counter + filename.slice(dotIdx);
}

describe('Asset Fetching', () => {
  describe('Filename extraction', () => {
    test('extracts filename from URL path', () => {
      expect(extractFilename('https://cdn.example.com/images/logo.png')).toBe('logo.png');
    });

    test('handles query parameters in URL', () => {
      expect(extractFilename('https://cdn.example.com/images/logo.png?v=123')).toBe('logo.png');
    });

    test('falls back to "asset" for URLs without filename', () => {
      expect(extractFilename('https://example.com/')).toBe('asset');
    });
  });

  describe('Filename collision resolution', () => {
    test('returns original filename when no collision', () => {
      const seen = new Map();
      expect(resolveFilename('logo.png', seen)).toBe('logo.png');
    });

    test('appends -1 suffix on first collision', () => {
      const seen = new Map();
      resolveFilename('logo.png', seen);
      expect(resolveFilename('logo.png', seen)).toBe('logo-1.png');
    });

    test('increments counter on subsequent collisions', () => {
      const seen = new Map();
      resolveFilename('logo.png', seen);
      resolveFilename('logo.png', seen);
      expect(resolveFilename('logo.png', seen)).toBe('logo-2.png');
    });

    test('handles collision for filenames without extension', () => {
      const seen = new Map();
      resolveFilename('README', seen);
      expect(resolveFilename('README', seen)).toBe('README-1');
    });
  });
});
