# Coding Conventions

**Analysis Date:** 2026-03-13

## Naming Patterns

**Files:**
- Flat kebab-case for multi-word files: `devtools-panel.js`, `devtools-panel.html`, `local-analyzer.js`
- Single-word files use lowercase: `background.js`, `content.js`, `popup.js`, `devtools.js`
- HTML pages named after their component: `popup.html`, `devtools-panel.html`, `devtools.html`
- CSS files mirror JS names: `css/devtools-panel.css`, `css/popup.css`

**Classes:**
- PascalCase for all classes: `MigrationAnalyzer`, `WebsiteAnalyzer`, `PopupController`, `DevToolsPanel`, `LocalHTMLAnalyzer`
- Class names describe the component's role clearly

**Methods:**
- camelCase for all methods: `setupEventListeners()`, `handleMessage()`, `captureRequest()`, `analyzeWebsite()`
- Verb-first method names describing what the method does: `startAnalysis()`, `stopAnalysis()`, `displayResults()`, `downloadPackage()`
- Prefixes: `get*` for data retrieval (`getNetworkData()`), `extract*` for parsing (`extractHTMLContent()`, `extractFonts()`), `detect*` for analysis (`detectFrameworks()`), `inspect*` for DOM queries (`inspectAssets()`, `inspectFrameworks()`), `capture*` for event handlers (`captureRequest()`, `captureResponse()`), `analyze*` for complex processing (`analyzeWebsite()`, `analyzeComponentData()`)

**Variables:**
- camelCase for all variables: `networkRequests`, `analysisData`, `recentRequests`, `tabId`
- Boolean flags use descriptive names: `isAnalyzing`, `isRecording`, `isGraphQL`, `aborted`
- Collections use plural nouns: `networkRequests`, `frameworks`, `thirdPartyServices`, `assets`

**Message Actions:**
- SCREAMING_SNAKE_CASE for Chrome message action constants: `START_ANALYSIS`, `GET_NETWORK_DATA`, `STORE_ANALYSIS`, `DOWNLOAD_PACKAGE`, `STOP_ANALYSIS`, `DEBUG_STATUS`, `ANALYZE_WEBSITE`

## Code Style

**Formatting:**
- No automated formatter config detected (no `.prettierrc`, `biome.json`, or `.eslintrc`)
- 2-space indentation throughout all files
- Single quotes for strings consistently
- Template literals used for string interpolation: `` `Tab ${tabId}` ``, `` `${percent}%` ``
- Semicolons used throughout

**Linting:**
- No linting config detected — no `.eslintrc`, `eslint.config.*`

## Import Organization

**Modules:**
- No ES module `import` statements — project uses browser globals and Chrome extension APIs
- No `require()` calls — vanilla JS browser environment
- Chrome APIs accessed directly via the `chrome.*` global
- Classes instantiated inline at the bottom of each file: `const analyzer = new MigrationAnalyzer()`

## Error Handling

**Patterns:**
- `try/catch` blocks used extensively throughout all files
- Errors logged with `console.error()` including context: `console.error('Analysis failed:', error)`
- Non-fatal errors (e.g. debugger attach failure, stylesheet access) caught and silently continued with `// Continue without...` comments
- Fatal errors re-thrown or propagated via `sendResponse({ success: false, error: error.message })`
- Chrome message responses always include `{ success: true/false, error: error.message }` structure
- Fallback chains: primary → fallback → final fallback (see `analyzeWebsiteContent()` → `performFallbackAnalysis()` → network-only object)
- Optional chaining used for nullable access: `response?.data`, `data?.tabId`, `window.jQuery?.fn?.jquery`
- Nullish coalescing for defaults: `data?.tabId || sender.tab?.id`

**Guard Clauses:**
- Early returns for invalid state: `if (this.isAnalyzing || !this.currentTab) return;`
- API availability checks before use: `if (!chrome.webRequest) { console.error(...); return; }`

## Logging

**Framework:** `console` only — no third-party logging library

**Patterns:**
- `console.log()` for normal flow and debug tracing (verbose — most functions log entry/exit)
- `console.warn()` for recoverable issues: `console.warn('Storage failed...')`
- `console.error()` for caught exceptions and failures
- Prefix log messages with context: `[captureRequest]` prefix used in high-traffic handlers
- Log before AND after async operations to trace completion: `console.log('Starting...')` / `console.log('...successfully')`
- Debug logging is production-level verbose (no dev/prod toggle)

## Comments

**When to Comment:**
- Section headers for logical groups: `// Handle messages from content scripts and popup`
- Inline explanations for non-obvious decisions: `return true; // Keep the message channel open for async responses`
- `// Continue without X` for intentional silent fallbacks
- Method-level comments: `// Main analysis function called by popup/background`

**JSDoc/TSDoc:**
- Not used — no JSDoc annotations anywhere

## Function Design

**Size:** Methods tend to be medium-to-large (20–80 lines), especially in `popup.js` and `content.js`. Some methods like `startAnalysis()` in `popup.js` approach 100+ lines and do multiple sequential steps.

**Parameters:**
- Methods take minimal parameters — state is managed on `this`
- Options objects used for extensibility: `async startAnalysis(tabId, options = {})`
- Default parameter values: `async addAsset(type, url, metadata = {})`

**Return Values:**
- Async methods return data objects or `undefined`
- Void methods used for UI updates (no return)
- Boolean methods for detection: `isGraphQLRequest()`, `isDataUrl()`

## Module Design

**Structure:**
- One class per file (primary pattern): `background.js` → `MigrationAnalyzer`, `content.js` → `WebsiteAnalyzer`, `popup.js` → `PopupController`, `devtools-panel.js` → `DevToolsPanel`, `local-analyzer.js` → `LocalHTMLAnalyzer`
- Class instantiated at bottom of file as a singleton: `const analyzer = new MigrationAnalyzer()`
- `content.js` uses guard pattern to prevent re-declaration: `if (!window.WebsiteAnalyzer) { class WebsiteAnalyzer { ... } window.WebsiteAnalyzer = WebsiteAnalyzer; }`
- Double-initialization guard in `content.js`: `if (!window.migrationAnalyzerLoaded) { window.migrationAnalyzerLoaded = true; ... }`

**Constructor Pattern:**
- Constructors initialize state properties then call setup methods
- Setup methods are always named `setup*`: `setupEventListeners()`, `setupTabs()`
- Initialize methods are named `initialize*`: `initializeElements()`

---

*Convention analysis: 2026-03-13*
