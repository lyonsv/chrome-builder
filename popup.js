// Popup script for Website Migration Analyzer

class PopupController {
  constructor() {
    this.currentTab = null;
    this.analysisData = null;
    this.isAnalyzing = false;

    this.initializeElements();
    this.setupEventListeners();
    this.loadCurrentTab();
  }

  initializeElements() {
    // Status elements
    this.statusIndicator = document.getElementById('statusIndicator');
    this.statusText = document.getElementById('statusText');

    // URL display
    this.urlText = document.getElementById('urlText');

    // Options
    this.includeAssets = document.getElementById('includeAssets');
    this.captureNetwork = document.getElementById('captureNetwork');
    this.reloadPage = document.getElementById('reloadPage');
    this.triggerNavigation = document.getElementById('triggerNavigation');
    this.takeScreenshot = document.getElementById('takeScreenshot');
    this.auditServices = document.getElementById('auditServices');
    this.detectFramework = document.getElementById('detectFramework');

    // Buttons
    this.startAnalysisBtn = document.getElementById('startAnalysis');
    this.downloadPackageBtn = document.getElementById('downloadPackage');
    this.startAnalysisText = document.getElementById('startAnalysisText');
    this.startAnalysisSpinner = document.getElementById('startAnalysisSpinner');
    this.testMinimalBtn = document.getElementById('testMinimal');
    this.debugStatusBtn = document.getElementById('debugStatus');
    this.showRequestsBtn = document.getElementById('showRequests');

    // Results
    this.resultsSection = document.getElementById('resultsSection');
    this.assetsCount = document.getElementById('assetsCount');
    this.networkCount = document.getElementById('networkCount');
    this.frameworksCount = document.getElementById('frameworksCount');
    this.servicesCount = document.getElementById('servicesCount');

    // Details
    this.frameworkDetails = document.getElementById('frameworkDetails');
    this.frameworksList = document.getElementById('frameworksList');
    this.serviceDetails = document.getElementById('serviceDetails');
    this.servicesList = document.getElementById('servicesList');

    // Progress
    this.progressSection = document.getElementById('progressSection');
    this.progressFill = document.getElementById('progressFill');
    this.progressText = document.getElementById('progressText');
  }

  setupEventListeners() {
    this.startAnalysisBtn.addEventListener('click', () => this.startAnalysis());
    this.downloadPackageBtn.addEventListener('click', () => this.downloadPackage());

    // Add minimal test button
    document.getElementById('testMinimal').addEventListener('click', () => this.testMinimal());
    document.getElementById('debugStatus').addEventListener('click', () => this.debugStatus());
    document.getElementById('showRequests').addEventListener('click', () => this.showAllRequests());

    // Help link
    document.getElementById('helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.showHelp();
    });
  }

  async loadCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];

      if (this.currentTab) {
        this.urlText.textContent = this.currentTab.url;
        this.updateStatus('ready', 'Ready to analyze');
      } else {
        this.updateStatus('error', 'No active tab found');
      }
    } catch (error) {
      console.error('Error loading current tab:', error);
      this.updateStatus('error', 'Failed to load tab information');
    }
  }

  updateStatus(type, message) {
    this.statusIndicator.className = `status-indicator ${type}`;
    this.statusText.textContent = message;
  }

  async startAnalysis() {
    if (this.isAnalyzing || !this.currentTab) return;

    this.isAnalyzing = true;
    this.updateUI(true);

    try {
      // Get analysis options
      const options = {
        includeAssets: this.includeAssets.checked,
        captureNetwork: this.captureNetwork.checked,
        reloadPage: this.reloadPage.checked,
        triggerNavigation: this.triggerNavigation.checked,
        takeScreenshot: this.takeScreenshot.checked,
        auditServices: this.auditServices.checked,
        detectFramework: this.detectFramework.checked
      };

      // Start analysis
      this.updateStatus('analyzing', 'Starting analysis...');
      this.showProgress(true);
      this.updateProgress(10, 'Initializing analysis...');

      // Step 1: Start background analysis with current tab ID
      console.log('Starting analysis for tab:', this.currentTab.id);
      await this.sendMessage('START_ANALYSIS', { ...options, tabId: this.currentTab.id });
      this.updateProgress(20, 'Network monitoring initialized...');

      // Step 1.5: Reload page if requested (for SSR sites to capture initial requests)
      if (options.reloadPage) {
        console.log('Reloading page to capture initial network requests...');
        this.updateProgress(25, 'Reloading page to capture network requests...');

        await new Promise((resolve) => {
          // Set up a listener for the reload completion
          const reloadListener = (tabId, changeInfo) => {
            if (tabId === this.currentTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(reloadListener);
              console.log('Page reload completed');
              resolve();
            }
          };

          chrome.tabs.onUpdated.addListener(reloadListener);

          // Reload the page
          chrome.tabs.reload(this.currentTab.id);

          // Fallback timeout in case reload doesn't complete
          setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(reloadListener);
            console.log('Page reload timeout, continuing...');
            resolve();
          }, 10000); // 10 second timeout
        });

        // Give a moment for network requests to start and monitor progress
        this.updateProgress(30, 'Waiting for network requests...');
        await this.waitForNetworkRequests(3000); // Wait up to 3 seconds, showing progress
      }

      this.updateProgress(35, 'Analyzing website structure...');

      // Step 2: Analyze website content
      console.log('Starting website content analysis');
      const websiteData = await this.analyzeWebsiteContent();
      console.log('Website analysis complete:', websiteData);
      this.updateProgress(40, 'Discovering assets...');

      // Step 3: Capture network data
      let networkData = [];
      if (options.captureNetwork) {
        networkData = await this.getNetworkData();
        this.updateProgress(60, 'Capturing network requests...');
      }

      // Step 4: Take screenshot
      let screenshot = null;
      if (options.takeScreenshot) {
        this.updateProgress(70, 'Taking screenshot...');
        screenshot = await this.captureScreenshot();
        this.updateProgress(80, 'Screenshot captured...');
      }

      // Step 5: Compile results
      this.analysisData = {
        ...websiteData,
        networkRequests: networkData,
        screenshot: screenshot,
        options: options,
        timestamp: new Date().toISOString()
      };

      this.updateProgress(100, 'Analysis complete!');

      // Store analysis data with tab ID
      console.log('Storing analysis data:', this.analysisData);
      await this.sendMessage('STORE_ANALYSIS', {
        tabId: this.currentTab.id,
        ...this.analysisData
      });

      // Update UI with results
      this.displayResults();
      this.updateStatus('ready', 'Analysis completed successfully');

    } catch (error) {
      console.error('Analysis failed:', error);
      this.updateStatus('error', `Analysis failed: ${error.message}`);
    } finally {
      this.isAnalyzing = false;
      this.updateUI(false);
      this.showProgress(false);
    }
  }

  async analyzeWebsiteContent() {
    try {
      // First, ensure content script is injected
      console.log('Attempting to inject content script...');
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        files: ['content.js']
      });

      // Wait a moment for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Now try to send message
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(this.currentTab.id, { action: 'ANALYZE_WEBSITE' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Content script communication failed:', chrome.runtime.lastError.message);
            // Try fallback analysis without content script
            this.performFallbackAnalysis().then(resolve).catch(reject);
          } else if (response && response.success) {
            console.log('Content script analysis successful');
            resolve(response.data);
          } else {
            console.warn('Content script analysis failed, trying fallback');
            this.performFallbackAnalysis().then(resolve).catch(reject);
          }
        });
      });
    } catch (error) {
      console.error('Script injection failed:', error.message);
      // Try fallback analysis
      return this.performFallbackAnalysis();
    }
  }

  async performFallbackAnalysis() {
    console.log('Performing fallback analysis using DOM inspection approach');

    try {
      // Use DOM inspection instead of HTML fetching - this bypasses quota issues
      const domAnalysis = await this.performDOMInspectionAnalysis();
      console.log('DOM inspection analysis successful');
      return domAnalysis;

    } catch (error) {
      console.warn('DOM inspection failed:', error.message);
      console.log('Using network-only analysis with known patterns');

      // Final fallback: network-only with known site patterns
      return {
        url: this.currentTab.url,
        title: this.currentTab.title,
        assets: {
          html: [{ url: this.currentTab.url, type: 'text/html', note: 'DOM inspection failed' }],
          css: [], js: [], images: [], fonts: [], other: []
        },
        frameworks: [],
        thirdPartyServices: this.detectServicesForKnownSites(new URL(this.currentTab.url).hostname.toLowerCase()),
        metadata: { title: this.currentTab.title, note: 'Network analysis only' },
        analysisMode: 'network-only-final',
        cspRestricted: true,
        fallbackReason: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async performDOMInspectionAnalysis() {
    console.log('Starting DOM inspection analysis - no HTML fetching');

    // Use chrome.scripting to run multiple small functions that gather specific data
    // This avoids loading large HTML and bypasses quota issues

    const results = await Promise.all([
      this.inspectAssets(),
      this.inspectFrameworks(),
      this.inspectServices(),
      this.inspectMetadata()
    ]);

    const [assets, frameworks, services, metadata] = results;

    return {
      url: this.currentTab.url,
      title: this.currentTab.title,
      assets: assets,
      frameworks: frameworks,
      thirdPartyServices: services,
      metadata: metadata,
      analysisMode: 'dom-inspection',
      cspRestricted: true,
      fallbackReason: 'quota-avoidance',
      timestamp: new Date().toISOString()
    };
  }

  async inspectAssets() {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => {
          // This function runs in page context and extracts asset information
          const assets = { html: [], css: [], js: [], images: [], fonts: [], other: [] };

          // Add main HTML
          assets.html.push({
            url: window.location.href,
            type: 'text/html',
            source: 'main-document'
          });

          // CSS files
          document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"]').forEach(link => {
            if (link.href) {
              assets.css.push({
                url: link.href,
                type: 'text/css',
                media: link.media || 'all',
                source: 'link-tag'
              });
            }
          });

          // Inline styles count
          const inlineStyles = document.querySelectorAll('style').length;
          if (inlineStyles > 0) {
            assets.css.push({
              url: `${window.location.href}#inline-styles`,
              type: 'text/css',
              count: inlineStyles,
              inline: true,
              source: 'inline-style'
            });
          }

          // JavaScript files
          document.querySelectorAll('script[src]').forEach(script => {
            if (script.src) {
              assets.js.push({
                url: script.src,
                type: script.type || 'text/javascript',
                async: script.async,
                defer: script.defer,
                source: 'script-tag'
              });
            }
          });

          // Inline scripts count
          const inlineScripts = document.querySelectorAll('script:not([src])').length;
          if (inlineScripts > 0) {
            assets.js.push({
              url: `${window.location.href}#inline-scripts`,
              type: 'text/javascript',
              count: inlineScripts,
              inline: true,
              source: 'inline-script'
            });
          }

          // Images
          document.querySelectorAll('img[src]').forEach(img => {
            if (img.src) {
              assets.images.push({
                url: img.src,
                alt: img.alt,
                width: img.width,
                height: img.height,
                source: 'img-tag'
              });
            }
          });

          // Fonts
          document.querySelectorAll('link[href*="fonts"], link[href*="font"]').forEach(link => {
            if (link.href) {
              assets.fonts.push({
                url: link.href,
                type: 'font',
                source: 'font-link'
              });
            }
          });

          // Other resources
          const favicon = document.querySelector('link[rel*="icon"]');
          if (favicon && favicon.href) {
            assets.other.push({
              url: favicon.href,
              type: 'favicon',
              source: 'favicon-link'
            });
          }

          return assets;
        }
      });

      return results[0]?.result || { html: [], css: [], js: [], images: [], fonts: [], other: [] };
    } catch (error) {
      console.error('Asset inspection failed:', error);
      return { html: [], css: [], js: [], images: [], fonts: [], other: [] };
    }
  }

  async inspectFrameworks() {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => {
          const frameworks = [];

          // React detection
          if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')) {
            frameworks.push({
              name: 'React',
              version: window.React?.version,
              confidence: 0.9,
              detectionMethod: 'dom-inspection'
            });
          }

          // Vue detection
          if (window.Vue || window.__VUE__ || document.querySelector('[v-]')) {
            frameworks.push({
              name: 'Vue.js',
              version: window.Vue?.version,
              confidence: 0.9,
              detectionMethod: 'dom-inspection'
            });
          }

          // Angular detection
          if (window.ng || window.angular || document.querySelector('[ng-]') || document.querySelector('app-root')) {
            frameworks.push({
              name: 'Angular',
              version: window.ng?.version?.full || window.angular?.version?.full,
              confidence: 0.9,
              detectionMethod: 'dom-inspection'
            });
          }

          // jQuery detection
          if (window.jQuery || window.$) {
            frameworks.push({
              name: 'jQuery',
              version: window.jQuery?.fn?.jquery,
              confidence: 0.9,
              detectionMethod: 'dom-inspection'
            });
          }

          // Next.js detection
          if (window.__NEXT_DATA__ || document.querySelector('#__next')) {
            frameworks.push({
              name: 'Next.js',
              confidence: 0.8,
              detectionMethod: 'dom-inspection'
            });
          }

          // Module Federation detection
          if (window.__webpack_require__ || document.querySelector('script[src*="remoteEntry"]')) {
            frameworks.push({
              name: 'Module Federation',
              type: 'architecture',
              confidence: 0.9,
              detectionMethod: 'dom-inspection'
            });
          }

          // Detect component experience registry (observable: global object with 10+ component keys)
          if (window.experiences && typeof window.experiences === 'object' && Object.keys(window.experiences).length > 10) {
            const services = new Set();
            Object.values(window.experiences).forEach(exp => {
              if (exp.metadata && typeof exp.metadata === 'object') {
                Object.keys(exp.metadata).forEach(service => {
                  if (service !== 'true' && service !== 'false') {
                    services.add(service);
                  }
                });
              }
            });

            frameworks.push({
              name: 'Component-based Architecture',
              type: 'architecture',
              confidence: 0.8,
              detectionMethod: 'dom-inspection',
              details: {
                componentCount: Object.keys(window.experiences).length,
                services: Array.from(services)
              }
            });
          }

          return frameworks;
        }
      });

      return results[0]?.result || [];
    } catch (error) {
      console.error('Framework inspection failed:', error);
      return [];
    }
  }

  async inspectServices() {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => {
          const services = [];
          const hostname = window.location.hostname.toLowerCase();

          // Check for common service patterns in scripts and links
          const servicePatterns = [
            { name: 'Google Analytics', patterns: ['google-analytics', 'googletagmanager', 'gtag'] },
            { name: 'Google Ads', patterns: ['googleadservices', 'googlesyndication'] },
            { name: 'Facebook Pixel', patterns: ['facebook.net', 'connect.facebook.net'] },
            { name: 'Adobe Analytics', patterns: ['omtrdc.net', 'adobe.com'] },
            { name: 'Hotjar', patterns: ['hotjar.com'] },
            { name: 'Intercom', patterns: ['intercom.io'] },
            { name: 'Google Fonts', patterns: ['fonts.googleapis.com', 'fonts.gstatic.com'] },
            { name: 'Cloudflare', patterns: ['cdnjs.cloudflare.com'] },
            { name: 'JSDelivr CDN', patterns: ['cdn.jsdelivr.net'] }
          ];

          // Check all scripts and links
          document.querySelectorAll('script[src], link[href]').forEach(element => {
            const url = element.src || element.href;
            if (url) {
              servicePatterns.forEach(service => {
                if (service.patterns.some(pattern => url.includes(pattern))) {
                  const existing = services.find(s => s.name === service.name);
                  if (!existing) {
                    services.push({
                      name: service.name,
                      urls: [url],
                      detectionMethod: 'dom-inspection'
                    });
                  } else {
                    if (!existing.urls.includes(url)) {
                      existing.urls.push(url);
                    }
                  }
                }
              });
            }
          });

          return services;
        }
      });

      const domServices = results[0]?.result || [];

      // Add known site patterns
      const knownServices = this.detectServicesForKnownSites(new URL(this.currentTab.url).hostname.toLowerCase());

      return [...domServices, ...knownServices];
    } catch (error) {
      console.error('Service inspection failed:', error);
      return this.detectServicesForKnownSites(new URL(this.currentTab.url).hostname.toLowerCase());
    }
  }

  async inspectMetadata() {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => {
          return {
            title: document.title,
            description: document.querySelector('meta[name="description"]')?.content || '',
            keywords: document.querySelector('meta[name="keywords"]')?.content || '',
            ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
            ogDescription: document.querySelector('meta[property="og:description"]')?.content || '',
            charset: document.charset,
            viewport: document.querySelector('meta[name="viewport"]')?.content || '',
            lang: document.documentElement.lang || '',
            canonical: document.querySelector('link[rel="canonical"]')?.href || '',
            // Counts
            scriptCount: document.querySelectorAll('script').length,
            linkCount: document.querySelectorAll('link').length,
            imageCount: document.querySelectorAll('img').length
          };
        }
      });

      return results[0]?.result || { title: this.currentTab.title };
    } catch (error) {
      console.error('Metadata inspection failed:', error);
      return { title: this.currentTab.title };
    }
  }

  async getPageInfoWithoutContentScript() {
    // Use chrome.scripting to execute minimal code that bypasses CSP
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => {
          // This runs in the page context and should work even with CSP
          return {
            title: document.title,
            url: window.location.href,
            userAgent: navigator.userAgent,
            hasReact: !!(window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__),
            hasVue: !!(window.Vue || window.__VUE__),
            hasAngular: !!(window.ng || window.angular),
            hasJQuery: !!(window.jQuery || window.$),
            scriptsCount: document.querySelectorAll('script').length,
            linksCount: document.querySelectorAll('link').length,
            imagesCount: document.querySelectorAll('img').length
          };
        }
      });

      const pageData = results[0]?.result || {};

      // Detect frameworks based on available data
      const frameworks = [];
      if (pageData.hasReact) frameworks.push({ name: 'React', confidence: 0.8 });
      if (pageData.hasVue) frameworks.push({ name: 'Vue.js', confidence: 0.8 });
      if (pageData.hasAngular) frameworks.push({ name: 'Angular', confidence: 0.8 });
      if (pageData.hasJQuery) frameworks.push({ name: 'jQuery', confidence: 0.8 });

      // Enhanced service detection for CSP-restricted sites
      const detectedServices = [];
      const url = pageData.url || '';
      const hostname = new URL(url).hostname.toLowerCase();

      // Site-specific service detection based on known patterns
      const siteServices = this.detectServicesForKnownSites(hostname);
      detectedServices.push(...siteServices);

      // Common service patterns that might be in URLs or be detectable without full DOM access
      const servicePatterns = [
        { name: 'Google Analytics', pattern: 'google-analytics|googletagmanager|gtag' },
        { name: 'Google Ads', pattern: 'googleadservices|googlesyndication' },
        { name: 'Facebook Pixel', pattern: 'facebook.com/tr|connect.facebook.net' },
        { name: 'Adobe Experience', pattern: 'adobe.com|omtrdc.net' },
        { name: 'CloudFlare', pattern: 'cloudflare' },
        { name: 'AWS', pattern: 'amazonaws.com' }
      ];

      // This is limited without full DOM access, but better than nothing
      servicePatterns.forEach(service => {
        if (new RegExp(service.pattern, 'i').test(url)) {
          detectedServices.push({
            name: service.name,
            urls: [url],
            category: 'Detected from URL',
            confidence: 'low'
          });
        }
      });

      return {
        detectedServices,
        frameworks,
        metadata: {
          title: pageData.title || this.currentTab.title,
          userAgent: pageData.userAgent,
          resourceCounts: {
            scripts: pageData.scriptsCount || 0,
            links: pageData.linksCount || 0,
            images: pageData.imagesCount || 0
          }
        }
      };

    } catch (error) {
      console.error('Fallback analysis failed:', error);
      return {
        detectedServices: [],
        frameworks: [],
        metadata: {
          title: this.currentTab.title,
          note: 'Limited analysis due to security restrictions'
        }
      };
    }
  }

  detectServicesForKnownSites(hostname) {
    const knownSites = {
      'example-ecommerce.com': [
        { name: 'Adobe Analytics', category: 'Analytics', confidence: 'high' },
        { name: 'Google Analytics', category: 'Analytics', confidence: 'high' },
        { name: 'Google Ads', category: 'Advertising', confidence: 'high' },
        { name: 'Facebook Pixel', category: 'Advertising', confidence: 'medium' },
        { name: 'Optimizely', category: 'A/B Testing', confidence: 'medium' },
        { name: 'Salesforce DMP', category: 'Marketing', confidence: 'medium' }
      ],
      'github.com': [
        { name: 'Google Analytics', category: 'Analytics', confidence: 'high' },
        { name: 'Segment', category: 'Analytics', confidence: 'high' },
        { name: 'New Relic', category: 'Performance', confidence: 'high' }
      ],
      'amazon.com': [
        { name: 'Amazon Analytics', category: 'Analytics', confidence: 'high' },
        { name: 'Google Analytics', category: 'Analytics', confidence: 'medium' },
        { name: 'Adobe Target', category: 'Personalization', confidence: 'high' }
      ],
      'netflix.com': [
        { name: 'Netflix Analytics', category: 'Analytics', confidence: 'high' },
        { name: 'Google Analytics', category: 'Analytics', confidence: 'medium' },
        { name: 'Adobe Analytics', category: 'Analytics', confidence: 'medium' }
      ]
    };

    const services = knownSites[hostname] || [];
    return services.map(service => ({
      name: service.name,
      urls: [`https://${hostname}`],
      category: service.category,
      confidence: service.confidence,
      source: 'known-site-pattern'
    }));
  }

  async getNetworkData() {
    const response = await this.sendMessage('GET_NETWORK_DATA');
    return response.data || [];
  }

  async captureScreenshot() {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(this.currentTab.windowId, {
        format: 'png',
        quality: 90
      });
      return {
        dataUrl: dataUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Screenshot failed:', error);
      return null;
    }
  }

  displayResults() {
    if (!this.analysisData) return;

    const { assets, frameworks, thirdPartyServices, networkRequests, cspRestricted, analysisMode, moduleFederationData } = this.analysisData;

    // Show analysis mode status
    if (cspRestricted || analysisMode || this.analysisData.quotaLimited) {
      const modeText = {
        'local-html-fetch': 'local HTML analysis',
        'local-html-truncated': 'partial HTML analysis',
        'header-only': 'header-only analysis',
        'api-only': 'API-only mode',
        'network-only': 'network-only mode',
        'network-only-quota': 'network-only (large site)'
      };

      const statusText = modeText[analysisMode] || analysisMode;
      this.updateStatus('ready', `Analysis completed (${statusText})`);

      if (this.analysisData.quotaLimited) {
        console.log(`Site too large for HTML analysis - network analysis only`);
      } else if (this.analysisData.truncated) {
        console.log(`Large HTML detected - analysis performed on partial content`);
      } else if (cspRestricted) {
        console.log(`CSP restrictions detected - used ${analysisMode} method`);
      }
    }

    // Calculate totals with null checking
    const totalAssets = assets ? Object.values(assets).reduce((sum, assetArray) => sum + (assetArray?.length || 0), 0) : 0;
    const totalNetworkRequests = networkRequests?.length || 0;
    const totalFrameworks = frameworks?.length || 0;
    const totalServices = thirdPartyServices?.length || 0;

    // Update counts
    this.assetsCount.textContent = totalAssets.toLocaleString();
    this.networkCount.textContent = totalNetworkRequests.toLocaleString();
    this.frameworksCount.textContent = totalFrameworks;
    this.servicesCount.textContent = totalServices;

    // Show frameworks
    if (totalFrameworks > 0) {
      this.frameworkDetails.style.display = 'block';
      this.frameworksList.innerHTML = '';

      frameworks.forEach(framework => {
        const li = document.createElement('li');
        let versionInfo = framework.version || 'Unknown version';

        // Special handling for architecture frameworks
        if (framework.type === 'architecture') {
          if (framework.name === 'Component-based Architecture' && framework.details) {
            versionInfo = `${framework.details.componentCount} components`;
            if (framework.details.services.length > 0) {
              versionInfo += ` (${framework.details.services.join(', ')})`;
            }
          } else if (framework.name === 'Module Federation') {
            versionInfo = `Confidence: ${Math.round(framework.confidence * 100)}%`;
          }
        }

        li.innerHTML = `
          <div class="framework-item">
            <span class="framework-name">${framework.name}</span>
            <span class="framework-version">${versionInfo}</span>
          </div>
        `;
        this.frameworksList.appendChild(li);
      });
    }

    // Add Module Federation details if available
    if (moduleFederationData && (moduleFederationData.hasModuleFederation || moduleFederationData.hasComponentData)) {
      const mfDetails = document.createElement('div');
      mfDetails.className = 'module-federation-details';
      mfDetails.innerHTML = `
        <h4>Module Federation & Component Analysis</h4>
        <div class="mf-info">
          ${moduleFederationData.hasModuleFederation ? `
            <p>✓ Module Federation Detected</p>
            <p>Remote Entries: ${moduleFederationData.remoteEntries.length}</p>
          ` : ''}
          ${moduleFederationData.hasComponentData ? `
            <p>✓ Component Data System Detected</p>
            <p>Window Data Objects: ${Object.keys(moduleFederationData.windowDataObjects).length}</p>
            <p>Federated Components: ${moduleFederationData.federatedComponents.length}</p>
            <p>Microfrontend Services: ${moduleFederationData.microfrontendServices.length}</p>
            ${moduleFederationData.componentDataStructure ? `
              <p>Architecture Patterns: ${moduleFederationData.componentDataStructure.architecturePatterns.join(', ') || 'Standard'}</p>
            ` : ''}
          ` : ''}
        </div>
      `;

      // Insert after frameworks or at the beginning of results
      const insertPoint = this.frameworkDetails.style.display === 'block'
        ? this.frameworkDetails.nextSibling
        : this.frameworkDetails;
      this.frameworkDetails.parentNode.insertBefore(mfDetails, insertPoint);
    }

    // Show services
    if (totalServices > 0) {
      this.serviceDetails.style.display = 'block';
      this.servicesList.innerHTML = '';

      thirdPartyServices.forEach(service => {
        const li = document.createElement('li');
        li.innerHTML = `
          <div class="service-item">
            <span class="service-name">${service.name}</span>
            <span class="service-category">${service.category}</span>
          </div>
        `;
        this.servicesList.appendChild(li);
      });
    }

    // Show results section
    this.resultsSection.style.display = 'block';
    this.downloadPackageBtn.disabled = false;
  }

  async downloadPackage() {
    if (!this.analysisData) return;

    try {
      this.updateStatus('analyzing', 'Preparing download...');
      await this.sendMessage('DOWNLOAD_PACKAGE', {
        tabId: this.currentTab.id,
        ...this.analysisData
      });
      this.updateStatus('ready', 'Package downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      this.updateStatus('error', `Download failed: ${error.message}`);
    }
  }

  updateUI(analyzing) {
    // Toggle button states
    this.startAnalysisBtn.disabled = analyzing;
    this.downloadPackageBtn.disabled = analyzing || !this.analysisData;

    // Toggle spinner
    if (analyzing) {
      this.startAnalysisText.textContent = 'Analyzing...';
      this.startAnalysisSpinner.style.display = 'inline-block';
    } else {
      this.startAnalysisText.textContent = 'Start Analysis';
      this.startAnalysisSpinner.style.display = 'none';
    }

    // Disable options during analysis
    const optionInputs = document.querySelectorAll('.options input');
    optionInputs.forEach(input => {
      input.disabled = analyzing;
    });
  }

  showProgress(show) {
    this.progressSection.style.display = show ? 'block' : 'none';
    if (!show) {
      this.progressFill.style.width = '0%';
    }
  }

  updateProgress(percent, message) {
    this.progressFill.style.width = `${percent}%`;
    this.progressText.textContent = message;
  }

  async sendMessage(action, data = null) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Sending message: ${action}`, data);
        chrome.runtime.sendMessage({ action, data }, (response) => {
          if (chrome.runtime.lastError) {
            console.error(`Runtime error for ${action}:`, chrome.runtime.lastError.message);
            reject(new Error(`Runtime error: ${chrome.runtime.lastError.message}`));
          } else if (!response) {
            console.error(`No response received for ${action}`);
            reject(new Error('No response received from background script'));
          } else if (response.success) {
            console.log(`Success response for ${action}:`, response);
            resolve(response);
          } else {
            console.error(`Error response for ${action}:`, response.error);
            reject(new Error(response.error || 'Message failed'));
          }
        });
      } catch (error) {
        console.error(`Exception sending message ${action}:`, error);
        reject(error);
      }
    });
  }

  async waitForNetworkRequests(maxWaitTime = 3000) {
    const startTime = Date.now();
    const checkInterval = 250; // Check every 250ms
    let lastCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const response = await this.sendMessage('GET_NETWORK_DATA', { tabId: this.currentTab.id });
        const currentCount = response.data ? response.data.length : 0;

        if (currentCount !== lastCount) {
          console.log(`Network requests captured: ${currentCount}`);
          this.updateProgress(30 + (currentCount * 2), `Captured ${currentCount} network requests...`);
          lastCount = currentCount;
        }

        // If we have requests and they seem to have stabilized, continue
        if (currentCount > 0 && currentCount === lastCount) {
          const stableTime = 500; // Wait 500ms of stability
          await new Promise(resolve => setTimeout(resolve, stableTime));
          break;
        }

      } catch (error) {
        console.log('Error checking network requests:', error);
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    // Final check
    try {
      const response = await this.sendMessage('GET_NETWORK_DATA', { tabId: this.currentTab.id });
      const finalCount = response.data ? response.data.length : 0;
      console.log(`Final network request count: ${finalCount}`);
      this.updateProgress(35, finalCount > 0 ? `Captured ${finalCount} requests` : 'No network requests detected');
    } catch (error) {
      console.log('Error in final network check:', error);
    }
  }

  async debugStatus() {
    console.log('Running debug status check...');
    try {
      const response = await this.sendMessage('DEBUG_STATUS', { tabId: this.currentTab.id });
      console.log('Debug Status Response:', response);
      const currentTabId = this.currentTab ? this.currentTab.id : 'unknown';
      const hasRequestsForCurrentTab = response.data.allTabsWithRequests.includes(currentTabId);

      alert(`Debug Status:\n\nCurrent Tab ID: ${currentTabId}\nService Worker: ${response.data.serviceWorkerRunning}\nwebRequest API: ${response.data.webRequestAPIAvailable}\nActive Analysis Tabs: ${response.data.activeAnalysisTabs.join(', ')}\nTotal Requests: ${response.data.totalRequestsAcrossAllTabs}\nTabs with Requests: ${response.data.allTabsWithRequests.join(', ')}\n\nCURRENT TAB HAS REQUESTS: ${hasRequestsForCurrentTab}\nCURRENT TAB REQUEST COUNT: ${response.data.currentTabRequestCount}\n\nSample URLs from current tab:\n${response.data.sampleRequestsFromCurrentTab.map(r => `${r.method} ${r.url}`).join('\n')}`);
    } catch (error) {
      console.error('Debug status failed:', error);
      alert(`Debug Status Failed: ${error.message}`);
    }
  }

  async showAllRequests() {
    console.log('Showing all network requests...');
    try {
      const response = await this.sendMessage('GET_NETWORK_DATA', { tabId: this.currentTab.id });
      console.log('All Requests Response:', response);

      if (response.success && response.data && response.data.length > 0) {
        const requests = response.data;
        const graphqlRequests = requests.filter(r => r.isGraphQL);
        const postRequests = requests.filter(r => r.method === 'POST');

        let output = `Network Requests (${requests.length} total):\n\n`;
        output += `GraphQL Requests: ${graphqlRequests.length}\n`;
        output += `POST Requests: ${postRequests.length}\n\n`;

        output += "Recent Requests:\n";
        requests.slice(-10).forEach((req, i) => {
          output += `${i+1}. ${req.method} ${req.url}\n`;
          if (req.isGraphQL) output += "   ^^ GraphQL ^^";
        });

        if (graphqlRequests.length > 0) {
          output += "\n\nGraphQL Queries Found:\n";
          graphqlRequests.slice(0, 3).forEach((req, i) => {
            output += `${i+1}. ${req.url}\n`;
            if (req.graphQLQuery && req.graphQLQuery.query) {
              output += `   Query: ${req.graphQLQuery.query.substring(0, 100)}...\n`;
            }
          });
        }

        console.log('All requests:', requests);
        alert(output);
      } else {
        alert('No requests found for current tab');
      }
    } catch (error) {
      console.error('Show requests failed:', error);
      alert(`Show Requests Failed: ${error.message}`);
    }
  }

  async testMinimal() {
    console.log('Running minimal test to isolate quota issue');

    this.updateStatus('analyzing', 'Running minimal test...');

    try {
      // Test 1: Basic tab info (should always work)
      console.log('Test 1: Basic tab access');
      const basicInfo = {
        url: this.currentTab.url,
        title: this.currentTab.title,
        id: this.currentTab.id
      };
      console.log('✓ Basic tab info:', basicInfo);

      // Test 2: Very simple DOM inspection
      console.log('Test 2: Simple DOM inspection');
      const domTest = await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        func: () => ({
          title: document.title,
          scriptCount: document.querySelectorAll('script').length,
          url: window.location.href
        })
      });
      console.log('✓ DOM inspection:', domTest[0]?.result);

      // Test 3: Background script communication (this might be where quota error occurs)
      console.log('Test 3: Background script communication');
      const networkTest = await this.sendMessage('GET_NETWORK_DATA');
      console.log('✓ Network data:', networkTest);

      // Test 4: Try to start minimal analysis session
      console.log('Test 4: Start analysis session');
      const analysisTest = await this.sendMessage('START_ANALYSIS', {
        tabId: this.currentTab.id,
        minimal: true
      });
      console.log('✓ Analysis session:', analysisTest);

      // If we get here, show minimal results
      this.analysisData = {
        url: this.currentTab.url,
        title: this.currentTab.title,
        assets: {
          html: [{ url: this.currentTab.url, type: 'text/html' }],
          css: [], js: [], images: [], fonts: [], other: []
        },
        frameworks: [],
        thirdPartyServices: [],
        metadata: { title: this.currentTab.title },
        analysisMode: 'minimal-test',
        timestamp: new Date().toISOString()
      };

      this.displayResults();
      this.updateStatus('ready', 'Minimal test completed');
      console.log('✓ All tests passed - quota error is elsewhere');

    } catch (error) {
      console.error('❌ Minimal test failed:', error);
      this.updateStatus('error', `Minimal test failed: ${error.message}`);

      // Try to identify which test failed
      if (error.message.includes('quota') || error.message.includes('Quota')) {
        console.error('❌ QUOTA ERROR FOUND in minimal test');
        console.error('This suggests the issue is in:', error.stack);
      }
    }
  }

  showHelp() {
    // Open help documentation
    chrome.tabs.create({
      url: 'https://github.com/your-username/migration-analyzer/blob/main/README.md'
    });
  }
}

// Show a dismissable resume notice when the SW detects a resumable checkpoint
function showResumeNotice(checkpoint) {
  const notice = document.createElement('div');
  notice.id = 'resume-notice';
  notice.style.cssText = 'background:#f0f4ff;border:1px solid #99b;padding:6px 10px;font-size:12px;margin-bottom:6px;border-radius:4px;';
  notice.textContent = `Analysis resumed from checkpoint (${checkpoint.stage}).`;
  const dismiss = document.createElement('button');
  dismiss.textContent = '×';
  dismiss.style.cssText = 'margin-left:8px;cursor:pointer;border:none;background:none;font-size:14px;';
  dismiss.onclick = () => notice.remove();
  notice.appendChild(dismiss);
  // Insert at top of body or before the first child of popup container
  document.body.insertBefore(notice, document.body.firstChild);
}

// Chunked transfer progress display — shown while background is reassembling chunks
function updateTransferProgress(received, total) {
  let bar = document.getElementById('transfer-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'transfer-progress';
    bar.style.cssText = 'padding:4px 10px;font-size:12px;color:#555;border-bottom:1px solid #eee;';
    // Insert into existing status area — prepend to body so it's always visible
    document.body.insertBefore(bar, document.body.firstChild);
  }
  bar.textContent = `Transferring data... ${received} / ${total} chunks`;
}

function clearTransferProgress() {
  const bar = document.getElementById('transfer-progress');
  if (bar) bar.remove();
}

function showTransferError(failedChunk, totalChunks) {
  clearTransferProgress();
  let errorDiv = document.getElementById('transfer-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'transfer-error';
    errorDiv.style.cssText = 'padding:8px 10px;background:#fff0f0;border:1px solid #fbb;font-size:12px;border-radius:4px;margin:4px;';
  }
  errorDiv.innerHTML = '';
  const msg = document.createElement('span');
  msg.textContent = `Transfer failed after 3 retries — the page may be too large. (chunk ${failedChunk + 1} of ${totalChunks})`;
  const retryBtn = document.createElement('button');
  retryBtn.textContent = 'Retry Analysis';
  retryBtn.style.cssText = 'margin-left:10px;padding:2px 8px;cursor:pointer;';
  retryBtn.onclick = () => {
    errorDiv.remove();
    // Trigger a fresh analysis — send START_ANALYSIS to background
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.runtime.sendMessage({ action: 'START_ANALYSIS', tabId: tabs[0].id });
      }
    });
  };
  errorDiv.appendChild(msg);
  errorDiv.appendChild(retryBtn);
  document.body.insertBefore(errorDiv, document.body.firstChild);
}

// Handle messages from background service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'ANALYSIS_RESUMED') {
    // Show a brief dismissable notice — append to existing status area
    showResumeNotice(message.checkpoint);
    return;
  }
  if (message.action === 'TRANSFER_PROGRESS') {
    updateTransferProgress(message.received, message.total);
    return;
  }
  if (message.action === 'TRANSFER_COMPLETE') {
    clearTransferProgress();
    return;
  }
  if (message.action === 'TRANSFER_ERROR') {
    showTransferError(message.failedChunk, message.totalChunks);
    return;
  }
});

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});