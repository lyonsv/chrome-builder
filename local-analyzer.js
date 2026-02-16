// Local HTML Analyzer - Bypasses CSP by analyzing HTML in extension context

class LocalHTMLAnalyzer {
  constructor() {
    this.parser = new DOMParser();
  }

  async analyzeURL(url) {
    try {
      console.log('Fetching HTML for local analysis:', url);

      // Use abort controller to limit download size
      const abortController = new AbortController();
      const maxSize = 2 * 1024 * 1024; // 2MB limit to avoid quota issues
      let aborted = false;

      // Set a timeout to abort if it takes too long
      const timeoutId = setTimeout(() => {
        aborted = true;
        abortController.abort();
        console.log('Fetch aborted due to timeout');
      }, 30000); // 30 second timeout

      try {
        // Always use streaming approach to avoid quota issues
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Migration-Analyzer/1.0)'
          },
          signal: abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        console.log('Response received, starting streaming analysis');
        return await this.streamingAnalysis(response, url, maxSize);

      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError' || aborted) {
          console.log('Fetch was aborted, trying header-only analysis');
          return await this.headerOnlyAnalysis(url);
        }

        throw error;
      }

    } catch (error) {
      console.error('Local HTML analysis failed:', error);

      // If it's a quota error, try header-only approach
      if (error.message.includes('quota') || error.message.includes('Quota') ||
          error.message.includes('exceeded') || error.name === 'QuotaExceededError') {
        console.log('Quota exceeded, trying header-only analysis');
        return await this.headerOnlyAnalysis(url);
      }

      throw new Error(`Failed to fetch HTML: ${error.message}`);
    }
  }

  async streamingAnalysis(response, url, maxBytes) {
    console.log('Performing streaming analysis to avoid quota issues');

    if (!response.body) {
      console.error('Response body not available for streaming');
      return await this.headerOnlyAnalysis(url);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let bytesRead = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log(`Stream complete: read ${bytesRead} bytes total`);
          break;
        }

        // Check if reading this chunk would exceed our limit
        if (bytesRead + value.length > maxBytes) {
          console.log(`Stopping stream at ${bytesRead} bytes to avoid quota`);
          // Decode just the portion that fits within our limit
          const remainingBytes = maxBytes - bytesRead;
          if (remainingBytes > 0) {
            const partialValue = value.slice(0, remainingBytes);
            html += decoder.decode(partialValue, { stream: true });
            bytesRead += partialValue.length;
          }
          break;
        }

        // Decode and add this chunk
        html += decoder.decode(value, { stream: true });
        bytesRead += value.length;

        // Log progress occasionally
        if (bytesRead % (500 * 1024) === 0) { // Every 500KB
          console.log(`Streaming progress: ${Math.round(bytesRead / 1024)}KB read`);
        }
      }

      // Complete decoding
      html += decoder.decode();

      console.log(`Streaming complete: ${bytesRead} bytes, ${html.length} characters`);

    } catch (error) {
      console.error('Streaming failed:', error);
      // If streaming fails, try header-only analysis
      return await this.headerOnlyAnalysis(url);
    } finally {
      try {
        reader.releaseLock();
      } catch (error) {
        // Reader might already be released
      }
    }

    // Analyze the HTML we were able to read
    return await this.analyzeHTMLContent(html, url, bytesRead >= maxBytes);
  }

  async headerOnlyAnalysis(url) {
    console.log('Performing header-only analysis due to size constraints');

    try {
      // Try HEAD request to get basic info
      const headResponse = await fetch(url, { method: 'HEAD' });

      return {
        url: url,
        title: 'Unable to fetch (too large)',
        assets: {
          html: [{
            url: url,
            type: 'text/html',
            note: 'Too large to analyze',
            contentType: headResponse.headers.get('content-type') || 'text/html'
          }],
          css: [], js: [], images: [], fonts: [], other: []
        },
        frameworks: [],
        thirdPartyServices: [],
        metadata: {
          title: 'Analysis limited due to size',
          contentType: headResponse.headers.get('content-type'),
          server: headResponse.headers.get('server'),
          lastModified: headResponse.headers.get('last-modified')
        },
        analysisMode: 'header-only',
        limitedAnalysis: true,
        reason: 'html-too-large',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Header analysis failed: ${error.message}`);
    }
  }

  async analyzeHTMLContent(html, url, truncated) {
    // Parse HTML in extension context (bypasses CSP)
    const doc = this.parser.parseFromString(html, 'text/html');

    // Perform comprehensive analysis
    const analysis = {
      url: url,
      title: this.extractTitle(doc),
      assets: await this.extractAssets(doc, url),
      frameworks: this.detectFrameworks(doc, html),
      thirdPartyServices: this.identifyThirdPartyServices(doc),
      metadata: this.extractMetadata(doc),
      analysisMode: truncated ? 'local-html-truncated' : 'local-html',
      timestamp: new Date().toISOString(),
      htmlSize: html.length,
      truncated: truncated
    };

    if (truncated) {
      analysis.note = 'Analysis performed on partial HTML due to size limits';
    }

    return analysis;
  }

  extractTitle(doc) {
    const titleElement = doc.querySelector('title');
    return titleElement ? titleElement.textContent.trim() : '';
  }

  async extractAssets(doc, baseUrl) {
    const assets = {
      html: [{
        url: baseUrl,
        type: 'text/html',
        source: 'main-document',
        analysisMethod: 'local-fetch'
      }],
      css: [],
      js: [],
      images: [],
      fonts: [],
      other: []
    };

    // Extract CSS files
    const cssLinks = doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"]');
    for (const link of cssLinks) {
      const href = this.resolveURL(link.getAttribute('href'), baseUrl);
      if (href) {
        assets.css.push({
          url: href,
          type: 'text/css',
          media: link.getAttribute('media') || 'all',
          crossorigin: link.getAttribute('crossorigin'),
          source: 'link-tag',
          analysisMethod: 'local-html-parse'
        });
      }
    }

    // Extract inline CSS
    const styleElements = doc.querySelectorAll('style');
    styleElements.forEach((style, index) => {
      assets.css.push({
        url: `${baseUrl}#inline-style-${index}`,
        content: style.textContent,
        size: style.textContent.length,
        type: 'text/css',
        inline: true,
        source: 'inline-style',
        analysisMethod: 'local-html-parse'
      });
    });

    // Extract JavaScript files
    const scripts = doc.querySelectorAll('script[src]');
    for (const script of scripts) {
      const src = this.resolveURL(script.getAttribute('src'), baseUrl);
      if (src) {
        assets.js.push({
          url: src,
          type: script.getAttribute('type') || 'text/javascript',
          async: script.hasAttribute('async'),
          defer: script.hasAttribute('defer'),
          crossorigin: script.getAttribute('crossorigin'),
          source: 'script-tag',
          analysisMethod: 'local-html-parse'
        });
      }
    }

    // Extract inline JavaScript
    const inlineScripts = doc.querySelectorAll('script:not([src])');
    inlineScripts.forEach((script, index) => {
      if (script.textContent.trim()) {
        assets.js.push({
          url: `${baseUrl}#inline-script-${index}`,
          content: script.textContent,
          size: script.textContent.length,
          type: script.getAttribute('type') || 'text/javascript',
          inline: true,
          source: 'inline-script',
          analysisMethod: 'local-html-parse'
        });
      }
    });

    // Extract images
    const images = doc.querySelectorAll('img[src], source[srcset], [style*="background-image"]');
    for (const img of images) {
      if (img.src) {
        const src = this.resolveURL(img.src, baseUrl);
        if (src) {
          assets.images.push({
            url: src,
            type: this.getImageType(src),
            alt: img.getAttribute('alt'),
            width: img.getAttribute('width'),
            height: img.getAttribute('height'),
            loading: img.getAttribute('loading'),
            source: 'img-tag',
            analysisMethod: 'local-html-parse'
          });
        }
      }

      // Handle srcset
      if (img.srcset) {
        const srcsetUrls = this.parseSrcset(img.srcset, baseUrl);
        srcsetUrls.forEach(url => {
          assets.images.push({
            url: url,
            type: this.getImageType(url),
            source: 'srcset',
            analysisMethod: 'local-html-parse'
          });
        });
      }
    }

    // Extract background images from style attributes
    const elementsWithBg = doc.querySelectorAll('[style*="background-image"]');
    elementsWithBg.forEach(el => {
      const style = el.getAttribute('style');
      const bgMatches = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/g);
      if (bgMatches) {
        bgMatches.forEach(match => {
          const url = match.match(/url\(['"]?([^'"]+)['"]?\)/)[1];
          const resolvedUrl = this.resolveURL(url, baseUrl);
          if (resolvedUrl) {
            assets.images.push({
              url: resolvedUrl,
              type: this.getImageType(resolvedUrl),
              source: 'background-image',
              analysisMethod: 'local-html-parse'
            });
          }
        });
      }
    });

    // Extract fonts
    const fontLinks = doc.querySelectorAll('link[href*="fonts"], link[href*="font"]');
    for (const link of fontLinks) {
      const href = this.resolveURL(link.getAttribute('href'), baseUrl);
      if (href) {
        assets.fonts.push({
          url: href,
          type: 'font',
          source: 'font-link',
          analysisMethod: 'local-html-parse'
        });
      }
    }

    // Extract other resources
    const favicon = doc.querySelector('link[rel*="icon"]') || doc.querySelector('link[rel="shortcut icon"]');
    if (favicon) {
      const href = this.resolveURL(favicon.getAttribute('href'), baseUrl);
      if (href) {
        assets.other.push({
          url: href,
          type: 'favicon',
          source: 'favicon-link',
          analysisMethod: 'local-html-parse'
        });
      }
    }

    const manifest = doc.querySelector('link[rel="manifest"]');
    if (manifest) {
      const href = this.resolveURL(manifest.getAttribute('href'), baseUrl);
      if (href) {
        assets.other.push({
          url: href,
          type: 'manifest',
          source: 'manifest-link',
          analysisMethod: 'local-html-parse'
        });
      }
    }

    return assets;
  }

  detectFrameworks(doc, htmlContent) {
    const frameworks = [];
    const html = htmlContent.toLowerCase();

    // React detection
    if (doc.querySelector('[data-reactroot]') ||
        doc.querySelector('div[id="root"]') ||
        html.includes('react') ||
        html.includes('reactdom') ||
        html.includes('__react')) {
      frameworks.push({
        name: 'React',
        confidence: this.calculateFrameworkConfidence(html, ['react', 'reactdom']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['react', 'reactdom', 'data-reactroot'])
      });
    }

    // Vue.js detection
    if (doc.querySelector('[v-]') ||
        doc.querySelector('[data-v-]') ||
        html.includes('vue.js') ||
        html.includes('vue/dist') ||
        html.includes('__vue')) {
      frameworks.push({
        name: 'Vue.js',
        confidence: this.calculateFrameworkConfidence(html, ['vue']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['vue', 'v-', 'data-v-'])
      });
    }

    // Angular detection
    if (doc.querySelector('[ng-]') ||
        doc.querySelector('app-root') ||
        html.includes('angular') ||
        html.includes('@angular')) {
      frameworks.push({
        name: 'Angular',
        confidence: this.calculateFrameworkConfidence(html, ['angular', '@angular']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['angular', 'ng-', 'app-root'])
      });
    }

    // jQuery detection
    if (html.includes('jquery') || html.includes('jquery.min.js')) {
      frameworks.push({
        name: 'jQuery',
        confidence: this.calculateFrameworkConfidence(html, ['jquery']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['jquery'])
      });
    }

    // Next.js detection
    if (html.includes('next') || html.includes('_next') || doc.querySelector('[id="__next"]')) {
      frameworks.push({
        name: 'Next.js',
        confidence: this.calculateFrameworkConfidence(html, ['next', '_next']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['next', '_next', '__next'])
      });
    }

    // Nuxt.js detection
    if (html.includes('nuxt') || doc.querySelector('[id="__nuxt"]')) {
      frameworks.push({
        name: 'Nuxt.js',
        confidence: this.calculateFrameworkConfidence(html, ['nuxt']),
        detectionMethod: 'local-html-parse',
        indicators: this.findFrameworkIndicators(html, ['nuxt', '__nuxt'])
      });
    }

    return frameworks;
  }

  findFrameworkIndicators(html, keywords) {
    const indicators = [];
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = html.match(regex);
      if (matches) {
        indicators.push(`${keyword}: ${matches.length} occurrences`);
      }
    });
    return indicators;
  }

  calculateFrameworkConfidence(html, indicators) {
    let score = 0;
    indicators.forEach(indicator => {
      const occurrences = (html.match(new RegExp(indicator, 'gi')) || []).length;
      score += Math.min(occurrences * 0.1, 0.5);
    });
    return Math.min(score, 1.0);
  }

  identifyThirdPartyServices(doc) {
    const services = [];
    const scripts = doc.querySelectorAll('script[src]');
    const links = doc.querySelectorAll('link[href]');
    const images = doc.querySelectorAll('img[src]');

    const servicePatterns = [
      // Analytics
      { name: 'Google Analytics', patterns: ['google-analytics.com', 'googletagmanager.com', 'gtag', 'analytics.js'], category: 'Analytics' },
      { name: 'Adobe Analytics', patterns: ['omtrdc.net', 'adobe.com/analytics', 'metrics.adobe.com'], category: 'Analytics' },
      { name: 'Hotjar', patterns: ['hotjar.com', 'hotjar.io'], category: 'Analytics' },
      { name: 'Mixpanel', patterns: ['mixpanel.com', 'cdn.mxpnl.com'], category: 'Analytics' },

      // Advertising
      { name: 'Google Ads', patterns: ['googleadservices.com', 'googlesyndication.com', 'doubleclick.net'], category: 'Advertising' },
      { name: 'Facebook Pixel', patterns: ['facebook.net', 'connect.facebook.net'], category: 'Advertising' },

      // CDNs
      { name: 'Cloudflare', patterns: ['cdnjs.cloudflare.com'], category: 'CDN' },
      { name: 'JSDelivr', patterns: ['cdn.jsdelivr.net'], category: 'CDN' },
      { name: 'Google Fonts', patterns: ['fonts.googleapis.com', 'fonts.gstatic.com'], category: 'CDN' }
    ];

    // Check all elements
    [...scripts, ...links, ...images].forEach(element => {
      const url = element.src || element.href || '';
      servicePatterns.forEach(service => {
        if (service.patterns.some(pattern => url.includes(pattern))) {
          const existingService = services.find(s => s.name === service.name);
          if (!existingService) {
            services.push({
              name: service.name,
              urls: [url],
              category: service.category,
              detectionMethod: 'local-html-parse'
            });
          } else {
            if (!existingService.urls.includes(url)) {
              existingService.urls.push(url);
            }
          }
        }
      });
    });

    return services;
  }

  extractMetadata(doc) {
    return {
      title: this.extractTitle(doc),
      description: doc.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      keywords: doc.querySelector('meta[name="keywords"]')?.getAttribute('content') || '',

      // Open Graph
      ogTitle: doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || '',
      ogDescription: doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '',
      ogImage: doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',
      ogUrl: doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || '',

      // Twitter Card
      twitterCard: doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || '',
      twitterTitle: doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') || '',

      // Technical
      charset: doc.querySelector('meta[charset]')?.getAttribute('charset') || '',
      viewport: doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '',
      lang: doc.documentElement?.getAttribute('lang') || '',

      // Counts
      scriptCount: doc.querySelectorAll('script').length,
      linkCount: doc.querySelectorAll('link').length,
      imageCount: doc.querySelectorAll('img').length,

      // Additional
      canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      robots: doc.querySelector('meta[name="robots"]')?.getAttribute('content') || ''
    };
  }

  // Utility methods
  resolveURL(url, baseUrl) {
    if (!url) return null;
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return null;
    }
  }

  getImageType(url) {
    const ext = url.split('.').pop()?.toLowerCase();
    const typeMap = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      svg: 'image/svg+xml',
      webp: 'image/webp'
    };
    return typeMap[ext] || 'image/unknown';
  }

  parseSrcset(srcset, baseUrl) {
    return srcset.split(',')
      .map(src => src.trim().split(' ')[0])
      .filter(url => url)
      .map(url => this.resolveURL(url, baseUrl))
      .filter(url => url);
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LocalHTMLAnalyzer;
} else if (typeof window !== 'undefined') {
  window.LocalHTMLAnalyzer = LocalHTMLAnalyzer;
}