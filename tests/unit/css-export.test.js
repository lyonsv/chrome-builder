// Tests for CSS URL extraction utility functions (background.js)
// Since background.js has no module exports, we test by extracting pure functions inline.

// Inline copies of filename utilities (from background.js, lines 17-38)
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

// Inline copy of extractCssUrlsFromNetworkRequests (from background.js)
function extractCssUrlsFromNetworkRequests(requests) {
  const seen = new Set();
  return requests
    .filter(req => {
      // Strategy 1: webRequest type field (most reliable, set at request time)
      if (req.type === 'stylesheet') return true;
      // Strategy 2: content-type response header
      const headers = req.responseHeaders || [];
      const ct = headers.find(h => h.name.toLowerCase() === 'content-type');
      if (ct && ct.value.includes('text/css')) return true;
      // Strategy 3: URL pattern fallback (.css extension)
      return /\.css(\?|$)/.test(req.url);
    })
    .map(req => req.url)
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

// Inline copy of extractCssUrlsFromAnalysisData (from background.js)
function extractCssUrlsFromAnalysisData(analysisData) {
  return (analysisData.assets?.css || [])
    .filter(entry => !entry.inline && entry.url && !entry.url.startsWith('blob:'))
    .map(entry => entry.url);
}

describe('CSS URL Extraction', () => {
  describe('extractCssUrlsFromNetworkRequests', () => {
    test('returns URL for requests with type === stylesheet', () => {
      const requests = [{ type: 'stylesheet', url: 'https://example.com/styles.css' }];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual(['https://example.com/styles.css']);
    });

    test('returns URL for requests with content-type: text/css header (fallback)', () => {
      const requests = [{
        type: 'script',
        url: 'https://example.com/app.js',
        responseHeaders: [{ name: 'content-type', value: 'text/css' }]
      }];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual(['https://example.com/app.js']);
    });

    test('returns URL for requests with .css URL pattern fallback', () => {
      const requests = [{
        type: 'xmlhttprequest',
        url: 'https://example.com/theme.css?v=2',
        responseHeaders: []
      }];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual(['https://example.com/theme.css?v=2']);
    });

    test('returns empty array for non-CSS requests', () => {
      const requests = [{ type: 'script', url: 'https://example.com/app.js' }];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual([]);
    });

    test('deduplicates URLs — two requests with same URL returns single-element array', () => {
      const requests = [
        { type: 'stylesheet', url: 'https://example.com/styles.css' },
        { type: 'stylesheet', url: 'https://example.com/styles.css' }
      ];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual(['https://example.com/styles.css']);
    });

    test('returns empty array for empty input', () => {
      expect(extractCssUrlsFromNetworkRequests([])).toEqual([]);
    });

    test('handles missing responseHeaders gracefully', () => {
      const requests = [{ type: 'script', url: 'https://example.com/app.js' }];
      expect(() => extractCssUrlsFromNetworkRequests(requests)).not.toThrow();
    });

    test('content-type header matching is case-insensitive', () => {
      const requests = [{
        type: 'other',
        url: 'https://example.com/styles',
        responseHeaders: [{ name: 'Content-Type', value: 'text/css; charset=utf-8' }]
      }];
      expect(extractCssUrlsFromNetworkRequests(requests)).toEqual(['https://example.com/styles']);
    });
  });

  describe('extractCssUrlsFromAnalysisData', () => {
    test('returns external non-inline CSS URLs', () => {
      const analysisData = {
        assets: {
          css: [
            { url: 'https://x.com/a.css', inline: false },
            { url: null, inline: true }
          ]
        }
      };
      expect(extractCssUrlsFromAnalysisData(analysisData)).toEqual(['https://x.com/a.css']);
    });

    test('filters out blob: URLs', () => {
      const analysisData = {
        assets: {
          css: [
            { url: 'blob:https://example.com/abc-123', inline: false },
            { url: 'https://example.com/styles.css', inline: false }
          ]
        }
      };
      expect(extractCssUrlsFromAnalysisData(analysisData)).toEqual(['https://example.com/styles.css']);
    });

    test('returns empty array when no assets.css', () => {
      expect(extractCssUrlsFromAnalysisData({})).toEqual([]);
    });

    test('filters out inline CSS entries', () => {
      const analysisData = {
        assets: {
          css: [
            { url: 'https://example.com/styles.css', inline: true }
          ]
        }
      };
      expect(extractCssUrlsFromAnalysisData(analysisData)).toEqual([]);
    });

    test('filters out entries with null URL', () => {
      const analysisData = {
        assets: {
          css: [
            { url: null, inline: false }
          ]
        }
      };
      expect(extractCssUrlsFromAnalysisData(analysisData)).toEqual([]);
    });
  });

  describe('Filename utilities (integration context)', () => {
    test('extractFilename extracts filename from CSS URL', () => {
      expect(extractFilename('https://cdn.example.com/styles/main.css')).toBe('main.css');
    });

    test('extractFilename handles query parameters', () => {
      expect(extractFilename('https://cdn.example.com/theme.css?v=1.2.3')).toBe('theme.css');
    });

    test('resolveFilename handles collisions for CSS files', () => {
      const seen = new Map();
      resolveFilename('main.css', seen);
      expect(resolveFilename('main.css', seen)).toBe('main-1.css');
    });
  });
});
