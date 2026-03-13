# Architecture

**Analysis Date:** 2026-03-13

## Pattern Overview

**Overall:** Chrome Extension MV3 Multi-Context Architecture

**Key Characteristics:**
- Four isolated JavaScript execution contexts (service worker, popup, content script, devtools panel) communicating via Chrome's messaging API
- No build system — all scripts are plain JavaScript loaded directly by the browser
- Tab-scoped state: all analysis data is keyed by `tabId` in in-memory Maps inside the service worker
- Fallback-driven analysis: every analysis path has a degraded fallback if the primary approach fails (e.g., content script injection → DOM inspection → network-only)

## Layers

**Service Worker (Background):**
- Purpose: Persistent network interception, state management, and orchestration of downloads
- Location: `background.js`
- Contains: `MigrationAnalyzer` class; network request capture via `chrome.webRequest`; analysis session lifecycle
- Depends on: Chrome APIs (`webRequest`, `debugger`, `tabs`, `downloads`, `storage`)
- Used by: Popup, DevTools panel (via `chrome.runtime.sendMessage`)

**Popup UI:**
- Purpose: User-facing control panel for triggering analysis and viewing results
- Location: `popup.html`, `popup.js`, `css/popup.css`
- Contains: `PopupController` class; step-by-step analysis orchestration; progress tracking; inline DOM inspection fallbacks
- Depends on: Background service worker (messaging), `content.js` (injected), `local-analyzer.js` (loaded directly)
- Used by: End user via browser toolbar

**Content Script:**
- Purpose: DOM-level analysis running inside the target page's context
- Location: `content.js`
- Contains: `WebsiteAnalyzer` class; asset discovery (CSS, JS, images, fonts); framework detection; third-party service identification; performance metrics
- Depends on: DOM APIs of the inspected page
- Used by: Popup (injected on demand via `chrome.scripting.executeScript`)

**Local Analyzer:**
- Purpose: CSP-bypass fallback that fetches and parses HTML within the extension context
- Location: `local-analyzer.js`
- Contains: `LocalHTMLAnalyzer` class; streaming fetch with 2MB/30s limits; header-only fallback
- Depends on: `fetch` API, `DOMParser`
- Used by: Loaded in `popup.html` alongside `popup.js`; invoked when content script injection fails

**DevTools Panel:**
- Purpose: Alternative analysis UI embedded in Chrome DevTools
- Location: `devtools.html`, `devtools.js`, `devtools-panel.html`, `devtools-panel.js`, `css/devtools-panel.css`
- Contains: `DevToolsPanel` class; tabbed UI for network requests, assets, frameworks, services; polling for network data; export
- Depends on: Background service worker (messaging), `chrome.devtools` API
- Used by: Developer via Chrome DevTools sidebar

## Data Flow

**Primary Analysis Flow:**

1. User clicks "Start Analysis" in popup (`popup.js` → `PopupController.startAnalysis`)
2. Popup sends `START_ANALYSIS` message to background (`chrome.runtime.sendMessage`)
3. Background initialises `analysisData` Map entry for the `tabId`, attaches Chrome Debugger, begins capturing `webRequest` events
4. If "Reload Page" option is set, popup reloads the tab and waits for `chrome.tabs.onUpdated` completion
5. Popup injects `content.js` into the target tab via `chrome.scripting.executeScript`
6. Popup sends `ANALYZE_WEBSITE` message to content script (`chrome.tabs.sendMessage`)
7. Content script's `WebsiteAnalyzer.analyzeWebsite()` runs in page context, returns assets/frameworks/services
8. If content script fails, popup falls back to DOM inspection via `chrome.scripting.executeScript` inline functions, then to `LocalHTMLAnalyzer`, then to network-only
9. Popup sends `GET_NETWORK_DATA` to background to retrieve captured requests
10. Popup optionally captures a screenshot via `chrome.tabs.captureVisibleTab`
11. Popup sends `STORE_ANALYSIS` to background (persists summary to `chrome.storage.local`)
12. User clicks "Download Package" → popup sends `DOWNLOAD_PACKAGE` → background calls `chrome.downloads.download` with a data URI

**Network Capture Flow:**

1. `chrome.webRequest.onBeforeRequest` fires for every request on every tab
2. `MigrationAnalyzer.captureRequest` stores to both `networkRequests` Map and `recentRequests` rolling buffer (capped at 100)
3. `chrome.webRequest.onCompleted` and `onErrorOccurred` update the existing entry by `requestId`
4. GraphQL requests are detected by URL pattern and request body inspection

**State Management:**
- All runtime state lives in in-memory Maps in the background service worker (`networkRequests`, `recentRequests`, `analysisData`, `activeAnalysisTabs`)
- Summaries are persisted to `chrome.storage.local` with keys like `analysis_<tabId>_<timestamp>`
- State is cleaned up when a tab closes (`chrome.tabs.onRemoved`) or navigates (`chrome.tabs.onUpdated` status=loading)

## Key Abstractions

**MigrationAnalyzer (Background):**
- Purpose: Singleton service managing all network and analysis state per tab
- Location: `background.js`
- Pattern: Class instantiated once at service worker startup; action-dispatch via `switch` on `message.action`

**PopupController:**
- Purpose: Orchestrates the multi-step analysis workflow and owns all popup UI state
- Location: `popup.js`
- Pattern: Class instantiated on popup open; wraps all Chrome messaging behind `sendMessage(action, data)` helper

**WebsiteAnalyzer (Content Script):**
- Purpose: DOM scraper running inside page context
- Location: `content.js`
- Pattern: Class guarded by `window.WebsiteAnalyzer` check to prevent duplicate declaration on re-injection; singleton instance guarded by `window.migrationAnalyzerLoaded`

**LocalHTMLAnalyzer:**
- Purpose: Fallback HTML fetcher/parser in extension context to avoid CSP restrictions
- Location: `local-analyzer.js`
- Pattern: Class instantiated in popup context; uses streaming fetch + `DOMParser`

**DevToolsPanel:**
- Purpose: Standalone UI controller for the DevTools panel context
- Location: `devtools-panel.js`
- Pattern: Class instantiated on panel load; polls background for network data; mirrors analysis capabilities of popup

## Entry Points

**Service Worker:**
- Location: `background.js` (line 471 — `new MigrationAnalyzer()`)
- Triggers: Browser starts the extension; persists as MV3 service worker
- Responsibilities: Network interception for all tabs; message router; download orchestration

**Popup:**
- Location: `popup.html` → loads `local-analyzer.js`, then `popup.js`
- Triggers: User clicks extension toolbar icon
- Responsibilities: Present options; run analysis workflow; display results

**Content Script (injected on demand):**
- Location: `content.js`
- Triggers: `chrome.scripting.executeScript` called from popup
- Responsibilities: DOM-level analysis of the current page

**DevTools Page:**
- Location: `devtools.html` → `devtools.js`
- Triggers: User opens Chrome DevTools
- Responsibilities: Register the "Migration Analyzer" panel via `chrome.devtools.panels.create`

**DevTools Panel:**
- Location: `devtools-panel.html` → `devtools-panel.js`
- Triggers: User navigates to the Migration Analyzer tab inside DevTools
- Responsibilities: Record/display network requests; show asset/framework/service breakdown; export data

## Error Handling

**Strategy:** Catch-and-fallback at every analysis step; errors are surfaced to the user via status text, never silent failures in the UI.

**Patterns:**
- `try/catch` wrapping all async analysis steps in `PopupController.startAnalysis`; `isAnalyzing` flag always reset in `finally`
- Content script failure triggers three-level fallback: content script → DOM inspection via `executeScript` → `LocalHTMLAnalyzer` → network-only stub
- Background message handler wraps all `switch` cases in a single `try/catch`, always calls `sendResponse` with `{ success: false, error: error.message }` on failure
- Chrome Debugger attach failure is logged and silently skipped; basic analysis continues without it
- `chrome.storage.local` quota errors are caught and silently skipped; analysis data is still held in memory

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` / `console.warn` used extensively throughout all contexts; no structured logging library
**Validation:** Inline `if (!tabId)` guards in background; `if (this.isAnalyzing || !this.currentTab)` guard in popup
**Authentication:** Not applicable — extension operates on the current browser session; no user auth

---

*Architecture analysis: 2026-03-13*
