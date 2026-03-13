// Background service worker for Website Migration Analyzer

class MigrationAnalyzer {
  constructor() {
    this.networkRequests = new Map(); // Store all requests for all tabs
    this.recentRequests = new Map(); // Rolling buffer of recent requests per tab
    this.analysisData = new Map();
    this.activeAnalysisTabs = new Set(); // Track which tabs are being analyzed
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
    const tabId = data?.tabId || sender.tab?.id;

    console.log(`Background script handling action: ${action}`, { tabId, data });

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
          await this.downloadAnalysisPackage(tabId, data);
          console.log(`Package downloaded successfully for tab ${tabId}`);
          sendResponse({ success: true });
          break;

        case 'STOP_ANALYSIS':
          console.log(`Stopping analysis for tab ${tabId}`);
          this.stopAnalysis(tabId);
          console.log(`Analysis stopped successfully for tab ${tabId}`);
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

    // Enable network monitoring for this specific tab (optional)
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
      console.log('Debugger attached successfully');
    } catch (error) {
      console.log('Debugger attachment failed, continuing with basic analysis:', error.message);
      // Continue without debugger - basic analysis will still work
    }

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

  async downloadAnalysisPackage(tabId, packageData) {
    const analysisData = this.analysisData.get(tabId) || {};

    // Create comprehensive analysis package
    const packageInfo = {
      ...analysisData,
      networkRequests: this.getNetworkData(tabId),
      generatedAt: new Date().toISOString(),
      ...packageData
    };

    // Convert to JSON string
    const jsonString = JSON.stringify(packageInfo, null, 2);

    // Create data URL instead of blob URL (works in service workers)
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);

    // Generate filename
    const domain = packageInfo.url ?
      new URL(packageInfo.url).hostname.replace(/[^a-z0-9]/gi, '_') :
      'unknown-site';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, '');

    await chrome.downloads.download({
      url: dataUrl,
      filename: `migration-analysis-${domain}-${timestamp}.json`,
      saveAs: true
    });

    await this.clearCheckpoint(tabId);
    console.log('Analysis package downloaded successfully');
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

    try {
      await chrome.debugger.detach({ tabId });
    } catch (error) {
      // Ignore errors - debugger might already be detached
    }

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