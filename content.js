// Content script for Website Migration Analyzer
// Runs in the context of the web page to analyze DOM and discover assets

// Avoid multiple class declarations
if (!window.WebsiteAnalyzer) {

class WebsiteAnalyzer {
  constructor() {
    this.assets = {
      html: [],
      css: [],
      js: [],
      images: [],
      fonts: [],
      other: []
    };
    this.frameworks = [];
    this.thirdPartyServices = [];
    this.metadata = {};
  }

  // Main analysis function called by popup/background
  async analyzeWebsite() {
    console.log('Starting website analysis...');

    try {
      // Analyze in parallel for better performance
      await Promise.all([
        this.extractHTMLContent(),
        this.discoverAssets(),
        this.detectFrameworks(),
        this.identifyThirdPartyServices(),
        this.extractMetadata(),
        this.analyzePerformance()
      ]);

      // Extract Next.js SSR data (separate since it's synchronous)
      const nextJsData = this.extractNextJsData();

      return {
        url: window.location.href,
        title: document.title,
        assets: this.assets,
        frameworks: this.frameworks,
        thirdPartyServices: this.thirdPartyServices,
        nextJsData: nextJsData,
        metadata: this.metadata,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  }

  async extractHTMLContent() {
    // Get the current HTML
    const html = document.documentElement.outerHTML;

    // Clean and format HTML
    const cleanHtml = this.cleanHTML(html);

    this.assets.html.push({
      url: window.location.href,
      content: cleanHtml,
      size: html.length,
      type: 'text/html'
    });
  }

  cleanHTML(html) {
    // Remove script tags with inline content to avoid security issues
    return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '<script>/* Content removed for security */</script>');
  }

  async discoverAssets() {
    // CSS files
    const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of cssLinks) {
      await this.addAsset('css', link.href, {
        element: 'link',
        media: link.media || 'all',
        crossorigin: link.crossOrigin
      });
    }

    // Inline CSS
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach((style, index) => {
      this.assets.css.push({
        url: `${window.location.href}#inline-style-${index}`,
        content: style.textContent,
        size: style.textContent.length,
        type: 'text/css',
        inline: true
      });
    });

    // JavaScript files
    const scripts = document.querySelectorAll('script[src]');
    for (const script of scripts) {
      await this.addAsset('js', script.src, {
        async: script.async,
        defer: script.defer,
        type: script.type || 'text/javascript',
        crossorigin: script.crossOrigin
      });
    }

    // Inline JavaScript
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach((script, index) => {
      if (script.textContent.trim()) {
        this.assets.js.push({
          url: `${window.location.href}#inline-script-${index}`,
          content: script.textContent,
          size: script.textContent.length,
          type: script.type || 'text/javascript',
          inline: true
        });
      }
    });

    // Images
    const images = document.querySelectorAll('img[src], picture source[srcset], [style*="background-image"]');
    for (const img of images) {
      if (img.src) {
        await this.addAsset('images', img.src, {
          alt: img.alt,
          width: img.width,
          height: img.height,
          loading: img.loading
        });
      }
      // Handle srcset for responsive images
      if (img.srcset) {
        const srcsetUrls = this.parseSrcset(img.srcset);
        for (const url of srcsetUrls) {
          await this.addAsset('images', url);
        }
      }
    }

    // Background images from computed styles
    this.extractBackgroundImages();

    // Fonts
    this.extractFonts();

    // Other resources (favicon, manifest, etc.)
    await this.extractOtherAssets();
  }

  async addAsset(type, url, metadata = {}) {
    if (!url || this.isDataUrl(url)) return;

    const absoluteUrl = this.makeAbsoluteUrl(url);

    // Avoid duplicates
    if (this.assets[type].some(asset => asset.url === absoluteUrl)) return;

    const assetInfo = {
      url: absoluteUrl,
      type: this.getContentType(absoluteUrl, type),
      discovered: 'dom',
      ...metadata
    };

    // Try to get additional info
    try {
      if (type === 'css') {
        assetInfo.content = await this.fetchAssetContent(absoluteUrl);
      }
    } catch (error) {
      console.log(`Could not fetch ${type} content from ${absoluteUrl}:`, error.message);
    }

    this.assets[type].push(assetInfo);
  }

  extractBackgroundImages() {
    const elementsWithBg = document.querySelectorAll('*');
    elementsWithBg.forEach(el => {
      const style = window.getComputedStyle(el);
      const bgImage = style.backgroundImage;

      if (bgImage && bgImage !== 'none') {
        const urls = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/g);
        if (urls) {
          urls.forEach(urlMatch => {
            const url = urlMatch.match(/url\(['"]?([^'"]+)['"]?\)/)[1];
            this.addAsset('images', url, { discoveredFrom: 'background-image' });
          });
        }
      }
    });
  }

  extractFonts() {
    // Web fonts from @font-face rules
    const stylesheets = Array.from(document.styleSheets);
    stylesheets.forEach(sheet => {
      try {
        const rules = Array.from(sheet.cssRules || []);
        rules.forEach(rule => {
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            const src = rule.style.src;
            if (src) {
              const urls = src.match(/url\(['"]?([^'"]+)['"]?\)/g);
              if (urls) {
                urls.forEach(urlMatch => {
                  const url = urlMatch.match(/url\(['"]?([^'"]+)['"]?\)/)[1];
                  this.addAsset('fonts', url, {
                    fontFamily: rule.style.fontFamily,
                    fontWeight: rule.style.fontWeight,
                    fontStyle: rule.style.fontStyle
                  });
                });
              }
            }
          }
        });
      } catch (error) {
        // Cross-origin stylesheets may not be accessible
        console.log('Could not access stylesheet rules:', error.message);
      }
    });

    // Google Fonts and other font links
    const fontLinks = document.querySelectorAll('link[href*="fonts"]');
    fontLinks.forEach(link => {
      this.addAsset('fonts', link.href, { source: 'link-tag' });
    });
  }

  async extractOtherAssets() {
    // Favicon
    const favicon = document.querySelector('link[rel*="icon"]') ||
                   document.querySelector('link[rel="shortcut icon"]');
    if (favicon) {
      await this.addAsset('other', favicon.href, { type: 'favicon' });
    }

    // Web app manifest
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      await this.addAsset('other', manifest.href, { type: 'manifest' });
    }

    // Preload/prefetch resources
    const preloadLinks = document.querySelectorAll('link[rel="preload"], link[rel="prefetch"]');
    for (const link of preloadLinks) {
      await this.addAsset('other', link.href, {
        type: link.rel,
        as: link.as
      });
    }
  }

  detectFrameworks() {
    const frameworks = [];

    // React
    if (window.React || document.querySelector('[data-reactroot]') ||
        document.querySelector('div[id="root"]') ||
        this.findInScripts(['react', 'ReactDOM'])) {
      frameworks.push({
        name: 'React',
        version: this.getFrameworkVersion('React'),
        confidence: this.calculateConfidence(['React', 'ReactDOM'])
      });
    }

    // Vue.js
    if (window.Vue || document.querySelector('[v-]') ||
        document.querySelector('[data-v-]') ||
        this.findInScripts(['vue', 'Vue'])) {
      frameworks.push({
        name: 'Vue.js',
        version: this.getFrameworkVersion('Vue'),
        confidence: this.calculateConfidence(['Vue'])
      });
    }

    // Angular
    if (window.ng || window.angular ||
        document.querySelector('[ng-]') ||
        document.querySelector('app-root') ||
        this.findInScripts(['angular', '@angular'])) {
      frameworks.push({
        name: 'Angular',
        version: this.getFrameworkVersion('ng') || this.getFrameworkVersion('angular'),
        confidence: this.calculateConfidence(['angular', '@angular'])
      });
    }

    // jQuery
    if (window.jQuery || window.$ || this.findInScripts(['jquery'])) {
      frameworks.push({
        name: 'jQuery',
        version: window.jQuery?.fn?.jquery || this.getFrameworkVersion('jQuery'),
        confidence: this.calculateConfidence(['jquery'])
      });
    }

    // Next.js
    if (window.__NEXT_DATA__ || this.findInScripts(['next', '_next'])) {
      frameworks.push({
        name: 'Next.js',
        confidence: this.calculateConfidence(['next', '_next'])
      });
    }

    // Nuxt.js
    if (window.$nuxt || this.findInScripts(['nuxt'])) {
      frameworks.push({
        name: 'Nuxt.js',
        confidence: this.calculateConfidence(['nuxt'])
      });
    }

    this.frameworks = frameworks;
  }

  findInScripts(keywords) {
    const scripts = document.querySelectorAll('script');
    return Array.from(scripts).some(script => {
      const content = script.textContent.toLowerCase();
      const src = (script.src || '').toLowerCase();
      return keywords.some(keyword =>
        content.includes(keyword.toLowerCase()) ||
        src.includes(keyword.toLowerCase())
      );
    });
  }

  getFrameworkVersion(frameworkName) {
    try {
      const global = window[frameworkName];
      return global?.version || global?.VERSION || null;
    } catch {
      return null;
    }
  }

  calculateConfidence(indicators) {
    let score = 0;
    indicators.forEach(indicator => {
      if (this.findInScripts([indicator])) score += 0.3;
      if (window[indicator]) score += 0.4;
    });
    return Math.min(score, 1.0);
  }

  identifyThirdPartyServices() {
    const services = [];
    const scripts = document.querySelectorAll('script[src]');
    const links = document.querySelectorAll('link[href]');
    const images = document.querySelectorAll('img[src]');

    const servicePatterns = [
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

    // Check scripts
    scripts.forEach(script => {
      servicePatterns.forEach(service => {
        if (service.patterns.some(pattern => script.src.includes(pattern))) {
          this.addServiceToList(services, service, script.src);
        }
      });
    });

    // Check links (CSS, fonts, etc.)
    links.forEach(link => {
      servicePatterns.forEach(service => {
        if (service.patterns.some(pattern => link.href.includes(pattern))) {
          this.addServiceToList(services, service, link.href);
        }
      });
    });

    // Check images (tracking pixels, etc.)
    images.forEach(img => {
      servicePatterns.forEach(service => {
        if (service.patterns.some(pattern => img.src.includes(pattern))) {
          this.addServiceToList(services, service, img.src);
        }
      });
    });

    // Also check inline scripts for service names
    const inlineScripts = document.querySelectorAll('script:not([src])');
    inlineScripts.forEach(script => {
      const content = script.textContent.toLowerCase();
      servicePatterns.forEach(service => {
        if (service.patterns.some(pattern => content.includes(pattern.toLowerCase()))) {
          this.addServiceToList(services, service, 'inline script');
        }
      });
    });

    this.thirdPartyServices = services;
  }

  addServiceToList(services, service, url) {
    const existingService = services.find(s => s.name === service.name);
    if (!existingService) {
      services.push({
        name: service.name,
        urls: [url],
        category: this.categorizeService(service.name)
      });
    } else {
      if (!existingService.urls.includes(url)) {
        existingService.urls.push(url);
      }
    }
  }

  categorizeService(serviceName) {
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
    return categories[serviceName] || 'Unknown';
  }

  extractMetadata() {
    this.metadata = {
      // SEO
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      keywords: document.querySelector('meta[name="keywords"]')?.content || '',

      // Open Graph
      ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
      ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
      ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',

      // Twitter Card
      twitterCard: document.querySelector('meta[name="twitter:card"]')?.content || '',
      twitterTitle: document.querySelector('meta[name="twitter:title"]')?.content || '',
      twitterDescription: document.querySelector('meta[name="twitter:description"]')?.content || '',

      // Technical
      charset: document.charset || document.characterSet,
      viewport: document.querySelector('meta[name="viewport"]')?.content || '',
      lang: document.documentElement.lang || '',

      // Additional
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      robots: document.querySelector('meta[name="robots"]')?.content || ''
    };
  }

  async analyzePerformance() {
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');

      this.metadata.performance = {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        resourceCount: resources.length,
        totalTransferSize: resources.reduce((sum, resource) => sum + (resource.transferSize || 0), 0)
      };
    }
  }

  // Utility functions
  makeAbsoluteUrl(url) {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  isDataUrl(url) {
    return url.startsWith('data:');
  }

  getContentType(url, fallbackType) {
    const extension = url.split('.').pop()?.toLowerCase();
    const typeMap = {
      css: 'text/css',
      js: 'text/javascript',
      html: 'text/html',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      woff: 'font/woff',
      woff2: 'font/woff2',
      ttf: 'font/ttf',
      eot: 'application/vnd.ms-fontobject'
    };
    return typeMap[extension] || `application/${fallbackType}`;
  }

  parseSrcset(srcset) {
    return srcset.split(',').map(src => src.trim().split(' ')[0]).filter(url => url);
  }

  async fetchAssetContent(url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch (error) {
      console.log(`Failed to fetch ${url}:`, error.message);
    }
    return null;
  }

  extractNextJsData() {
    console.log('Extracting Next.js SSR data...');
    const nextData = {
      hasNextData: false,
      pageProps: null,
      query: null,
      buildId: null,
      serverSideProps: null,
      staticProps: null,
      apolloState: null,
      graphqlQueries: [],
      apiEndpoints: [],
      dataStructure: null
    };

    try {
      // Find __NEXT_DATA__ script tag
      const nextDataScript = document.getElementById('__NEXT_DATA__');
      if (nextDataScript && nextDataScript.textContent) {
        console.log('Found __NEXT_DATA__ script tag');
        nextData.hasNextData = true;

        const parsedData = JSON.parse(nextDataScript.textContent);
        console.log('Parsed __NEXT_DATA__:', parsedData);

        // Extract key Next.js data
        nextData.pageProps = parsedData.props?.pageProps || null;
        nextData.query = parsedData.query || null;
        nextData.buildId = parsedData.buildId || null;

        // Look for server-side props
        if (parsedData.props?.pageProps) {
          nextData.serverSideProps = parsedData.props.pageProps;
          nextData.dataStructure = this.analyzeDataStructure(parsedData.props.pageProps);
        }

        // Look for Apollo Client cache (common GraphQL client for Next.js)
        if (parsedData.props?.pageProps?.__APOLLO_STATE__) {
          nextData.apolloState = parsedData.props.pageProps.__APOLLO_STATE__;
          console.log('Found Apollo GraphQL state');
        }

        // Look for GraphQL queries in the data structure
        nextData.graphqlQueries = this.findGraphQLQueries(parsedData);

        // Look for API endpoints
        nextData.apiEndpoints = this.findApiEndpoints(parsedData);
      }

      // Also check window.__NEXT_DATA__ (sometimes available globally)
      if (window.__NEXT_DATA__ && !nextData.hasNextData) {
        console.log('Found window.__NEXT_DATA__');
        nextData.hasNextData = true;
        nextData.pageProps = window.__NEXT_DATA__.props?.pageProps || null;
        nextData.query = window.__NEXT_DATA__.query || null;
        nextData.buildId = window.__NEXT_DATA__.buildId || null;

        if (window.__NEXT_DATA__.props?.pageProps) {
          nextData.dataStructure = this.analyzeDataStructure(window.__NEXT_DATA__.props.pageProps);
          nextData.graphqlQueries = this.findGraphQLQueries(window.__NEXT_DATA__);
          nextData.apiEndpoints = this.findApiEndpoints(window.__NEXT_DATA__);
        }
      }

    } catch (error) {
      console.error('Error extracting Next.js data:', error);
    }

    console.log('Extracted Next.js data:', nextData);
    return nextData;
  }

  analyzeDataStructure(data, path = '', depth = 0) {
    if (depth > 3 || !data || typeof data !== 'object') return null;

    const analysis = {
      keys: Object.keys(data),
      types: {},
      arrayLengths: {},
      possibleEntities: []
    };

    for (const [key, value] of Object.entries(data)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (Array.isArray(value)) {
        analysis.types[key] = 'array';
        analysis.arrayLengths[key] = value.length;

        // Analyze array contents
        if (value.length > 0 && typeof value[0] === 'object') {
          const firstItem = value[0];
          if (firstItem.id || firstItem._id || firstItem.uuid) {
            analysis.possibleEntities.push({
              key,
              path: currentPath,
              count: value.length,
              sampleKeys: Object.keys(firstItem).slice(0, 5)
            });
          }
        }
      } else if (value && typeof value === 'object') {
        analysis.types[key] = 'object';

        // Check if this looks like an entity
        if (value.id || value._id || value.uuid) {
          analysis.possibleEntities.push({
            key,
            path: currentPath,
            sampleKeys: Object.keys(value).slice(0, 5)
          });
        }
      } else {
        analysis.types[key] = typeof value;
      }
    }

    return analysis;
  }

  findGraphQLQueries(data) {
    const queries = [];

    // Look for common GraphQL patterns
    const searchForGraphQL = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Common GraphQL cache patterns
        if (key === '__APOLLO_STATE__' || key === 'apolloState') {
          queries.push({
            type: 'apollo_cache',
            path: currentPath,
            keys: Object.keys(value || {}).slice(0, 10)
          });
        }

        // Look for query strings
        if (typeof value === 'string' && (
          value.includes('query ') ||
          value.includes('mutation ') ||
          value.includes('subscription ')
        )) {
          queries.push({
            type: 'query_string',
            path: currentPath,
            query: value.substring(0, 200)
          });
        }

        // Recurse into objects/arrays
        if (typeof value === 'object') {
          searchForGraphQL(value, currentPath);
        }
      }
    };

    searchForGraphQL(data);
    return queries;
  }

  findApiEndpoints(data) {
    const endpoints = [];

    const searchForEndpoints = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;

      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Look for URL patterns
        if (typeof value === 'string' && (
          value.includes('/api/') ||
          value.includes('/graphql') ||
          value.includes('https://') && (value.includes('api') || value.includes('graph'))
        )) {
          endpoints.push({
            key,
            path: currentPath,
            url: value
          });
        }

        // Recurse
        if (typeof value === 'object') {
          searchForEndpoints(value, currentPath);
        }
      }
    };

    searchForEndpoints(data);
    return endpoints;
  }
}

// Store the class globally to avoid redeclaration
window.WebsiteAnalyzer = WebsiteAnalyzer;

} // End of class declaration guard

// Avoid multiple initialization
if (!window.migrationAnalyzerLoaded) {
  window.migrationAnalyzerLoaded = true;

  // Initialize analyzer
  const websiteAnalyzer = new window.WebsiteAnalyzer();

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ANALYZE_WEBSITE') {
      websiteAnalyzer.analyzeWebsite()
        .then(result => sendResponse({ success: true, data: result }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep message channel open
    }
  });

  console.log('Website Migration Analyzer content script loaded');
}