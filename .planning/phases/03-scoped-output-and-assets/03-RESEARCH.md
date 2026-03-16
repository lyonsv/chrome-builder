# Phase 3: Scoped Output and Assets - Research

**Researched:** 2026-03-16
**Domain:** Chrome Extension DOM Picker, Component Hierarchy Detection, Binary Asset Download, Scoped ZIP Output
**Confidence:** HIGH (core patterns), MEDIUM (React fiber internals), LOW (Vue 3 internal property verification)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Element Picker UX**
- Activation: "Pick Element" button in popup. Clicking hides/minimises popup and activates picker overlay on page.
- Visual feedback: Colored border outline follows cursor with small label showing `tag.primaryClass` (e.g. `div.header-nav`). Same feel as Chrome DevTools element inspector.
- After selection: Click locks in element, picker deactivates, popup reopens showing selection summary (tag, class, child count). User can then start analysis or re-pick.
- Clear button: Once element selected, a clear/x button appears next to summary. Clearing reverts to full-page capture mode.
- Escape key: Pressing Escape during picker mode cancels selection without changing current state.

**Scope Boundary & Coverage**
- When element is selected: HTML, computed styles, and assets are ALL scoped to selected subtree. Network data stays full-page.
- When no element is selected: Full-page capture — existing behavior unchanged. Scoped capture is opt-in.
- Scope metadata in index.json: Top-level `scope` object with: `mode` ("element" or "full-page"), `selector` (CSS selector string), `outerHtml` (first 500 chars), `childCount` (direct children count).

**Asset Download Behavior**
- Asset types fetched: `<img>` src URLs, CSS `@font-face` source URLs, and `background-image` URLs from computed styles — all within scoped subtree (or full page if no scope).
- Auth-gated assets: Out of scope — only publicly fetchable assets are downloaded.
- File naming: Preserve original filename from URL path (e.g., `logo.png`, `inter-regular.woff2`). Collisions resolved with counter suffix (`logo-1.png`, `logo-2.png`).
- Fetch routing: All fetches routed through background service worker to bypass CORS.
- On fetch failure: Skip silently from `/assets/` but record URL and failure reason in `index.json` under `failedAssets: [{ url, reason }]`.

**Component Boundary Format**
- Location: `html/component-hierarchy.json` — a separate file alongside `html/index.html`.
- Detection signals, in priority order:
  1. React fiber internals (`__reactFiber`, `__reactInternalInstance`, `__reactFiber$...` dynamic keys)
  2. Vue bindings (`__vue_app__`, `_vei`, `__vueParentComponent`)
  3. Angular metadata (`ng-version`, `__ngContext__`, `NG_COMP_DEF` on constructor)
  4. `data-*` attributes (`data-component`, `data-testid`, `data-block`, `data-module`)
  5. BEM class patterns (block--modifier style, block__element patterns) as last-resort fallback
- Anonymous elements: When no component name is detectable, use `tag.class` as generated name. Never omit.
- Output shape: Tree structure mirroring DOM nesting, each node with: `name`, `source`, `selector`, `children: []`.

### Claude's Discretion
- Exact color and styling of picker overlay and highlight box
- Picker overlay z-index and cleanup strategy
- Specific counter format for filename collision resolution
- Timeout value for asset fetch requests
- How deeply to traverse the fiber tree (stop at leaf components vs include all internal nodes)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCOPE-01 | User can click to select a specific element or component on the page, and extension captures only that subtree's HTML, computed styles, and assets | Picker overlay injection via `chrome.scripting.executeScript`, element selection via mouseover/click, message passing back to popup |
| SCOPE-02 | Extension exports a structured directory: `index.json` (manifest + summary), `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` — replacing existing single JSON bundle | Already scaffolded in Phase 1 `downloadAsZip()`. Phase 3 populates `html/index.html`, `html/component-hierarchy.json`, and `assets/` with binary files via fflate |
| SCOPE-03 | Extension fetches and saves actual image, font, and icon files routed through background service worker to bypass CORS | Background SW has `<all_urls>` host permission; `fetch()` + `response.arrayBuffer()` + `new Uint8Array()` + fflate binary entry pattern confirmed |
| TRACK-02 | Extension annotates DOM tree with logical component boundaries (React fiber internals, `data-` attributes, BEM class patterns) to produce named component hierarchy alongside raw HTML | React: `__reactFiber$` prefix scan (dynamic suffix); Vue: `__vue__` / `__vueParentComponent`; Angular: `__ngContext__` + `getComponent`; data-attrs and BEM regex as fallbacks |
</phase_requirements>

---

## Summary

Phase 3 is a pure extension-code phase: no new dependencies, no build system, all logic in the three existing files (`content.js`, `popup.js`, `background.js`). There are four distinct technical problems to solve:

1. **DOM element picker**: inject a transparent overlay into the live page via `chrome.scripting.executeScript`, follow the cursor with a highlight box, lock on click, and relay the selected element's CSS selector back to the popup.
2. **Scoped capture**: filter `content.js`'s existing analysis routines by the selected element's subtree (`element.querySelectorAll('*')` instead of `document.querySelectorAll('*')`), produce `html/index.html` and `html/component-hierarchy.json` as new ZIP entries.
3. **Binary asset download**: collect image/font/background-image URLs within the scoped subtree, send them to background SW via message, have the SW `fetch()` each URL (CORS bypassed by `<all_urls>` permission), convert responses to `Uint8Array`, add as binary entries in fflate's ZIP file tree.
4. **Component hierarchy**: scan every element in the scoped subtree for framework-specific internal properties in priority order; build a JSON tree mirroring DOM nesting; write to `html/component-hierarchy.json`.

The Phase 1 ZIP scaffold (`html/`, `assets/`, etc.) and chunked IPC transport are already in place. Phase 3 populates what was left empty.

**Primary recommendation:** Implement as three additions to existing files: (a) `activatePicker()` method + overlay injected by `chrome.scripting.executeScript`; (b) `extractScopedHtml()` + `buildComponentHierarchy()` methods on `WebsiteAnalyzer`; (c) `fetchAssets(urls)` method on `MigrationAnalyzer` in background.js. No new files required.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.2 (already vendored) | ZIP binary entries for asset files | Already in use; `fflate.zipSync` accepts `Uint8Array` values directly for binary files |
| chrome.scripting | MV3 built-in | Inject picker overlay function into page | The only MV3-supported injection path; `<all_urls>` already declared |
| Fetch API | SW native | Fetch binary assets from background SW | SW context bypasses CORS; `response.arrayBuffer()` gives binary data |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.runtime.sendMessage | MV3 built-in | Picker -> popup communication after element lock | Preferred for small payloads (selector string, metadata); no chunking needed |
| chrome.tabs.sendMessage | MV3 built-in | Popup -> content script to activate/deactivate picker | Existing pattern in popup.js |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chrome.scripting.executeScript (function) | content_script manifest entry | Manifest entry loads on every page load; executeScript is on-demand — prefer on-demand for picker |
| Fetch in background SW | Fetch in content script | Content script fetches are subject to page CORS policy; SW with `<all_urls>` bypasses it — use SW |
| Sync fiber traversal (all nodes) | Async traversal with yield | Full subtree traversal on a large component is fast enough synchronously; keep simple |

**Installation:** No new packages required. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
No new files needed. All changes within existing three files:
```
background.js       # Add fetchAssets(urls), extend downloadAsZip() for scoped data
content.js          # Add activatePicker(), extractScopedHtml(), buildComponentHierarchy()
popup.js            # Add pickElement(), clearSelection(), extend startAnalysis() for scope
popup.html          # Add Pick Element button, selection summary panel (per UI-SPEC)
css/popup.css       # Add .btn-pick-element, .selection-summary, picker active state styles
```

### Pattern 1: Picker Overlay Injection

**What:** `chrome.scripting.executeScript` injects a self-contained overlay function into the active tab. The function creates a div covering the page, tracks `mouseover` to highlight targets, and on click locks the element and messages back the selector.

**When to use:** On "Pick Element" button click in popup. Remove overlay on click-to-select, Escape key press, or popup close/unload.

**Critical:** The injected function must be entirely self-contained — no references to outer scope variables (they cause `ReferenceError` in the injected context).

```javascript
// Source: chrome.scripting.executeScript documentation pattern
// In popup.js
async pickElement() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      // Everything inside func() is self-contained — no outer refs
      const overlay = document.createElement('div');
      overlay.id = '__gsd_picker_overlay__';
      // ... attach mouseover, click, keydown handlers
      document.body.appendChild(overlay);
    }
  });
}
```

**Cleanup requirement:** The overlay must be removed from the DOM when: (a) element is clicked to select, (b) Escape key pressed, (c) popup unloads. Use a `beforeunload` listener on the popup window to send a CANCEL_PICKER message.

### Pattern 2: Scoped HTML and Style Extraction

**What:** When a selector is provided, `WebsiteAnalyzer` uses `document.querySelector(selector)` to get the root element, then `element.querySelectorAll('*')` for the subtree. HTML is captured as `element.outerHTML`. Computed styles use the Phase 2 extraction logic but filtered to subtree elements only.

**When to use:** During `analyzeWebsite()` when `scopeSelector` is set. Falls back to full-page when `null`.

```javascript
// Scoped element iteration pattern
extractScopedComputedStyles(scopeSelector) {
  const root = scopeSelector
    ? document.querySelector(scopeSelector)
    : document.documentElement;
  const elements = root ? [root, ...root.querySelectorAll('*')] : [...document.querySelectorAll('*')];
  // reuse existing Phase 2 logic over `elements`
}
```

### Pattern 3: Binary Asset Fetch via Background SW

**What:** Content script collects asset URLs within the scoped subtree. Sends URL list to background SW via `sendChunked`. Background SW calls `fetch(url)`, converts to `Uint8Array`, returns array of `{ url, filename, data: Uint8Array }`. Background writes each file into `assets/` in the ZIP file tree.

**When to use:** In `downloadAsZip()` after all other data is assembled. Asset fetch happens in the background, not the content script.

```javascript
// Source: MDN Fetch API + fflate documentation
// In background.js
async fetchAssets(urls) {
  const results = [];
  const TIMEOUT_MS = 10000; // Claude's discretion: 10s timeout
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) {
        results.push({ url, error: `HTTP ${response.status}` });
        continue;
      }
      const buffer = await response.arrayBuffer();
      const data = new Uint8Array(buffer);
      const filename = this.extractFilename(url);
      results.push({ url, filename, data });
    } catch (err) {
      results.push({ url, error: err.name === 'AbortError' ? 'timeout' : err.message });
    }
  }
  return results;
}
```

**fflate binary entries:** Pass `Uint8Array` directly as the file value:
```javascript
// Source: fflate README — binary files use Uint8Array, text files use strToU8()
fileTree['assets/logo.png'] = assetData; // Uint8Array — NOT strToU8()
fileTree['assets/font.woff2'] = fontData; // Uint8Array
```

### Pattern 4: Component Hierarchy Detection

**What:** Walk the DOM subtree. For each element, try detection signals in priority order. Build a tree of `{ name, source, selector, children }` nodes.

**React fiber access (VERIFIED):**
The property key uses a dynamic `$`-suffixed format. Scan with `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`. The fiber node's `type` property holds the component function/class; use `type.displayName || type.name || null` for the component name. Walk `fiber.return` toward the root to find the nearest named component boundary.

```javascript
// Source: Multiple verified sources (LogRocket, React GitHub issues)
function getReactComponentName(el) {
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  if (!fiberKey) return null;
  let fiber = el[fiberKey];
  // Walk up fiber tree to find nearest named component
  while (fiber) {
    const type = fiber.type;
    if (typeof type === 'function' && (type.displayName || type.name)) {
      return type.displayName || type.name;
    }
    fiber = fiber.return;
  }
  return null;
}
```

**Vue detection (MEDIUM confidence — property names unverified from official docs):**
Vue 2 uses `el.__vue__`. Vue 3 uses `el.__vueParentComponent` (internal, not officially documented). The component name is at `el.__vueParentComponent?.type?.name || el.__vueParentComponent?.type?.__name`. Fallback: scan `Object.keys(el)` for keys starting with `__vue`.

```javascript
function getVueComponentName(el) {
  // Vue 3
  if (el.__vueParentComponent) {
    const type = el.__vueParentComponent.type;
    return type?.name || type?.__name || null;
  }
  // Vue 2
  if (el.__vue__) {
    return el.__vue__.$options?.name || null;
  }
  return null;
}
```

**Angular detection (MEDIUM confidence):**
Angular Ivy attaches `__ngContext__` to component host elements. Angular also exposes `window.ng.getComponent(el)` in development builds and as a global helper in production (via `@angular/core/global`). Use `window.ng?.getComponent?.(el)?.constructor?.name` as the cleanest path.

```javascript
function getAngularComponentName(el) {
  // Official Angular global utility (works in dev; may work in prod with Ivy)
  if (window.ng?.getComponent) {
    const instance = window.ng.getComponent(el);
    if (instance) return instance.constructor?.name || null;
  }
  // __ngContext__ fallback
  if (el.__ngContext__) {
    return el.__ngContext__?.constructor?.name || null;
  }
  return null;
}
```

**data-* attribute detection:**
```javascript
function getDataAttrComponentName(el) {
  return el.dataset.component
    || el.dataset.block
    || el.dataset.module
    || el.dataset.testid  // last resort — testids are often component names
    || null;
}
```

**BEM detection:**
Extract the block name from first BEM class found. BEM pattern: class matches `/^[a-z][a-z0-9-]*(__[a-z0-9-]+)?(--[a-z0-9-]+)?$/`.

```javascript
const BEM_BLOCK_RE = /^([a-z][a-z0-9-]*)(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?$/;
function getBemComponentName(el) {
  for (const cls of el.classList) {
    const m = cls.match(BEM_BLOCK_RE);
    if (m) return m[1]; // block name only
  }
  return null;
}
```

**Generated fallback (always fires):**
```javascript
function getGeneratedName(el) {
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/)[0]
    : '';
  return `${el.tagName.toLowerCase()}${cls}`;
}
```

### Pattern 5: CSS Selector Generation

**What:** Generate a unique CSS selector for each element in the component hierarchy to enable precise re-selection.

**Simple approach (sufficient for this use case):**
```javascript
function getCssSelector(el) {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).join('.')
    : '';
  return `${tag}${cls}`;
}
```

### Anti-Patterns to Avoid

- **Fetching assets from content script context:** Content scripts are subject to page CORS policy. Always route through background SW.
- **Injecting picker via content_scripts manifest key:** This loads on every page load. Use `chrome.scripting.executeScript` for on-demand injection.
- **Hardcoding `__reactFiber$randomsuffix`:** The suffix is randomized per React build. Always scan with `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`.
- **Using `element.outerHTML` for large pages in scoped mode:** Fine for scoped subtrees; full-page `document.documentElement.outerHTML` is already done in `extractHTMLContent()` — don't duplicate.
- **Blocking `downloadAsZip()` on serial asset fetches:** Use `Promise.all()` for parallel asset fetches to avoid timeouts on pages with many images.
- **Leaking overlay state:** If popup closes without explicit cleanup, the overlay stays on the page. Register `window.addEventListener('beforeunload', cleanup)` in popup.js.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP with binary files | Custom binary encoder | fflate 0.8.2 (already vendored) | Already handles Uint8Array values in file tree |
| CORS-free asset fetch | CORS proxy / `no-cors` mode | Background SW fetch with `<all_urls>` | Background already has the permission; `no-cors` mode returns opaque responses (no data access) |
| CSS selector uniqueness | Complex selector algorithm | Simple `#id` or `tag.class` | Full unique-selector generation is complex; tag+class is sufficient for LLM annotation purposes |
| Overlay z-index calculation | Dynamic z-index scanner | Hardcode `2147483647` (max safe int) | Always wins; UI-SPEC confirmed this value |

**Key insight:** Everything needed is already in the codebase or browser APIs. This phase is extension and integration, not new infrastructure.

---

## Common Pitfalls

### Pitfall 1: React Fiber Key Is Dynamic
**What goes wrong:** Code checks `el.__reactFiber` (no suffix) and always returns null on real React apps.
**Why it happens:** React randomizes the `$suffix` at build time to discourage reliance on internal APIs.
**How to avoid:** Always scan with `Object.keys(el).find(k => k.startsWith('__reactFiber$'))`.
**Warning signs:** Component hierarchy shows all elements as `"source": "generated"` on a known React page.

### Pitfall 2: Picker Overlay Z-Index Conflict
**What goes wrong:** Overlay appears behind site elements (modals, sticky headers) and cannot highlight them.
**Why it happens:** Site uses high z-index values.
**How to avoid:** Set overlay z-index to `2147483647`. Use `pointer-events: none` on the highlight div so mouse events pass through to the page — use a separate `mouseover` listener on `document` instead.
**Warning signs:** Cursor doesn't change to crosshair on parts of the page.

### Pitfall 3: Asset Filename Collisions
**What goes wrong:** Two different images both named `image.jpg` from different CDN paths — second overwrites first in ZIP.
**Why it happens:** Filenames extracted from URL paths are not globally unique.
**How to avoid:** Track seen filenames in a `Map`; on collision append counter: `image.jpg` → `image-1.jpg`. The counter format is Claude's discretion; simple numeric suffix is sufficient.
**Warning signs:** ZIP contains fewer asset files than expected.

### Pitfall 4: Content Script Not Injected When Picker Activates
**What goes wrong:** `chrome.scripting.executeScript` call succeeds but the overlay function errors because content.js was already injected and `WebsiteAnalyzer` class is already declared.
**Why it happens:** The guard `if (!window.WebsiteAnalyzer)` in content.js only protects the class declaration; picker overlay injection is a separate `executeScript` call and should be a separate function injection, not re-injecting content.js.
**How to avoid:** Inject the picker overlay as an inline function (not as a file) via `func:` parameter of `executeScript`. Never re-inject content.js.
**Warning signs:** Console error "WebsiteAnalyzer already defined" when picker is activated.

### Pitfall 5: Scoped Computed Styles Miss Inherited Properties
**What goes wrong:** Scoped output omits styles that are defined on ancestor elements outside the scope but inherited by scoped elements.
**Why it happens:** `getComputedStyle()` returns resolved values including inherited ones — this is actually the right behavior. The risk is the inverse: stripping "global" properties from element entries (Phase 2 behavior) may lose inherited values when the global baseline comes from outside the scope.
**How to avoid:** For scoped capture, do NOT subtract the global baseline when scoping — include all computed property values for scoped elements even if they match the page global. The LLM needs to reconstruct the component standalone.
**Warning signs:** Scoped output HTML renders with wrong font/color when loaded standalone.

### Pitfall 6: IPC Payload Size for Asset Manifest
**What goes wrong:** Asset manifest with binary `Uint8Array` data cannot be sent via `sendMessage` — structured clone does not handle Uint8Array over IPC to background efficiently for large files.
**Why it happens:** The IPC channel has a practical limit; large binary data causes timeouts or failures.
**How to avoid:** Do NOT send binary asset data back to content script or popup. Keep the fetch-and-ZIP step entirely in background.js. Content script sends only the URL list to background; background fetches, gets binaries, and adds them directly to the ZIP file tree. The `sendChunked()` transport is for JSON text payloads only.
**Warning signs:** Transfer failures on pages with many/large images.

---

## Code Examples

Verified patterns from official sources and codebase:

### Adding Binary Files to fflate ZIP
```javascript
// Source: fflate README (github.com/101arrowz/fflate) — verified
// Binary files use raw Uint8Array; text files use fflate.strToU8()
const fileTree = {
  'index.json': fflate.strToU8(JSON.stringify(indexData, null, 2)),  // text
  'html/index.html': fflate.strToU8(scopedHtml),                    // text
  'html/component-hierarchy.json': fflate.strToU8(JSON.stringify(hierarchy, null, 2)), // text
  'assets/logo.png': logoUint8Array,     // binary — raw Uint8Array, NOT strToU8()
  'assets/font.woff2': fontUint8Array,   // binary
};
const zipped = fflate.zipSync(fileTree, { level: 1 });
```

### Fetching Binary Asset in Background SW
```javascript
// Source: MDN Fetch API documentation — verified pattern
async function fetchBinaryAsset(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
```

### Picker Overlay via executeScript
```javascript
// Source: chrome.scripting.executeScript MV3 documentation pattern
// In popup.js — function body is self-contained (no outer variable refs)
await chrome.scripting.executeScript({
  target: { tabId: this.currentTab.id },
  func: () => {
    if (document.getElementById('__gsd_picker__')) return; // already active
    const overlay = document.createElement('div');
    overlay.id = '__gsd_picker__';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      zIndex: '2147483647',
      cursor: 'crosshair',
      background: 'transparent'
    });
    // highlight box follows cursor
    const highlight = document.createElement('div');
    highlight.id = '__gsd_highlight__';
    Object.assign(highlight.style, {
      position: 'fixed',
      pointerEvents: 'none',
      outline: '2px solid #2196f3',
      zIndex: '2147483647'
    });
    document.body.appendChild(highlight);
    document.body.appendChild(overlay);

    let currentTarget = null;
    overlay.addEventListener('mouseover', (e) => {
      // Use elementFromPoint under the overlay
      overlay.style.pointerEvents = 'none';
      currentTarget = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = '';
      if (currentTarget && currentTarget !== overlay && currentTarget !== highlight) {
        const rect = currentTarget.getBoundingClientRect();
        Object.assign(highlight.style, {
          top: rect.top + 'px', left: rect.left + 'px',
          width: rect.width + 'px', height: rect.height + 'px'
        });
      }
    });
    overlay.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!currentTarget) return;
      // Build selector from element
      const tag = currentTarget.tagName.toLowerCase();
      const cls = currentTarget.className && typeof currentTarget.className === 'string'
        ? '.' + currentTarget.className.trim().split(/\s+/)[0] : '';
      const selector = currentTarget.id ? `#${currentTarget.id}` : `${tag}${cls}`;
      chrome.runtime.sendMessage({
        action: 'ELEMENT_SELECTED',
        selector,
        outerHtml: currentTarget.outerHTML.slice(0, 500),
        childCount: currentTarget.children.length
      });
      // Cleanup
      overlay.remove(); highlight.remove();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.remove(); highlight.remove();
        chrome.runtime.sendMessage({ action: 'PICKER_CANCELLED' });
      }
    }, { once: true });
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `__reactInternalInstance$` prefix | `__reactFiber$` prefix | React 16 (Fiber rewrite) | Must scan for new prefix; old prefix returns nothing |
| Vue 2: `el.__vue__` | Vue 3: `el.__vueParentComponent` or `el.__vue__` | Vue 3.0 (2020) | Both patterns needed — mixed Vue 2/3 sites exist |
| `tabs.executeScript` (MV2) | `scripting.executeScript` (MV3) | Manifest V3 | Already using correct API (MV3 declared in manifest) |
| Background page (persistent) | Service worker (non-persistent) | MV3 | Keep-alive already handled via `chrome.alarms` (Phase 1) |

**Deprecated/outdated:**
- `__reactInternalInstance$`: Removed in React 16+; `__reactFiber$` is the replacement
- `chrome.tabs.executeScript`: Deprecated in MV3; project already uses `chrome.scripting.executeScript`

---

## Open Questions

1. **Vue 3 internal property name `__vueParentComponent` — needs in-page verification**
   - What we know: Vue 2 uses `__vue__` (verified). Vue 3 devtools source references `__vueParentComponent` and `__vue_app__` but no official docs confirm these for all builds.
   - What's unclear: Whether `__vueParentComponent` is present in production-minified Vue 3 builds, or only in development mode.
   - Recommendation: During implementation, test against a known Vue 3 production app. If `__vueParentComponent` is absent, fall back to scanning `Object.keys(el)` for any key starting with `__vue`. The `data-*` and BEM fallbacks still provide useful annotation.

2. **React fiber traversal depth limit**
   - What we know: Context.md marks traversal depth as Claude's discretion.
   - What's unclear: Deeply nested React trees (100+ fiber nodes) may cause performance issues in synchronous traversal.
   - Recommendation: Cap traversal at 20 fiber hops upward from the DOM element. Components not found within 20 hops fall through to next detection signal. This is conservative and covers virtually all real component nesting depths.

3. **Scoped computed styles — inherited vs. standalone baseline**
   - What we know: Phase 2 strips global-inherited properties from per-element entries to keep them lean.
   - What's unclear: Whether scoped capture should follow the same stripping logic (lean) or include full computed values (self-contained for reconstruction).
   - Recommendation: For scoped capture, write a `full: true` flag per element entry — do NOT subtract the global baseline. The LLM use case is reconstruction; missing inherited values break that use case.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no test infrastructure exists |
| Config file | None — Wave 0 must establish |
| Quick run command | `node --experimental-vm-modules node_modules/.bin/jest --testPathPattern=unit` (after Wave 0 setup) |
| Full suite command | `node --experimental-vm-modules node_modules/.bin/jest` (after Wave 0 setup) |

**Note:** The extension runs in a Chrome context; most logic is in vanilla JS functions that are testable in isolation with mocked browser APIs. A minimal Jest setup with `jest-chrome` or manual mocks covers unit-testable logic without needing a full browser.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCOPE-01 | Element picker activates, returns selector | manual-only | Manual: load extension, use picker on a test page | N/A — requires live browser |
| SCOPE-01 | `activatePicker()` sends correct message action | unit | `jest tests/unit/picker.test.js -t "activatePicker"` | Wave 0 |
| SCOPE-01 | Escape cancels picker without changing selection | manual-only | Manual: activate picker, press Escape | N/A — requires live browser |
| SCOPE-02 | ZIP contains all 6 subdirs + index.json | unit | `jest tests/unit/zip-structure.test.js` | Wave 0 |
| SCOPE-02 | index.json `scope.mode` = "element" when scoped | unit | `jest tests/unit/index-json.test.js -t "scope mode"` | Wave 0 |
| SCOPE-03 | `fetchAssets()` returns Uint8Array per URL | unit | `jest tests/unit/fetch-assets.test.js` | Wave 0 |
| SCOPE-03 | Failed fetch recorded in `failedAssets` | unit | `jest tests/unit/fetch-assets.test.js -t "failed"` | Wave 0 |
| SCOPE-03 | Filename collision resolved with counter suffix | unit | `jest tests/unit/fetch-assets.test.js -t "collision"` | Wave 0 |
| TRACK-02 | React fiber component name extracted correctly | unit | `jest tests/unit/component-hierarchy.test.js -t "react"` | Wave 0 |
| TRACK-02 | BEM fallback extracts block name from class | unit | `jest tests/unit/component-hierarchy.test.js -t "bem"` | Wave 0 |
| TRACK-02 | Generated fallback never omits a node | unit | `jest tests/unit/component-hierarchy.test.js -t "generated"` | Wave 0 |
| TRACK-02 | Hierarchy output shape has required keys | unit | `jest tests/unit/component-hierarchy.test.js -t "shape"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `jest tests/unit/ --passWithNoTests` (once tests exist)
- **Per wave merge:** `jest tests/unit/`
- **Phase gate:** All unit tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/component-hierarchy.test.js` — covers TRACK-02 (React fiber name extraction, BEM, data-attr, generated fallback, output shape)
- [ ] `tests/unit/fetch-assets.test.js` — covers SCOPE-03 (fetch success, HTTP error, timeout, filename collision)
- [ ] `tests/unit/zip-structure.test.js` — covers SCOPE-02 (ZIP directory layout, index.json shape)
- [ ] `tests/unit/index-json.test.js` — covers SCOPE-01/SCOPE-02 scope metadata shape
- [ ] `tests/setup/chrome-mock.js` — shared Chrome API mocks (`chrome.runtime.sendMessage`, `chrome.scripting.executeScript`, etc.)
- [ ] Framework install: `npm init -y && npm install --save-dev jest` — if jest not present; check `package.json` first

---

## Sources

### Primary (HIGH confidence)
- fflate README (github.com/101arrowz/fflate) — binary file entry pattern (Uint8Array), zipSync API
- MDN Fetch API documentation — `response.arrayBuffer()`, `AbortController` timeout pattern
- chrome.scripting.executeScript MV3 documentation — `func:` injection, self-contained function requirement
- chrome.runtime.onMessage / sendMessage — message passing pattern already established in codebase

### Secondary (MEDIUM confidence)
- [LogRocket: Deep dive into React Fiber](https://blog.logrocket.com/deep-dive-react-fiber/) — `__reactFiber$` prefix pattern, fiber node structure
- [GitHub reactjs/react.dev issue #288](https://github.com/reactjs/react.dev/issues/288) — undocumented nature of fiber property names confirmed
- [Angular getComponent API](https://angular.dev/api/core/globals/getComponent) — official Angular global utility for component detection from DOM
- [Angular __ngContext__ GitHub issue](https://github.com/angular/angular/issues/53990) — confirms `__ngContext__` on host elements
- [BEM methodology](https://getbem.com/naming/) + [BEM regex gist](https://gist.github.com/Potherca/f2a65491e63338659c3a0d2b07eee382) — BEM naming pattern and regex

### Tertiary (LOW confidence)
- Vue 3 `__vueParentComponent` property name — referenced in community sources and vue-dom-hints library but NOT confirmed by official Vue 3 documentation. Needs runtime verification.
- `vue-dom-hints` library (github.com/privatenumber/vue-dom-hints) — uses `__vms__` array pattern as alternative to `__vueParentComponent`; implementation detail only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fflate already vendored; Chrome APIs documented; no new dependencies
- Architecture: HIGH — all integration points are in existing code; patterns verified from codebase reading
- React fiber internals: MEDIUM — `__reactFiber$` prefix confirmed by multiple independent sources; dynamic suffix behavior confirmed; component name extraction from `type.displayName` is standard practice
- Vue 3 internals: LOW — `__vueParentComponent` not in official docs; needs runtime verification
- Angular internals: MEDIUM — `__ngContext__` confirmed by official Angular GitHub and angular.dev API docs
- Pitfalls: HIGH — derived from codebase analysis and Chrome extension architecture constraints

**Research date:** 2026-03-16
**Valid until:** 2026-04-16 (stable Chrome extension APIs, 30-day window)
