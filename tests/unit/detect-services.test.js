// tests/unit/detect-services.test.js
// Unit tests for network-based service detection (background.js).
// Uses inline function copies — background.js has no module system (established Phase 3 pattern).

// === Inline copies of functions under test ===

const SERVICE_URL_PATTERNS = [
  // Analytics
  { name: 'Google Analytics', patterns: ['google-analytics.com', 'googletagmanager.com', 'gtag', 'analytics.js', 'ga.js'] },
  { name: 'Adobe Analytics', patterns: ['omtrdc.net', 'adobe.com/analytics', 'metrics.adobe.com'] },
  { name: 'Hotjar', patterns: ['hotjar.com', 'hotjar.io'] },
  { name: 'Mixpanel', patterns: ['mixpanel.com', 'cdn.mxpnl.com'] },
  { name: 'Segment', patterns: ['segment.com', 'segment.io', 'cdn.segment.com'] },

  // Advertising
  { name: 'Google Ads', patterns: ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'] },
  { name: 'Facebook Pixel', patterns: ['facebook.net', 'fbevents.js', 'connect.facebook.net'] },
  { name: 'Amazon Advertising', patterns: ['amazon-adsystem.com'] },
  { name: 'Bing Ads', patterns: ['bat.bing.com'] },

  // Social Media
  { name: 'Twitter', patterns: ['platform.twitter.com', 'syndication.twitter.com', 'twimg.com'] },
  { name: 'LinkedIn', patterns: ['platform.linkedin.com', 'ads.linkedin.com'] },
  { name: 'Instagram', patterns: ['instagram.com', 'cdninstagram.com'] },
  { name: 'YouTube', patterns: ['youtube.com', 'ytimg.com', 'googlevideo.com'] },

  // Customer Support
  { name: 'Intercom', patterns: ['widget.intercom.io', 'intercom.io'] },
  { name: 'Zendesk', patterns: ['zendesk.com', 'zdassets.com'] },
  { name: 'Freshdesk', patterns: ['freshdesk.com'] },
  { name: 'Help Scout', patterns: ['helpscout.net'] },

  // Payments
  { name: 'Stripe', patterns: ['js.stripe.com', 'stripe.com'] },
  { name: 'PayPal', patterns: ['paypal.com/sdk', 'paypalobjects.com'] },
  { name: 'Square', patterns: ['squareup.com', 'square.com'] },
  { name: 'Braintree', patterns: ['braintreegateway.com'] },

  // CDNs
  { name: 'Cloudflare', patterns: ['cdnjs.cloudflare.com', 'cloudflare.com'] },
  { name: 'AWS CloudFront', patterns: ['cloudfront.net'] },
  { name: 'JSDelivr CDN', patterns: ['cdn.jsdelivr.net'] },
  { name: 'unpkg CDN', patterns: ['unpkg.com'] },
  { name: 'Bootstrap CDN', patterns: ['bootstrapcdn.com'] },
  { name: 'Google Fonts', patterns: ['fonts.googleapis.com', 'fonts.gstatic.com'] },

  // Email Marketing
  { name: 'Mailchimp', patterns: ['mailchimp.com', 'list-manage.com'] },
  { name: 'Constant Contact', patterns: ['constantcontact.com'] },
  { name: 'SendGrid', patterns: ['sendgrid.com'] },

  // Error Tracking
  { name: 'Sentry', patterns: ['sentry.io'] },
  { name: 'Bugsnag', patterns: ['bugsnag.com'] },
  { name: 'LogRocket', patterns: ['logrocket.com'] },

  // Performance Monitoring
  { name: 'New Relic', patterns: ['newrelic.com'] },
  { name: 'DataDog', patterns: ['datadoghq.com'] }
];

function categorizeServiceName(name) {
  const categories = {
    // Analytics
    'Google Analytics': 'Analytics',
    'Adobe Analytics': 'Analytics',
    'Hotjar': 'Analytics',
    'Mixpanel': 'Analytics',
    'Segment': 'Analytics',

    // Advertising
    'Google Ads': 'Advertising',
    'Facebook Pixel': 'Advertising',
    'Amazon Advertising': 'Advertising',
    'Bing Ads': 'Advertising',

    // Social Media
    'Twitter': 'Social Media',
    'LinkedIn': 'Social Media',
    'Instagram': 'Social Media',
    'YouTube': 'Social Media',

    // Customer Support
    'Intercom': 'Customer Support',
    'Zendesk': 'Customer Support',
    'Freshdesk': 'Customer Support',
    'Help Scout': 'Customer Support',

    // Payments
    'Stripe': 'Payments',
    'PayPal': 'Payments',
    'Square': 'Payments',
    'Braintree': 'Payments',

    // CDNs
    'Cloudflare': 'CDN',
    'AWS CloudFront': 'CDN',
    'JSDelivr CDN': 'CDN',
    'unpkg CDN': 'CDN',
    'Bootstrap CDN': 'CDN',
    'Google Fonts': 'CDN',

    // Email Marketing
    'Mailchimp': 'Email Marketing',
    'Constant Contact': 'Email Marketing',
    'SendGrid': 'Email Marketing',

    // Error Tracking
    'Sentry': 'Error Tracking',
    'Bugsnag': 'Error Tracking',
    'LogRocket': 'Error Tracking',

    // Performance Monitoring
    'New Relic': 'Performance',
    'DataDog': 'Performance'
  };
  return categories[name] || 'Other';
}

function detectServicesFromNetworkRequests(requests) {
  const seen = new Map();
  for (const req of requests) {
    const url = req.url || '';
    for (const service of SERVICE_URL_PATTERNS) {
      if (service.patterns.some(p => url.includes(p))) {
        if (!seen.has(service.name)) {
          seen.set(service.name, {
            name: service.name,
            urls: [url],
            category: categorizeServiceName(service.name),
            confidence: 'medium',
            source: 'network-request'
          });
        } else {
          const entry = seen.get(service.name);
          if (!entry.urls.includes(url)) {
            entry.urls.push(url);
          }
        }
        break; // Only match first service per URL
      }
    }
  }
  return Array.from(seen.values());
}

// === Tests ===

describe('detectServicesFromNetworkRequests', () => {
  test('returns single entry for one matching request', () => {
    const requests = [{ url: 'https://www.google-analytics.com/analytics.js' }];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Google Analytics',
      urls: ['https://www.google-analytics.com/analytics.js'],
      category: 'Analytics',
      confidence: 'medium',
      source: 'network-request'
    });
  });

  test('returns empty array for empty requests', () => {
    const result = detectServicesFromNetworkRequests([]);
    expect(result).toEqual([]);
  });

  test('deduplicates by service name — 3 requests matching same service produce single entry with all URLs', () => {
    const requests = [
      { url: 'https://www.google-analytics.com/analytics.js' },
      { url: 'https://www.google-analytics.com/gtag/js?id=UA-123' },
      { url: 'https://googletagmanager.com/gtm.js' }
    ];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Google Analytics');
    expect(result[0].urls).toHaveLength(3);
  });

  test('returns 2 entries when requests match 2 different services', () => {
    const requests = [
      { url: 'https://www.google-analytics.com/analytics.js' },
      { url: 'https://js.stripe.com/v3/' }
    ];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result).toHaveLength(2);
    const names = result.map(r => r.name);
    expect(names).toContain('Google Analytics');
    expect(names).toContain('Stripe');
  });

  test('does not duplicate URLs within the same service entry', () => {
    const url = 'https://www.google-analytics.com/analytics.js';
    const requests = [{ url }, { url }];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result).toHaveLength(1);
    expect(result[0].urls).toHaveLength(1);
  });

  test('returns network-request as source', () => {
    const requests = [{ url: 'https://js.stripe.com/v3/' }];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result[0].source).toBe('network-request');
    expect(result[0].confidence).toBe('medium');
  });

  test('ignores requests that do not match any service pattern', () => {
    const requests = [{ url: 'https://example.com/api/data' }];
    const result = detectServicesFromNetworkRequests(requests);
    expect(result).toEqual([]);
  });
});

describe('categorizeServiceName', () => {
  test('returns Analytics for Google Analytics', () => {
    expect(categorizeServiceName('Google Analytics')).toBe('Analytics');
  });

  test('returns Payments for Stripe', () => {
    expect(categorizeServiceName('Stripe')).toBe('Payments');
  });

  test('returns Other for unknown service name', () => {
    expect(categorizeServiceName('Unknown Service')).toBe('Other');
  });

  test('returns Advertising for Facebook Pixel', () => {
    expect(categorizeServiceName('Facebook Pixel')).toBe('Advertising');
  });

  test('returns Social Media for Twitter', () => {
    expect(categorizeServiceName('Twitter')).toBe('Social Media');
  });

  test('returns CDN for Cloudflare', () => {
    expect(categorizeServiceName('Cloudflare')).toBe('CDN');
  });

  test('returns Error Tracking for Sentry', () => {
    expect(categorizeServiceName('Sentry')).toBe('Error Tracking');
  });

  test('returns Performance for New Relic', () => {
    expect(categorizeServiceName('New Relic')).toBe('Performance');
  });

  test('returns Email Marketing for Mailchimp', () => {
    expect(categorizeServiceName('Mailchimp')).toBe('Email Marketing');
  });

  test('returns Customer Support for Zendesk', () => {
    expect(categorizeServiceName('Zendesk')).toBe('Customer Support');
  });
});
