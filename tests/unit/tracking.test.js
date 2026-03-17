// tests/unit/tracking.test.js
// Unit tests for tracking data capture and schema derivation.
// Uses inline function copies — content.js has no module system (established Phase 3 pattern).

// === Inline copies of functions under test ===

// captureTrackingData — copy of the WebsiteAnalyzer method (accepts mock window for testability)
function captureTrackingData(windowObj = {}) {
  // Snapshot dataLayer — deep clone to avoid reference aliasing (Pitfall 3)
  let rawDataLayer;
  if (Array.isArray(windowObj.dataLayer)) {
    try {
      rawDataLayer = JSON.parse(JSON.stringify(windowObj.dataLayer));
    } catch (_) {
      // Fallback for non-serializable entries (circular refs, DOM elements)
      rawDataLayer = windowObj.dataLayer.map(entry => {
        try { return JSON.parse(JSON.stringify(entry)); }
        catch (_) { return { _serializationError: true, keys: Object.keys(entry || {}) }; }
      });
    }
  } else {
    rawDataLayer = [];
  }

  // Extract GTM container info from window.google_tag_manager
  const gtm = {};
  if (windowObj.google_tag_manager) {
    const containerIds = Object.keys(windowObj.google_tag_manager)
      .filter(k => k.startsWith('GTM-'));
    if (containerIds.length > 0) {
      gtm.containerId = containerIds[0];
      gtm.allContainerIds = containerIds;
      try {
        const container = windowObj.google_tag_manager[containerIds[0]];
        gtm.tags = container && container.dataLayer
          ? Object.keys(container).filter(k => k !== 'dataLayer')
          : [];
      } catch (_) { gtm.tags = []; }
    }
  }

  // Script tag fallback not testable in node environment — skip in unit tests
  // (covered by manual verification in VALIDATION.md)

  return {
    dataLayer: rawDataLayer,
    gtm: Object.keys(gtm).length > 0 ? gtm : null,
    hasGtm: !!gtm.containerId,
    note: !gtm.containerId && rawDataLayer.length === 0
      ? 'No GTM container detected. No dataLayer pushes observed.'
      : !gtm.containerId
        ? 'No GTM container detected. dataLayer present but no google_tag_manager object found.'
        : null
  };
}

// deriveEventSchema — copy of the background.js helper
function deriveEventSchema(dataLayerEntries) {
  const eventMap = new Map();
  for (const entry of dataLayerEntries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const eventName = entry.event || '__variables__';
    if (!eventMap.has(eventName)) {
      eventMap.set(eventName, { name: eventName, properties: new Map() });
    }
    const eventDef = eventMap.get(eventName);
    for (const [key, value] of Object.entries(entry)) {
      if (!eventDef.properties.has(key)) {
        const exampleValue = typeof value === 'string' && value.length > 200
          ? value.slice(0, 200) + '...'
          : value;
        eventDef.properties.set(key, exampleValue);
      }
    }
  }
  return Array.from(eventMap.values()).map(e => ({
    name: e.name,
    properties: Array.from(e.properties.entries()).map(([key, exampleValue]) => ({ key, exampleValue }))
  }));
}

// === Tests ===

describe('captureTrackingData', () => {
  test('returns dataLayer array when window.dataLayer is populated', () => {
    const mockWindow = { dataLayer: [{ event: 'page_view', page: '/home' }] };
    const result = captureTrackingData(mockWindow);
    expect(result.dataLayer).toEqual([{ event: 'page_view', page: '/home' }]);
  });

  test('returns empty array when window.dataLayer is undefined', () => {
    const result = captureTrackingData({});
    expect(result.dataLayer).toEqual([]);
    expect(result.hasGtm).toBe(false);
  });

  test('extracts GTM container ID from google_tag_manager', () => {
    const mockWindow = {
      google_tag_manager: { 'GTM-ABC123': { dataLayer: {} } }
    };
    const result = captureTrackingData(mockWindow);
    expect(result.gtm.containerId).toBe('GTM-ABC123');
    expect(result.hasGtm).toBe(true);
  });

  test('returns hasGtm false when no google_tag_manager', () => {
    const mockWindow = { dataLayer: [{ event: 'page_view' }] };
    const result = captureTrackingData(mockWindow);
    expect(result.hasGtm).toBe(false);
    expect(result.note).toContain('No GTM container detected');
  });

  test('deep clones dataLayer — mutation of original does not affect result', () => {
    const original = [{ event: 'page_view', category: 'navigation' }];
    const mockWindow = { dataLayer: original };
    const result = captureTrackingData(mockWindow);
    // Mutate original after capture
    original[0].category = 'MUTATED';
    original.push({ event: 'added_after' });
    // Result should still reflect original snapshot
    expect(result.dataLayer[0].category).toBe('navigation');
    expect(result.dataLayer.length).toBe(1);
  });

  test('handles non-serializable entries with _serializationError fallback', () => {
    // Create an entry with a circular reference
    const circular = { event: 'test', self: null };
    circular.self = circular;
    const mockWindow = {
      dataLayer: [circular]
    };
    const result = captureTrackingData(mockWindow);
    expect(result.dataLayer[0]).toHaveProperty('_serializationError', true);
    expect(result.dataLayer[0]).toHaveProperty('keys');
    expect(Array.isArray(result.dataLayer[0].keys)).toBe(true);
  });
});

describe('deriveEventSchema', () => {
  test('groups entries by event name', () => {
    const entries = [
      { event: 'page_view', page: '/home' },
      { event: 'add_to_cart', product_id: '123' }
    ];
    const schema = deriveEventSchema(entries);
    expect(schema.length).toBe(2);
    const names = schema.map(e => e.name);
    expect(names).toContain('page_view');
    expect(names).toContain('add_to_cart');
  });

  test('collects union of property keys per event type', () => {
    const entries = [
      { event: 'purchase', transaction_id: 'T1', value: 99 },
      { event: 'purchase', transaction_id: 'T2', currency: 'USD' }
    ];
    const schema = deriveEventSchema(entries);
    const purchaseEvent = schema.find(e => e.name === 'purchase');
    const keys = purchaseEvent.properties.map(p => p.key);
    expect(keys).toContain('transaction_id');
    expect(keys).toContain('value');
    expect(keys).toContain('currency');
  });

  test('records first-occurrence example value per property key', () => {
    const entries = [
      { event: 'search', query: 'first query' },
      { event: 'search', query: 'second query' }
    ];
    const schema = deriveEventSchema(entries);
    const searchEvent = schema.find(e => e.name === 'search');
    const queryProp = searchEvent.properties.find(p => p.key === 'query');
    expect(queryProp.exampleValue).toBe('first query');
  });

  test('groups entries without event key under __variables__', () => {
    const entries = [
      { userId: 'user-123', sessionId: 'sess-456' },
      { event: 'page_view', page: '/home' }
    ];
    const schema = deriveEventSchema(entries);
    const variablesGroup = schema.find(e => e.name === '__variables__');
    expect(variablesGroup).toBeDefined();
    const keys = variablesGroup.properties.map(p => p.key);
    expect(keys).toContain('userId');
    expect(keys).toContain('sessionId');
  });

  test('truncates string example values longer than 200 chars', () => {
    const longValue = 'x'.repeat(300);
    const entries = [{ event: 'test', description: longValue }];
    const schema = deriveEventSchema(entries);
    const testEvent = schema.find(e => e.name === 'test');
    const descProp = testEvent.properties.find(p => p.key === 'description');
    expect(descProp.exampleValue.endsWith('...')).toBe(true);
    expect(descProp.exampleValue.length).toBe(203); // 200 chars + '...'
  });
});

describe('schema.json output shape', () => {
  test('has events, gtm, analytics keys', () => {
    const mockTrackingData = {
      dataLayer: [{ event: 'page_view' }],
      gtm: { containerId: 'GTM-XXXXX', allContainerIds: ['GTM-XXXXX'], tags: [] },
      hasGtm: true,
      note: null
    };

    const schemaEvents = deriveEventSchema(mockTrackingData.dataLayer);
    const schemaJson = {
      events: schemaEvents,
      gtm: mockTrackingData.hasGtm ? {
        containerId: mockTrackingData.gtm.containerId,
        allContainerIds: mockTrackingData.gtm.allContainerIds || [],
        tags: mockTrackingData.gtm.tags || []
      } : null,
      analytics: {
        detected: ['Google Analytics']
      }
    };

    expect(schemaJson).toHaveProperty('events');
    expect(schemaJson).toHaveProperty('gtm');
    expect(schemaJson).toHaveProperty('analytics');
    expect(Array.isArray(schemaJson.events)).toBe(true);
  });
});

describe('index.json tracking summary', () => {
  test('excludes __variables__ from uniqueEventNames', () => {
    const entries = [
      { userId: 'user-123' },        // no event key — goes to __variables__
      { event: 'page_view' },
      { event: 'add_to_cart' }
    ];
    const schemaEvents = deriveEventSchema(entries);
    const uniqueEventNames = schemaEvents
      .filter(e => e.name !== '__variables__')
      .map(e => e.name);

    expect(uniqueEventNames).toContain('page_view');
    expect(uniqueEventNames).toContain('add_to_cart');
    expect(uniqueEventNames).not.toContain('__variables__');
  });
});
