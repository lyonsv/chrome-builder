// DevTools panel controller for Migration Analyzer

class DevToolsPanel {
  constructor() {
    console.log('DevTools panel constructor called');

    this.isRecording = false;
    this.networkRequests = [];
    this.analysisData = null;
    this.selectedRequest = null;
    this.networkPollingInterval = null;

    this.initializeElements();
    this.setupEventListeners();
    this.setupTabs();

    console.log('DevTools panel initialized successfully');
  }

  initializeElements() {
    console.log('Initializing DevTools elements...');

    // Status elements
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');

    // Buttons
    this.startRecordingBtn = document.getElementById('startRecording');
    this.clearDataBtn = document.getElementById('clearData');
    this.exportDataBtn = document.getElementById('exportData');

    // Check if critical elements exist
    const criticalElements = [
      { name: 'statusDot', element: this.statusDot },
      { name: 'startRecordingBtn', element: this.startRecordingBtn },
      { name: 'clearDataBtn', element: this.clearDataBtn }
    ];

    const missingElements = criticalElements.filter(item => !item.element);
    if (missingElements.length > 0) {
      console.error('Missing DevTools elements:', missingElements.map(item => item.name));
      return false;
    }

    console.log('DevTools elements initialized successfully');

    // Network tab
    this.requestsTableBody = document.getElementById('requestsTableBody');
    this.requestDetails = document.getElementById('requestDetails');
    this.detailsContent = document.getElementById('detailsContent');

    // Filters
    this.filterXHR = document.getElementById('filterXHR');
    this.filterJS = document.getElementById('filterJS');
    this.filterCSS = document.getElementById('filterCSS');
    this.filterImages = document.getElementById('filterImages');
    this.filterOther = document.getElementById('filterOther');
    this.searchRequests = document.getElementById('searchRequests');

    // Asset counts
    this.htmlCount = document.getElementById('htmlCount');
    this.cssCount = document.getElementById('cssCount');
    this.jsCount = document.getElementById('jsCount');
    this.imagesCount = document.getElementById('imagesCount');
    this.fontsCount = document.getElementById('fontsCount');
    this.otherCount = document.getElementById('otherCount');

    // Lists
    this.assetsList = document.getElementById('assetsList');
    this.frameworksList = document.getElementById('frameworksList');
    this.servicesList = document.getElementById('servicesList');
    this.performanceMetrics = document.getElementById('performanceMetrics');
  }

  setupEventListeners() {
    // Recording controls with better error handling
    this.startRecordingBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Start recording button clicked');
      this.toggleRecording().catch(error => {
        console.error('Toggle recording failed:', error);
        this.isRecording = false;
        this.updateRecordingStatus();
      });
    });

    this.clearDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Clear data button clicked');
      this.clearData();
    });

    this.exportDataBtn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('Export data button clicked');
      this.exportData();
    });

    // Search and filters
    this.searchRequests.addEventListener('input', () => this.filterRequests());
    [this.filterXHR, this.filterJS, this.filterCSS, this.filterImages, this.filterOther]
      .forEach(filter => filter.addEventListener('change', () => this.filterRequests()));

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Get current tab and start listening for analysis data
    chrome.devtools.inspectedWindow.eval(
      'window.location.href',
      (result, isException) => {
        if (!isException) {
          console.log('DevTools panel initialized for:', result);
        }
      }
    );
  }

  setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(tc => tc.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const tabId = tab.getAttribute('data-tab');
        document.getElementById(`${tabId}Tab`).classList.add('active');
      });
    });

    // Setup details tabs
    const detailsTabs = document.querySelectorAll('.details-tab');
    detailsTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        detailsTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const tabType = tab.getAttribute('data-details-tab');
        this.showRequestDetails(tabType);
      });
    });
  }

  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      this.isRecording = true;
      this.updateRecordingStatus();

      const tabId = chrome.devtools.inspectedWindow.tabId;
      console.log('Starting recording for tab:', tabId);

      // Clear previous data
      this.networkRequests = [];
      this.analysisData = null;

      // Start background analysis session (no debugger needed - background handles it)
      chrome.runtime.sendMessage({
        action: 'START_ANALYSIS',
        data: { tabId, fromDevtools: true }
      }, (response) => {
        if (response?.success) {
          console.log('DevTools analysis session started');
          // Start polling for network requests
          this.startNetworkPolling();
        } else {
          console.error('Failed to start analysis session:', response?.error);
        }
      });

      // Start content script analysis
      chrome.devtools.inspectedWindow.eval(
        `
        // Inject and run content script
        if (!window.migrationAnalyzerLoaded) {
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('content.js');
          document.head.appendChild(script);

          // Wait for script to load then analyze
          script.onload = () => {
            setTimeout(() => {
              if (window.WebsiteAnalyzer) {
                const analyzer = new WebsiteAnalyzer();
                analyzer.analyzeWebsite().then(result => {
                  window.devToolsAnalysisResult = result;
                });
              }
            }, 1000);
          };
        } else if (window.WebsiteAnalyzer) {
          const analyzer = new WebsiteAnalyzer();
          analyzer.analyzeWebsite().then(result => {
            window.devToolsAnalysisResult = result;
          });
        }
        true;
        `,
        (result, isException) => {
          if (isException) {
            console.error('Failed to start content analysis:', result);
          } else {
            console.log('Content script analysis started');
            // Check for results periodically
            this.checkForAnalysisResults();
          }
        }
      );

    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      this.updateRecordingStatus();
    }
  }

  async stopRecording() {
    try {
      this.isRecording = false;
      this.updateRecordingStatus();

      const tabId = chrome.devtools.inspectedWindow.tabId;
      console.log('Stopping recording for tab:', tabId);

      // Stop network polling
      this.stopNetworkPolling();

      // Stop background analysis session
      chrome.runtime.sendMessage({
        action: 'STOP_ANALYSIS',
        data: { tabId }
      }, (response) => {
        if (response?.success) {
          console.log('DevTools analysis session stopped');
        }
      });

    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  }

  checkForAnalysisResults() {
    // Check every 2 seconds for analysis results
    const checkInterval = setInterval(() => {
      chrome.devtools.inspectedWindow.eval(
        'window.devToolsAnalysisResult',
        (result, isException) => {
          if (!isException && result) {
            this.analysisData = result;
            this.updateAnalysisDisplay();
            clearInterval(checkInterval);
            console.log('Analysis results received:', result);
          }
        }
      );
    }, 2000);

    // Stop checking after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
    }, 30000);
  }

  startNetworkPolling() {
    console.log('Starting network polling for DevTools panel');
    // Poll for network requests every second
    this.networkPollingInterval = setInterval(() => {
      const tabId = chrome.devtools.inspectedWindow.tabId;
      chrome.runtime.sendMessage({
        action: 'GET_NETWORK_DATA',
        data: { tabId }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('DevTools network polling error:', chrome.runtime.lastError.message);
          return;
        }

        if (!response) {
          console.warn('No response from background script for GET_NETWORK_DATA');
          return;
        }

        if (response.success && response.data) {
          // Only update if we have new requests
          if (response.data.length !== this.networkRequests.length) {
            console.log(`DevTools updating network display: ${response.data.length} requests (was ${this.networkRequests.length})`);
            this.networkRequests = response.data;
            this.updateNetworkDisplay();
          }
        } else {
          console.warn('Failed to get network data:', response?.error);
        }
      });
    }, 1000);
  }

  stopNetworkPolling() {
    if (this.networkPollingInterval) {
      clearInterval(this.networkPollingInterval);
      this.networkPollingInterval = null;
    }
  }

  // Debugger event handling removed - now using background script polling
  // handleDebuggerEvent method removed to prevent conflicts with background script

  // Network handler methods removed - now using background script data
  // handleNetworkRequest, handleNetworkResponse, handleNetworkFinished,
  // and handleNetworkFailed methods removed to prevent conflicts

  updateRecordingStatus() {
    if (this.isRecording) {
      this.statusDot.classList.add('recording');
      this.statusText.textContent = 'Recording...';
      this.startRecordingBtn.textContent = 'Stop Recording';
      this.startRecordingBtn.classList.remove('btn-primary');
      this.startRecordingBtn.classList.add('btn-secondary');
    } else {
      this.statusDot.classList.remove('recording');
      this.statusText.textContent = 'Not Recording';
      this.startRecordingBtn.textContent = 'Start Recording';
      this.startRecordingBtn.classList.add('btn-primary');
      this.startRecordingBtn.classList.remove('btn-secondary');
    }

    this.exportDataBtn.disabled = this.networkRequests.length === 0 && !this.analysisData;
  }

  updateNetworkDisplay() {
    this.filterRequests();
  }

  filterRequests() {
    const searchTerm = this.searchRequests.value.toLowerCase();
    const filters = {
      xhr: this.filterXHR.checked,
      script: this.filterJS.checked,
      stylesheet: this.filterCSS.checked,
      image: this.filterImages.checked,
      other: this.filterOther.checked
    };

    const filteredRequests = this.networkRequests.filter(request => {
      // Search filter
      const matchesSearch = !searchTerm ||
        request.url.toLowerCase().includes(searchTerm) ||
        (request.request?.url || '').toLowerCase().includes(searchTerm);

      // Type filter
      const type = this.getRequestType(request);
      const matchesType = filters[type] || (type !== 'xhr' && type !== 'script' && type !== 'stylesheet' && type !== 'image' && filters.other);

      return matchesSearch && matchesType;
    });

    this.renderRequestsTable(filteredRequests);
  }

  getRequestType(request) {
    const url = request.url || request.request?.url || '';
    const type = request.type || '';

    if (type === 'XHR' || type === 'Fetch') return 'xhr';
    if (type === 'Script' || url.includes('.js')) return 'script';
    if (type === 'Stylesheet' || url.includes('.css')) return 'stylesheet';
    if (type === 'Image' || /\.(png|jpg|jpeg|gif|svg|webp)/.test(url)) return 'image';
    return 'other';
  }

  renderRequestsTable(requests) {
    this.requestsTableBody.innerHTML = '';

    requests.forEach(request => {
      const row = document.createElement('tr');
      row.addEventListener('click', () => this.selectRequest(request));

      const name = this.getFileName(request.url);
      const status = request.status || (request.failed ? 'Failed' : 'Pending');
      const type = this.getRequestType(request);
      const size = request.encodedDataLength ? this.formatSize(request.encodedDataLength) : '-';
      const domain = new URL(request.url).hostname;

      row.innerHTML = `
        <td title="${request.url}">${name}</td>
        <td class="status-${Math.floor(request.status / 100)}00">${status}</td>
        <td class="type-${type}">${type.toUpperCase()}</td>
        <td>${size}</td>
        <td>-</td>
        <td>${domain}</td>
      `;

      this.requestsTableBody.appendChild(row);
    });
  }

  selectRequest(request) {
    this.selectedRequest = request;

    // Update selected row
    document.querySelectorAll('.requests-table tbody tr').forEach(row => {
      row.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');

    // Show request details
    this.requestDetails.style.display = 'flex';
    this.showRequestDetails('headers');
  }

  showRequestDetails(tabType) {
    if (!this.selectedRequest) return;

    let content = '';

    switch (tabType) {
      case 'headers':
        content = this.formatHeaders(this.selectedRequest);
        break;
      case 'response':
        content = this.formatResponse(this.selectedRequest);
        break;
      case 'timing':
        content = this.formatTiming(this.selectedRequest);
        break;
    }

    this.detailsContent.innerHTML = content;
  }

  formatHeaders(request) {
    let html = '<h4>Request Headers</h4><pre>';

    if (request.request?.headers) {
      Object.entries(request.request.headers).forEach(([key, value]) => {
        html += `${key}: ${value}\n`;
      });
    }

    html += '</pre>';

    if (request.response?.headers) {
      html += '<h4>Response Headers</h4><pre>';
      Object.entries(request.response.headers).forEach(([key, value]) => {
        html += `${key}: ${value}\n`;
      });
      html += '</pre>';
    }

    return html;
  }

  formatResponse(request) {
    return `
      <div>
        <strong>Status:</strong> ${request.status || 'Pending'}<br>
        <strong>Status Text:</strong> ${request.statusText || 'N/A'}<br>
        <strong>MIME Type:</strong> ${request.mimeType || 'Unknown'}<br>
        <strong>Size:</strong> ${request.encodedDataLength ? this.formatSize(request.encodedDataLength) : 'Unknown'}
      </div>
    `;
  }

  formatTiming(request) {
    return `
      <div>
        <strong>Request Time:</strong> ${new Date(request.timestamp * 1000).toLocaleString()}<br>
        <strong>Status:</strong> ${request.finished ? 'Finished' : request.failed ? 'Failed' : 'Pending'}
      </div>
    `;
  }

  updateAnalysisDisplay() {
    if (!this.analysisData) return;

    const { assets, frameworks, thirdPartyServices, metadata } = this.analysisData;

    // Update asset counts
    this.htmlCount.textContent = assets.html?.length || 0;
    this.cssCount.textContent = assets.css?.length || 0;
    this.jsCount.textContent = assets.js?.length || 0;
    this.imagesCount.textContent = assets.images?.length || 0;
    this.fontsCount.textContent = assets.fonts?.length || 0;
    this.otherCount.textContent = assets.other?.length || 0;

    // Update frameworks
    this.renderFrameworks(frameworks);

    // Update services
    this.renderServices(thirdPartyServices);

    // Update performance
    this.renderPerformance(metadata.performance);
  }

  renderFrameworks(frameworks) {
    if (!frameworks || frameworks.length === 0) {
      this.frameworksList.innerHTML = '<p>No frameworks detected</p>';
      return;
    }

    this.frameworksList.innerHTML = '';
    frameworks.forEach(framework => {
      const div = document.createElement('div');
      div.className = 'framework-item';
      div.innerHTML = `
        <h4>${framework.name}</h4>
        <div class="framework-version">Version: ${framework.version || 'Unknown'}</div>
        <div class="framework-confidence">
          Confidence: ${Math.round((framework.confidence || 0) * 100)}%
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${(framework.confidence || 0) * 100}%"></div>
          </div>
        </div>
      `;
      this.frameworksList.appendChild(div);
    });
  }

  renderServices(services) {
    if (!services || services.length === 0) {
      this.servicesList.innerHTML = '<p>No third-party services detected</p>';
      return;
    }

    this.servicesList.innerHTML = '';
    services.forEach(service => {
      const div = document.createElement('div');
      div.className = 'service-item';
      div.innerHTML = `
        <h4>${service.name}</h4>
        <span class="service-category">${service.category}</span>
        <div class="service-urls">
          <strong>URLs:</strong>
          <ul>
            ${service.urls.map(url => `<li>${url}</li>`).join('')}
          </ul>
        </div>
      `;
      this.servicesList.appendChild(div);
    });
  }

  renderPerformance(performance) {
    if (!performance) {
      this.performanceMetrics.innerHTML = '<p>No performance data available</p>';
      return;
    }

    this.performanceMetrics.innerHTML = `
      <div class="metric-card">
        <h4>DOM Content Loaded</h4>
        <div class="metric-value">${performance.domContentLoaded?.toFixed(2) || 'N/A'}ms</div>
        <div class="metric-description">Time to complete DOM parsing</div>
      </div>

      <div class="metric-card">
        <h4>Load Complete</h4>
        <div class="metric-value">${performance.loadComplete?.toFixed(2) || 'N/A'}ms</div>
        <div class="metric-description">Time to complete page load</div>
      </div>

      <div class="metric-card">
        <h4>Resource Count</h4>
        <div class="metric-value">${performance.resourceCount || 0}</div>
        <div class="metric-description">Number of resources loaded</div>
      </div>

      <div class="metric-card">
        <h4>Transfer Size</h4>
        <div class="metric-value">${this.formatSize(performance.totalTransferSize || 0)}</div>
        <div class="metric-description">Total bytes transferred</div>
      </div>
    `;
  }

  clearData() {
    this.networkRequests = [];
    this.analysisData = null;
    this.selectedRequest = null;

    this.requestsTableBody.innerHTML = '';
    this.requestDetails.style.display = 'none';
    this.assetsList.innerHTML = '';
    this.frameworksList.innerHTML = '';
    this.servicesList.innerHTML = '';
    this.performanceMetrics.innerHTML = '';

    // Reset counts
    this.htmlCount.textContent = '0';
    this.cssCount.textContent = '0';
    this.jsCount.textContent = '0';
    this.imagesCount.textContent = '0';
    this.fontsCount.textContent = '0';
    this.otherCount.textContent = '0';

    this.exportDataBtn.disabled = true;
  }

  async exportData() {
    const exportData = {
      networkRequests: this.networkRequests,
      analysisData: this.analysisData,
      exportedAt: new Date().toISOString(),
      url: await this.getCurrentUrl()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `migration-analysis-devtools-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  getCurrentUrl() {
    return new Promise((resolve) => {
      chrome.devtools.inspectedWindow.eval(
        'window.location.href',
        (result, isException) => {
          resolve(isException ? 'unknown' : result);
        }
      );
    });
  }

  getFileName(url) {
    try {
      const path = new URL(url).pathname;
      return path.split('/').pop() || 'index.html';
    } catch {
      return url;
    }
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  handleMessage(message, sender, sendResponse) {
    // Handle messages from popup or background script
    console.log('DevTools panel received message:', message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    new DevToolsPanel();
  } catch (error) {
    console.error('DevTools panel initialization failed:', error);
  }
});