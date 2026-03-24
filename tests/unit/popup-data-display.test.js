// tests/unit/popup-data-display.test.js
// Unit tests for GET_ANALYSIS handler, startAnalysis branching, and display count computations.
// Uses inline function copies — background.js and popup.js have no module system (established Phase 3/4 pattern).

// === Inline copies of functions under test ===

// handleGetAnalysis — copy of the GET_ANALYSIS handler logic added to background.js
function handleGetAnalysis(analysisDataMap, networkRequestsMap, tabId) {
  const stored = analysisDataMap.get(tabId);
  if (!stored) {
    return { success: false, error: 'No analysis stored for tab' };
  }
  const networkRequests = networkRequestsMap.get(tabId) || [];
  return {
    success: true,
    data: {
      url: stored.url,
      title: stored.title,
      analysisMode: stored.analysisMode,
      assets: stored.assets,
      frameworks: stored.frameworks,
      thirdPartyServices: stored.thirdPartyServices,
      trackingData: stored.trackingData,
      networkRequests
    }
  };
}

// resolveAnalysisData — copy of the startAnalysis branch decision logic in popup.js
function resolveAnalysisData(analysisResult, getAnalysisFn) {
  if (analysisResult && analysisResult.success) {
    return getAnalysisFn();
  }
  return analysisResult;
}

// computeDisplayCounts — copy of the display count computations in popup.js displayResults()
function computeDisplayCounts(analysisData) {
  const assets = analysisData.assets;
  const totalAssets = assets ? Object.values(assets).reduce((sum, arr) => sum + (arr?.length || 0), 0) : 0;
  const totalNetworkRequests = analysisData.networkRequests?.length || 0;
  const totalFrameworks = analysisData.frameworks?.length || 0;
  const totalServices = analysisData.thirdPartyServices?.length || 0;
  const totalTrackingEvents = analysisData.trackingData?.dataLayer?.length ?? 0;
  return { totalAssets, totalNetworkRequests, totalFrameworks, totalServices, totalTrackingEvents };
}

// === Test fixtures ===

const FULL_STORED_ANALYSIS = {
  url: 'https://example.com',
  title: 'Example Site',
  analysisMode: 'scoped',
  assets: { images: ['a.png', 'b.png'], fonts: ['font.woff'], icons: ['icon.svg'] },
  frameworks: [{ name: 'React', version: '18.2.0' }],
  thirdPartyServices: [{ name: 'Google Analytics' }],
  trackingData: { dataLayer: [{ event: 'page_view' }, { event: 'click' }], hasGtm: true, gtm: { containerId: 'GTM-XXXX' } },
  // Heavy fields that must NOT appear in GET_ANALYSIS response:
  computedStyles: { '#main': { color: 'red' } },
  scopedHtml: '<div>big html</div>',
  componentHierarchy: [{ name: 'App' }],
  fetchedAssets: [{ url: 'a.png', data: 'base64...' }]
};

// === Tests ===

describe('GET_ANALYSIS handler', () => {
  test('Test 1 (TRACK-01): returns trackingData.dataLayer from stored analysis', () => {
    const analysisMap = new Map([[123, FULL_STORED_ANALYSIS]]);
    const networkMap = new Map();
    const result = handleGetAnalysis(analysisMap, networkMap, 123);

    expect(result.success).toBe(true);
    expect(result.data.trackingData).toBeDefined();
    expect(result.data.trackingData.dataLayer).toEqual([{ event: 'page_view' }, { event: 'click' }]);

    // Verify displayResults logic computes correct count
    const counts = computeDisplayCounts(result.data);
    expect(counts.totalTrackingEvents).toBe(2);
  });

  test('Test 2 (SCOPE-01): preserves analysisMode field from stored analysis', () => {
    const analysisMap = new Map([[123, FULL_STORED_ANALYSIS]]);
    const networkMap = new Map();
    const result = handleGetAnalysis(analysisMap, networkMap, 123);

    expect(result.success).toBe(true);
    expect(result.data.analysisMode).toBe('scoped');
  });

  test('Test 3 (SCOPE-03): returns full assets object; computeDisplayCounts computes correct totalAssets', () => {
    const analysisMap = new Map([[123, FULL_STORED_ANALYSIS]]);
    const networkMap = new Map();
    const result = handleGetAnalysis(analysisMap, networkMap, 123);

    expect(result.success).toBe(true);
    expect(result.data.assets).toEqual(FULL_STORED_ANALYSIS.assets);

    // images(2) + fonts(1) + icons(1) = 4
    const counts = computeDisplayCounts(result.data);
    expect(counts.totalAssets).toBe(4);
  });

  test('Test 4: merges networkRequests from networkRequests Map', () => {
    const analysisMap = new Map([[123, FULL_STORED_ANALYSIS]]);
    const mockRequests = [{ url: 'https://api.example.com/data', method: 'GET' }];
    const networkMap = new Map([[123, mockRequests]]);
    const result = handleGetAnalysis(analysisMap, networkMap, 123);

    expect(result.success).toBe(true);
    expect(result.data.networkRequests).toEqual(mockRequests);
    expect(result.data.networkRequests.length).toBe(1);
  });

  test('Test 5: returns { success: false } when no stored data exists for tabId', () => {
    const analysisMap = new Map(); // empty — no data for tab 999
    const networkMap = new Map();
    const result = handleGetAnalysis(analysisMap, networkMap, 999);

    expect(result.success).toBe(false);
    expect(result.error).toBe('No analysis stored for tab');
  });

  test('Test 6: excludes heavy fields (computedStyles, scopedHtml, componentHierarchy, fetchedAssets)', () => {
    const analysisMap = new Map([[123, FULL_STORED_ANALYSIS]]);
    const networkMap = new Map();
    const result = handleGetAnalysis(analysisMap, networkMap, 123);

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('computedStyles');
    expect(result.data).not.toHaveProperty('scopedHtml');
    expect(result.data).not.toHaveProperty('componentHierarchy');
    expect(result.data).not.toHaveProperty('fetchedAssets');
  });
});

describe('startAnalysis branching (resolveAnalysisData)', () => {
  test('Test 7: when result has success: true, triggers GET_ANALYSIS pull path (calls getAnalysisFn)', () => {
    const getAnalysisFn = jest.fn().mockReturnValue({ url: 'https://example.com', title: 'Pulled' });
    const analysisResult = { success: true };

    const data = resolveAnalysisData(analysisResult, getAnalysisFn);

    expect(getAnalysisFn).toHaveBeenCalledTimes(1);
    expect(data.title).toBe('Pulled');
  });

  test('Test 8: when result has no success property, uses result directly as analysisData (fallback path)', () => {
    const getAnalysisFn = jest.fn();
    const fallbackData = { url: 'https://example.com', frameworks: [{ name: 'Vue' }] };

    const data = resolveAnalysisData(fallbackData, getAnalysisFn);

    expect(getAnalysisFn).not.toHaveBeenCalled();
    expect(data).toBe(fallbackData);
    expect(data.frameworks[0].name).toBe('Vue');
  });
});

describe('trackingData null safety in computeDisplayCounts', () => {
  test('Test 9: handles missing trackingData (returns 0), missing dataLayer (returns 0), present dataLayer (returns length)', () => {
    // Case A: trackingData is undefined
    const noTracking = { assets: null, networkRequests: [], frameworks: [], thirdPartyServices: [] };
    const countsA = computeDisplayCounts(noTracking);
    expect(countsA.totalTrackingEvents).toBe(0);

    // Case B: trackingData present but dataLayer is undefined
    const noDataLayer = { ...noTracking, trackingData: { hasGtm: false } };
    const countsB = computeDisplayCounts(noDataLayer);
    expect(countsB.totalTrackingEvents).toBe(0);

    // Case C: trackingData present with populated dataLayer
    const withDataLayer = { ...noTracking, trackingData: { dataLayer: [{ event: 'e1' }, { event: 'e2' }, { event: 'e3' }] } };
    const countsC = computeDisplayCounts(withDataLayer);
    expect(countsC.totalTrackingEvents).toBe(3);
  });
});
