// fflate 0.8.2 — ZIP creation in service worker context
// importScripts is supported in MV3 extension service workers (not web SWs)
importScripts('/vendor/fflate.min.js');

// Background service worker for Website Migration Analyzer

// Safe base64 for large Uint8Arrays in SW context (no Blob URL, no spread overflow)
function uint8ArrayToBase64(bytes) {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

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

// Phase 6: Extract CSS URLs from network request log
// Three-strategy detection: type field > content-type header > .css URL pattern
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

// Phase 6: Extract CSS URLs from analysisData (DOM-inspection path)
// Filters inline entries, null URLs, and blob: URLs
function extractCssUrlsFromAnalysisData(analysisData) {
  return (analysisData.assets?.css || [])
    .filter(entry => !entry.inline && entry.url && !entry.url.startsWith('blob:'))
    .map(entry => entry.url);
}

// Phase 4: Derive deduplicated event schema from raw dataLayer entries
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

class MigrationAnalyzer {
  constructor() {
    this.networkRequests = new Map(); // Store all requests for all tabs
    this.recentRequests = new Map(); // Rolling buffer of recent requests per tab
    this.analysisData = new Map();
    this.activeAnalysisTabs = new Set(); // Track which tabs are being analyzed
    this.transfers = new Map(); // Map of transferId -> { chunks, totalChunks, received, originalAction, tabId }
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('Migration Analyzer installed:', details.reason);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });

    // Test webRequest API availability
    if (!chrome.webRequest) {
      console.error('webRequest API not available!');
      return;
    }

    console.log('webRequest API available, setting up listeners...');

    // Monitor network requests for all tabs
    try {
      chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
          console.log('webRequest.onBeforeRequest triggered:', details.url, details.tabId);
          this.captureRequest(details);
        },
        { urls: ['<all_urls>'] },
        ['requestBody']
      );
      console.log('onBeforeRequest listener registered successfully');
    } catch (error) {
      console.error('Failed to register onBeforeRequest listener:', error);
    }

    try {
      chrome.webRequest.onCompleted.addListener(
        (details) => {
          console.log('webRequest.onCompleted triggered:', details.url, details.tabId);
          this.captureResponse(details);
        },
        { urls: ['<all_urls>'] },
        ['responseHeaders']
      );
      console.log('onCompleted listener registered successfully');
    } catch (error) {
      console.error('Failed to register onCompleted listener:', error);
    }

    try {
      chrome.webRequest.onErrorOccurred.addListener(
        (details) => {
          console.log('webRequest.onErrorOccurred triggered:', details.url, details.tabId);
          this.captureError(details);
        },
        { urls: ['<all_urls>'] }
      );
      console.log('onErrorOccurred listener registered successfully');
    } catch (error) {
      console.error('Failed to register onErrorOccurred listener:', error);
    }

    console.log('Network monitoring setup complete');
    console.log('Available permissions:', chrome.runtime.getManifest().permissions);

    // Keep-alive alarm listener — firing the alarm resets the SW 30-second idle timer
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name.startsWith('keepalive_')) {
        // Firing the alarm event resets the SW 30-second idle timer — no other action needed
        console.log(`[SW keep-alive] ping — ${alarm.name}`);
      }
    });
  }

  async handleMessage(message, sender, sendResponse) {
    const { action, data } = message;
    const tabId = message.tabId || data?.tabId || sender.tab?.id;

    console.log(`Background script handling action: ${action}`, { tabId, data });

    // Handle chunked transfer protocol — checked before the main switch to intercept
    // chunk messages and reassemble them before dispatching as a normal message.
    if (action === 'TRANSFER_START') {
      const { transferId, totalChunks, originalAction } = message;
      this.transfers.set(transferId, {
        chunks: new Array(totalChunks),
        totalChunks,
        received: 0,
        originalAction,
        tabId
      });
      // Notify popup that transfer is starting
      chrome.runtime.sendMessage({
        action: 'TRANSFER_PROGRESS',
        tabId,
        received: 0,
        total: totalChunks
      }).catch(() => {}); // Popup may not be open
      sendResponse({ ack: true });
      return;
    }

    if (action === 'CHUNK') {
      const { transferId, chunkIndex, totalChunks, chunk } = message;
      const transfer = this.transfers.get(transferId);
      if (!transfer) {
        sendResponse({ ack: false });
        return;
      }
      transfer.chunks[chunkIndex] = chunk;
      transfer.received++;

      // Notify popup of progress
      chrome.runtime.sendMessage({
        action: 'TRANSFER_PROGRESS',
        tabId: transfer.tabId,
        received: transfer.received,
        total: totalChunks
      }).catch(() => {});

      sendResponse({ ack: true });

      if (transfer.received === totalChunks) {
        const fullJson = transfer.chunks.join('');
        const payload = JSON.parse(fullJson);
        const originalAction = transfer.originalAction;
        const transferTabId = transfer.tabId;
        this.transfers.delete(transferId);
        // Dispatch as if it was a direct message with the original action
        this.handleMessage(
          { action: originalAction, tabId: transferTabId, data: payload },
          sender,
          () => {}
        );
        // Notify popup that transfer is done
        chrome.runtime.sendMessage({
          action: 'TRANSFER_COMPLETE',
          tabId: transferTabId
        }).catch(() => {});
      }
      return;
    }

    if (action === 'TRANSFER_FAILED') {
      const { transferId, failedChunk, totalChunks } = message;
      this.transfers.delete(transferId);
      chrome.runtime.sendMessage({
        action: 'TRANSFER_ERROR',
        tabId,
        failedChunk,
        totalChunks
      }).catch(() => {});
      sendResponse({ ack: true });
      return;
    }

    try {
      switch (action) {
        case 'START_ANALYSIS':
          if (!tabId) {
            throw new Error('No valid tab ID provided for START_ANALYSIS');
          }
          console.log(`Starting analysis for tab ${tabId}`);
          await this.startAnalysis(tabId, data);
          console.log(`Analysis started successfully for tab ${tabId}`);
          sendResponse({ success: true });
          break;

        case 'GET_NETWORK_DATA':
          console.log(`Getting network data for tab ${tabId}`);
          const networkData = this.getNetworkData(tabId);
          console.log(`Retrieved ${networkData.length} network requests for tab ${tabId}`);
          sendResponse({ success: true, data: networkData });
          break;

        case 'GET_ANALYSIS': {
          const stored = this.analysisData.get(tabId);
          if (!stored) {
            sendResponse({ success: false, error: 'No analysis stored for tab' });
            break;
          }
          const networkRequests = this.networkRequests.get(tabId) || [];
          sendResponse({
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
          });
          break;
        }

        case 'STORE_ANALYSIS':
          if (!tabId) {
            throw new Error('No valid tab ID provided for STORE_ANALYSIS');
          }
          console.log(`Storing analysis for tab ${tabId}`);
          await this.storeAnalysis(tabId, data);
          console.log(`Analysis stored successfully for tab ${tabId}`);
          sendResponse({ success: true });
          break;

        case 'DOWNLOAD_PACKAGE':
          if (!tabId) {
            throw new Error('No valid tab ID provided for DOWNLOAD_PACKAGE');
          }
          console.log(`Downloading package for tab ${tabId}`);
          await this.downloadAsZip(tabId, data);
          console.log(`Package downloaded successfully for tab ${tabId}`);
          sendResponse({ success: true });
          break;

        case 'FETCH_ASSETS': {
          const assetUrls = data?.urls || [];
          console.log(`Fetching ${assetUrls.length} assets for tab ${tabId}`);
          const assetResult = await this.fetchAssets(assetUrls);
          console.log(`Fetched ${assetResult.successes.length} assets, ${assetResult.failures.length} failed`);
          // Store asset results on the analysis data for use by downloadAsZip
          const existingAnalysis = this.analysisData.get(tabId);
          if (existingAnalysis) {
            existingAnalysis.fetchedAssets = assetResult.successes;
            existingAnalysis.failedAssets = assetResult.failures;
          }
          sendResponse({ success: true, fetched: assetResult.successes.length, failed: assetResult.failures.length });
          break;
        }

        case 'STOP_ANALYSIS':
          console.log(`Stopping analysis for tab ${tabId}`);
          this.stopAnalysis(tabId);
          console.log(`Analysis stopped successfully for tab ${tabId}`);
          sendResponse({ success: true });
          break;

        case 'ELEMENT_SELECTED': {
          // Fields may be top-level (from injected overlay) or nested under data
          const sel = message.selector ?? data?.selector;
          const html = message.outerHtml ?? data?.outerHtml;
          const count = message.childCount ?? data?.childCount;
          await chrome.storage.session.set({
            [`pickerSelection_${tabId}`]: { selector: sel, outerHtml: html, childCount: count, tabId }
          });
          sendResponse({ success: true });
          break;
        }

        case 'PICKER_CANCELLED':
          await chrome.storage.session.remove(`pickerSelection_${tabId}`);
          sendResponse({ success: true });
          break;

        case 'DEBUG_STATUS':
          console.log('Debug status requested for tab:', tabId);
          const currentTabRequests = this.getNetworkData(tabId);
          const debugInfo = {
            serviceWorkerRunning: true,
            webRequestAPIAvailable: !!chrome.webRequest,
            networkRequestsMapSize: this.networkRequests.size,
            recentRequestsMapSize: this.recentRequests.size,
            activeAnalysisTabs: Array.from(this.activeAnalysisTabs),
            permissions: chrome.runtime.getManifest().permissions,
            allTabsWithRequests: Array.from(this.networkRequests.keys()),
            totalRequestsAcrossAllTabs: Array.from(this.networkRequests.values()).reduce((sum, arr) => sum + arr.length, 0),
            currentTabId: tabId,
            currentTabRequestCount: currentTabRequests.length,
            sampleRequestsFromCurrentTab: currentTabRequests.slice(0, 3).map(req => ({ url: req.url, method: req.method })),
            allTabRequestCounts: Object.fromEntries(
              Array.from(this.networkRequests.entries()).map(([tabId, requests]) => [tabId, requests.length])
            )
          };
          console.log('Debug info:', debugInfo);
          sendResponse({ success: true, data: debugInfo });
          break;

        default:
          console.warn(`Unknown action received: ${action}`);
          sendResponse({ success: false, error: `Unknown action: ${action}` });
      }
    } catch (error) {
      console.error(`Background script error for action ${action}:`, error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async startAnalysis(tabId, options = {}) {
    console.log(`Starting analysis for tab ${tabId}`);

    if (!tabId) {
      throw new Error('No valid tab ID provided');
    }

    // Initialize analysis data for this tab
    const analysisData = {
      startTime: Date.now(),
      url: '',
      title: '',
      assets: [],
      networkRequests: [],
      thirdPartyServices: [],
      frameworks: [],
      metadata: {},
      options
    };

    this.analysisData.set(tabId, analysisData);

    // Add to active analysis tabs and include recent requests in analysis
    this.activeAnalysisTabs.add(tabId);
    this.startKeepAlive(tabId);

    // Copy recent requests to analysis requests (include pre-analysis requests)
    const recentRequests = this.recentRequests.get(tabId) || [];
    this.networkRequests.set(tabId, [...recentRequests]);

    console.log(`Including ${recentRequests.length} recent requests in analysis`);

    // Get current tab info
    try {
      const tab = await chrome.tabs.get(tabId);
      analysisData.url = tab.url;
      analysisData.title = tab.title;
    } catch (error) {
      console.error('Failed to get tab info:', error);
      // Continue without tab info
    }

    // Network data is captured via webRequest listeners — no CDP debugger needed

    console.log('Analysis session initialized for tab:', tabId);
    return analysisData;
  }

  stopAnalysis(tabId) {
    console.log(`Stopping analysis for tab ${tabId}`);

    // Remove from active analysis tabs
    this.activeAnalysisTabs.delete(tabId);
    this.stopKeepAlive(tabId);

    // Keep the data but stop monitoring new requests
    console.log('Analysis stopped for tab:', tabId);
  }

  captureRequest(details) {
    const tabId = details.tabId;

    console.log(`[captureRequest] Called for tab ${tabId}, URL: ${details.url}`);
    console.log(`[captureRequest] Method: ${details.method}, Type: ${details.type}`);
    console.log(`[captureRequest] Active analysis tabs:`, Array.from(this.activeAnalysisTabs));
    console.log(`[captureRequest] Current maps sizes - networkRequests: ${this.networkRequests.size}, recentRequests: ${this.recentRequests.size}`);

    // Always capture requests for all tabs (not just active analysis)
    // Initialize network requests arrays if not exists
    if (!this.networkRequests.has(tabId)) {
      console.log(`[captureRequest] Initializing networkRequests for tab ${tabId}`);
      this.networkRequests.set(tabId, []);
    }
    if (!this.recentRequests.has(tabId)) {
      console.log(`[captureRequest] Initializing recentRequests for tab ${tabId}`);
      this.recentRequests.set(tabId, []);
    }

    // Detect GraphQL requests
    const isGraphQL = this.isGraphQLRequest(details);
    console.log(`[captureRequest] GraphQL detection result: ${isGraphQL}`);

    const requestData = {
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      type: details.type,
      timestamp: details.timeStamp,
      requestBody: details.requestBody,
      tabId: tabId,
      isGraphQL: isGraphQL,
      graphQLQuery: isGraphQL ? this.extractGraphQLQuery(details) : null
    };

    // Add to both arrays
    this.networkRequests.get(tabId).push(requestData);
    this.recentRequests.get(tabId).push(requestData);

    const currentNetworkCount = this.networkRequests.get(tabId).length;
    const currentRecentCount = this.recentRequests.get(tabId).length;
    console.log(`[captureRequest] Added request. Tab ${tabId} now has ${currentNetworkCount} network requests, ${currentRecentCount} recent requests`);

    // Keep only last 100 requests in recent buffer to avoid memory issues
    const recentBuffer = this.recentRequests.get(tabId);
    if (recentBuffer.length > 100) {
      recentBuffer.splice(0, recentBuffer.length - 100);
      console.log(`[captureRequest] Trimmed recent buffer for tab ${tabId}`);
    }

    console.log(`[captureRequest] Successfully captured ${isGraphQL ? 'GraphQL ' : ''}request: ${details.method} ${details.url}`);
  }

  isGraphQLRequest(details) {
    const url = details.url.toLowerCase();

    // Common GraphQL endpoint patterns
    if (url.includes('/graphql') || url.includes('/api/graphql') || url.includes('/graph')) {
      return true;
    }

    // Check if request body contains GraphQL query
    if (details.requestBody && details.requestBody.raw) {
      try {
        const body = details.requestBody.raw[0];
        if (body && body.bytes) {
          const decoder = new TextDecoder();
          const bodyText = decoder.decode(body.bytes).toLowerCase();
          return bodyText.includes('query') || bodyText.includes('mutation') || bodyText.includes('subscription');
        }
      } catch (error) {
        // Ignore decode errors
      }
    }

    return false;
  }

  extractGraphQLQuery(details) {
    if (!details.requestBody || !details.requestBody.raw) return null;

    try {
      const body = details.requestBody.raw[0];
      if (body && body.bytes) {
        const decoder = new TextDecoder();
        const bodyText = decoder.decode(body.bytes);
        const parsed = JSON.parse(bodyText);

        return {
          query: parsed.query || null,
          variables: parsed.variables || null,
          operationName: parsed.operationName || null
        };
      }
    } catch (error) {
      console.log('Failed to parse GraphQL query:', error);
    }

    return null;
  }

  captureResponse(details) {
    const tabId = details.tabId;

    // Update response data in both arrays
    [this.networkRequests, this.recentRequests].forEach(requestMap => {
      if (!requestMap.has(tabId)) return;

      const requests = requestMap.get(tabId);
      const requestIndex = requests.findIndex(r => r.requestId === details.requestId);

      if (requestIndex !== -1) {
        requests[requestIndex] = {
          ...requests[requestIndex],
          statusCode: details.statusCode,
          responseHeaders: details.responseHeaders,
          responseTimestamp: details.timeStamp
        };
      }
    });
  }

  captureError(details) {
    const tabId = details.tabId;

    // Update error data in both arrays
    [this.networkRequests, this.recentRequests].forEach(requestMap => {
      if (!requestMap.has(tabId)) return;

      const requests = requestMap.get(tabId);
      const requestIndex = requests.findIndex(r => r.requestId === details.requestId);

      if (requestIndex !== -1) {
        requests[requestIndex] = {
          ...requests[requestIndex],
          error: details.error,
          errorTimestamp: details.timeStamp
        };
      }
    });
  }

  getNetworkData(tabId) {
    return this.networkRequests.get(tabId) || [];
  }

  async storeAnalysis(tabId, data) {
    console.log('Storing analysis for tab:', tabId, 'Has session:', this.analysisData.has(tabId));

    // If no session exists, create a basic one
    if (!this.analysisData.has(tabId)) {
      console.log('Creating new analysis session for tab:', tabId);
      this.analysisData.set(tabId, {
        startTime: Date.now(),
        url: '',
        title: '',
        assets: [],
        networkRequests: [],
        thirdPartyServices: [],
        frameworks: [],
        metadata: {},
        options: {}
      });
    }

    const analysisData = this.analysisData.get(tabId);
    Object.assign(analysisData, data);

    // Determine stage from data keys and save a checkpoint
    let stage = 'dom-capture';
    if (data.networkRequests && data.networkRequests.length > 0) {
      stage = 'network-capture';
    } else if (data.frameworks !== undefined || data.assets !== undefined) {
      stage = 'dom-capture';
    }
    this.saveCheckpoint(tabId, stage).catch(err => console.warn('[checkpoint] save failed:', err));

    // Store in chrome.storage for persistence (with size limits to avoid quota)
    try {
      // Create a smaller version for storage to avoid quota issues
      const storageData = {
        url: analysisData.url,
        title: analysisData.title,
        startTime: analysisData.startTime,
        assetCount: Object.values(analysisData.assets || {}).reduce((sum, arr) => sum + arr.length, 0),
        frameworkCount: (analysisData.frameworks || []).length,
        serviceCount: (analysisData.thirdPartyServices || []).length,
        networkCount: this.getNetworkData(tabId).length,
        timestamp: new Date().toISOString()
      };

      await chrome.storage.local.set({
        [`analysis_${tabId}_${Date.now()}`]: storageData
      });

      console.log('Analysis summary stored (avoiding quota issues)');
    } catch (error) {
      console.warn('Storage failed (quota exceeded?), continuing without storage:', error.message);
      // Don't throw - analysis can continue without storage
    }

    console.log('Analysis stored successfully');
  }

  /**
   * Fetch binary assets via SW context (bypasses CORS via <all_urls> host permission).
   * @param {string[]} urls - Array of absolute URLs to fetch
   * @returns {Promise<{ successes: Array<{url, filename, data}>, failures: Array<{url, reason}> }>}
   */
  async fetchAssets(urls) {
    const TIMEOUT_MS = 10000;
    const seenFilenames = new Map();
    const successes = [];
    const failures = [];

    // Fetch all URLs in parallel
    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) {
            return { url, error: `HTTP ${response.status}` };
          }
          const buffer = await response.arrayBuffer();
          const data = new Uint8Array(buffer);
          const rawFilename = extractFilename(url);
          const filename = resolveFilename(rawFilename, seenFilenames);
          return { url, filename, data };
        } catch (err) {
          clearTimeout(timer);
          return { url, error: err.name === 'AbortError' ? 'timeout' : err.message };
        }
      })
    );

    for (const result of results) {
      const value = result.status === 'fulfilled' ? result.value : { url: 'unknown', error: result.reason?.message || 'unknown error' };
      if (value.data) {
        successes.push(value);
      } else {
        failures.push({ url: value.url, reason: value.error });
      }
    }

    return { successes, failures };
  }

  async downloadAsZip(tabId, packageData) {
    const analysisData = this.analysisData.get(tabId) || {};
    const networkData = this.getNetworkData(tabId);

    // Fetch assets if URL list is present and not already fetched
    if (analysisData.assetUrls && analysisData.assetUrls.length > 0 && !analysisData.fetchedAssets) {
      const assetResult = await this.fetchAssets(analysisData.assetUrls);
      analysisData.fetchedAssets = assetResult.successes;
      analysisData.failedAssets = assetResult.failures;
    }

    const fetchedAssets = analysisData.fetchedAssets || [];
    const failedAssets = analysisData.failedAssets || [];

    // Build index.json — manifest + summary for the ZIP root
    const indexData = {
      url: analysisData.url || packageData.url,
      title: analysisData.title || packageData.title,
      capturedAt: new Date().toISOString(),
      scope: analysisData.scopeMetadata || { mode: 'full-page', selector: null, outerHtml: null, childCount: 0 },
      stages: {
        html: !!(analysisData.scopedHtml),
        css: false,
        computedStyles: !!(analysisData.computedStyles),
        assets: fetchedAssets.length > 0,
        network: networkData && networkData.length > 0,
        tracking: false
      },
      failedAssets: failedAssets,
      ...packageData
    };

    // Build file tree — pre-scaffold final Phase 3 directory layout
    // fflate represents empty dirs with trailing slash key + empty object value
    // NOTE: index.json is encoded LAST (after all indexData mutations) — see end of block
    const fileTree = {
      'html/':             {},
      'css/':              {},
      'computed-styles/':  {},
      'assets/':           {},
      'network/':          {},
      'tracking/':         {},
    };

    // Phase 3: HTML — scoped outerHTML or full-page
    if (analysisData.scopedHtml) {
      fileTree['html/'] = {
        'index.html': fflate.strToU8(analysisData.scopedHtml)
      };
    }

    // Phase 3: Component hierarchy
    if (analysisData.componentHierarchy) {
      if (!fileTree['html/'] || typeof fileTree['html/'] !== 'object' || !fileTree['html/']['index.html']) {
        fileTree['html/'] = {};
      }
      fileTree['html/']['component-hierarchy.json'] = fflate.strToU8(
        JSON.stringify(analysisData.componentHierarchy, null, 2)
      );
    }

    // Phase 3: Binary assets
    if (fetchedAssets.length > 0) {
      const assetsDir = {};
      for (const asset of fetchedAssets) {
        assetsDir[asset.filename] = asset.data; // Uint8Array — NOT strToU8
      }
      fileTree['assets/'] = assetsDir;
    }

    // Phase 6: CSS stylesheets — fetch external stylesheets into css/ directory
    // D-07: Include all page stylesheets regardless of element scoping
    const cssUrls = extractCssUrlsFromAnalysisData(analysisData);
    // Fallback: if no CSS URLs from analysis data, try network request log (D-08, D-09)
    const effectiveCssUrls = cssUrls.length > 0
      ? cssUrls
      : extractCssUrlsFromNetworkRequests(networkData);

    if (effectiveCssUrls.length > 0) {
      const cssResult = await this.fetchAssets(effectiveCssUrls);
      const fetchedCss = cssResult.successes;
      const failedCss = cssResult.failures;

      // Record CSS fetch failures alongside asset failures (Pitfall 2)
      failedAssets.push(...failedCss);

      if (fetchedCss.length > 0) {
        const cssDir = {};
        for (const sheet of fetchedCss) {
          // fetchAssets returns { url, filename, data: Uint8Array } — correct for fflate
          cssDir[sheet.filename] = sheet.data;
        }
        fileTree['css/'] = cssDir;
      }

      // Update stages flag (Pitfall 1: must happen before index.json encoding)
      indexData.stages.css = fetchedCss.length > 0;

      // CSS summary for LLM consumers
      indexData.css = {
        fileCount: fetchedCss.length,
        failedCount: failedCss.length,
        files: fetchedCss.map(s => s.filename)
      };
    }

    // Network data
    if (networkData && networkData.length > 0) {
      fileTree['network/'] = {
        'requests.json': fflate.strToU8(JSON.stringify(networkData, null, 2))
      };
    }

    // Phase 2: computed styles — write into pre-scaffolded computed-styles/ subdir
    if (analysisData.computedStyles) {
      fileTree['computed-styles/'] = {
        'computed-styles.json': fflate.strToU8(
          JSON.stringify(analysisData.computedStyles, null, 2)
        )
      };
    }

    // Phase 4: Tracking data — dataLayer snapshot + derived event schema
    const trackingData = analysisData.trackingData || null;
    const rawDataLayer = trackingData ? trackingData.dataLayer : [];
    const gtmData = trackingData ? trackingData.gtm : null;
    const hasGtm = trackingData ? trackingData.hasGtm : false;

    // Derive deduplicated event schema
    const schemaEvents = deriveEventSchema(rawDataLayer);

    // Reference detected analytics from thirdPartyServices (Phase 1 detection)
    const detectedAnalytics = (analysisData.thirdPartyServices || [])
      .filter(s => s.category === 'Analytics')
      .map(s => s.name);

    const schemaJson = {
      events: schemaEvents,
      gtm: hasGtm ? {
        containerId: gtmData.containerId,
        allContainerIds: gtmData.allContainerIds || [],
        tags: gtmData.tags || []
      } : null,
      analytics: {
        detected: detectedAnalytics
      },
      ...(trackingData && trackingData.note ? { note: trackingData.note } : {})
    };

    fileTree['tracking/'] = {
      'events.json': fflate.strToU8(JSON.stringify(rawDataLayer, null, 2)),
      'schema.json': fflate.strToU8(JSON.stringify(schemaJson, null, 2))
    };

    // Update indexData with tracking summary (MUST happen before index.json encoding)
    indexData.stages.tracking = rawDataLayer.length > 0 || hasGtm;
    indexData.tracking = {
      hasGtm,
      containerId: hasGtm ? gtmData.containerId : null,
      eventCount: rawDataLayer.length,
      uniqueEventNames: schemaEvents
        .filter(e => e.name !== '__variables__')
        .map(e => e.name)
    };

    // Encode index.json LAST — after all indexData mutations
    fileTree['index.json'] = fflate.strToU8(JSON.stringify(indexData, null, 2));

    // Compress at level 1 (fast, minimal CPU — ZIP is for packaging, not archival)
    const zipped = fflate.zipSync(fileTree, { level: 1 });

    // Convert Uint8Array to base64 data URL — Blob URLs not available in SW
    const base64 = uint8ArrayToBase64(zipped);
    const dataUrl = `data:application/zip;base64,${base64}`;

    // Generate filename from captured URL
    const domain = indexData.url
      ? new URL(indexData.url).hostname.replace(/[^a-z0-9]/gi, '_')
      : 'unknown-site';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, '');

    await chrome.downloads.download({
      url: dataUrl,
      filename: `analysis-${domain}-${timestamp}.zip`,
      saveAs: false  // No dialog — single automatic download per INFRA-03
    });

    await this.clearCheckpoint(tabId);
    console.log(`[ZIP] Downloaded analysis-${domain}-${timestamp}.zip (${fetchedAssets.length} assets, ${failedAssets.length} failed)`);
  }

  startKeepAlive(tabId) {
    // periodInMinutes: 0.5 is the minimum (30 seconds) — Chrome 120+ enforces this floor
    chrome.alarms.create(`keepalive_${tabId}`, { periodInMinutes: 0.5 });
    console.log(`[SW keep-alive] started for tab ${tabId}`);
  }

  stopKeepAlive(tabId) {
    chrome.alarms.clear(`keepalive_${tabId}`, (wasCleared) => {
      if (wasCleared) console.log(`[SW keep-alive] stopped for tab ${tabId}`);
    });
  }

  async saveCheckpoint(tabId, stage) {
    // Store ONLY stage name and minimal resume metadata — NOT the full payload
    // chrome.storage.session quota is 10 MB shared; full payloads would exhaust it
    const analysisData = this.analysisData.get(tabId);
    const key = `checkpoint_${tabId}`;
    await chrome.storage.session.set({
      [key]: {
        stage,
        tabId,
        url: analysisData ? analysisData.url : null,
        title: analysisData ? analysisData.title : null,
        ts: Date.now()
      }
    });
    console.log(`[checkpoint] saved stage="${stage}" for tab ${tabId}`);
  }

  async clearCheckpoint(tabId) {
    await chrome.storage.session.remove(`checkpoint_${tabId}`);
    console.log(`[checkpoint] cleared for tab ${tabId}`);
  }

  async loadCheckpoint(tabId) {
    const key = `checkpoint_${tabId}`;
    const result = await chrome.storage.session.get(key);
    return result[key] || null;
  }

  // Cleanup when tab is closed or navigation occurs
  async cleanup(tabId) {
    this.stopKeepAlive(tabId);
    await this.clearCheckpoint(tabId);
    this.networkRequests.delete(tabId);
    this.recentRequests.delete(tabId);
    this.analysisData.delete(tabId);
  }
}

// SW startup recovery scan — checks for resumable analysis sessions
async function checkForActiveAnalysis() {
  const all = await chrome.storage.session.get(null);
  const checkpointKeys = Object.keys(all).filter(k => k.startsWith('checkpoint_'));
  for (const key of checkpointKeys) {
    const cp = all[key];
    const ageMs = Date.now() - cp.ts;
    if (ageMs < 30 * 60 * 1000) {
      // Recent checkpoint — notify popup to show resume notice
      console.log(`[checkpoint] resumable checkpoint found: stage="${cp.stage}" url="${cp.url}"`);
      // Attempt to notify popup; popup may not be open yet — that's fine, it will check on open
      try {
        chrome.runtime.sendMessage({ action: 'ANALYSIS_RESUMED', checkpoint: cp });
      } catch (_) {
        // Popup not open — popup.js checks for checkpoint on its own DOMContentLoaded
      }
    } else {
      // Stale checkpoint — clean up silently
      await chrome.storage.session.remove(key);
      console.log(`[checkpoint] stale checkpoint removed: ${key}`);
    }
  }
}

// Initialize the analyzer
console.log('Migration Analyzer service worker starting...');
const analyzer = new MigrationAnalyzer();
console.log('Migration Analyzer initialized and ready');

// Run on every SW wake — checks for resumable analysis sessions
checkForActiveAnalysis().catch(err => console.warn('[checkpoint] startup scan failed:', err));

// Handle tab closing
chrome.tabs.onRemoved.addListener((tabId) => {
  analyzer.cleanup(tabId);
});

// Handle navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    analyzer.cleanup(tabId);
  }
});