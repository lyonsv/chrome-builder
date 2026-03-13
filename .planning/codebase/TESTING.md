# Testing Patterns

**Analysis Date:** 2026-03-13

## Test Framework

**Runner:**
- None configured — no `jest.config.*`, `vitest.config.*`, or any test runner found
- No `package.json` present (no npm/node dependency management)

**Assertion Library:**
- None

**Run Commands:**
```bash
# No test commands available — no package.json or test runner configured
```

## Test File Organization

**Location:**
- No test files detected anywhere in the repository
- No `*.test.js`, `*.spec.js`, or dedicated `__tests__/` or `tests/` directories exist

**Naming:**
- Not applicable — no tests exist

## Test Infrastructure

**No automated testing is in place.** The codebase has zero test files, no testing framework, and no test runner configuration.

## Manual Test Pages

The codebase uses static HTML files as **manual test harnesses** in lieu of automated tests:

- `test-page.html` — general-purpose test page for exercising extension functionality
- `minimal-test.html` — minimal reproduction environment
- `debug-devtools.html` — DevTools debugging page

These files are loaded in a browser manually to verify extension behavior.

## Debug Infrastructure

The extension includes a built-in debug mode accessible from the popup UI:

- `debugStatus` button in `popup.html` calls `PopupController.debugStatus()` in `popup.js`
- `showRequests` button calls `PopupController.showAllRequests()` in `popup.js`
- `testMinimal` button calls `PopupController.testMinimal()` in `popup.js`
- Background script exposes a `DEBUG_STATUS` action that returns runtime state:
  - `serviceWorkerRunning`
  - `webRequestAPIAvailable`
  - `networkRequestsMapSize`
  - `activeAnalysisTabs`
  - `allTabRequestCounts`

This debug information is accessed via Chrome message passing from `popup.js` to `background.js`.

## Coverage

**Requirements:** None — no coverage tooling configured

**View Coverage:**
```bash
# Not applicable
```

## Test Types

**Unit Tests:**
- Not present

**Integration Tests:**
- Not present

**E2E Tests:**
- Not formally defined; manual browser testing via `test-page.html`, `minimal-test.html`, and `debug-devtools.html`

## How to Verify Behavior (Current Approach)

1. Load the extension in Chrome via `chrome://extensions` → Load unpacked
2. Open `test-page.html` or `minimal-test.html` in a tab
3. Click extension popup → use Debug Status / Show Requests buttons to inspect state
4. Open Chrome DevTools → Migration Analyzer panel (via `devtools.html` / `devtools-panel.js`)
5. Inspect `console.log` output — the codebase logs extensively at every step for manual tracing

## Recommendations for Adding Tests

Given the codebase structure, the most practical test approach would be:

**Unit testing** with Jest or Vitest, mocking the `chrome` global:
```javascript
// Example mock pattern needed
global.chrome = {
  runtime: { onMessage: { addListener: jest.fn() }, sendMessage: jest.fn() },
  tabs: { query: jest.fn(), get: jest.fn() },
  webRequest: { onBeforeRequest: { addListener: jest.fn() } },
  storage: { local: { set: jest.fn() } }
};
```

**Key units to test:**
- `background.js` → `MigrationAnalyzer.isGraphQLRequest()` — pure logic, easily unit-testable
- `background.js` → `MigrationAnalyzer.extractGraphQLQuery()` — pure parsing logic
- `content.js` → `WebsiteAnalyzer.detectFrameworks()` — testable with a mock DOM
- `content.js` → `WebsiteAnalyzer.classifyRemoteEntry()` — pure string matching
- `popup.js` → `PopupController.sendMessage()` — testable with mocked `chrome.runtime`

---

*Testing analysis: 2026-03-13*
