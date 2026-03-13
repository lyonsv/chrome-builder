# Technology Stack

**Analysis Date:** 2026-03-13

## Languages

**Primary:**
- JavaScript (ES2020+) - All extension logic: content scripts, service worker, popup, DevTools panel
- HTML5 - UI pages: `popup.html`, `devtools-panel.html`, `devtools.html`
- CSS3 - UI styling: `css/popup.css`, `css/devtools-panel.css`

**Secondary:**
- SVG - Extension icons: `icons/icon16.svg`, `icons/icon32.svg`, `icons/icon48.svg`, `icons/icon128.svg`
- Shell - Icon generation utility: `icons/create-icons.sh`

## Runtime

**Environment:**
- Chrome Browser (Manifest V3) - Primary runtime target
- Chromium-based browsers (Edge) - Compatible
- Firefox - Planned (requires Manifest V2 adaptation)

**Chrome Extension APIs used:**
- `chrome.webRequest` - Network request interception
- `chrome.debugger` - Chrome DevTools Protocol (CDP) integration
- `chrome.scripting` - Content script injection
- `chrome.storage.local` - Persistent data storage
- `chrome.downloads` - File download triggering
- `chrome.tabs` - Tab management and reload
- `chrome.devtools.panels` - DevTools panel registration
- `chrome.runtime` - Message passing between extension components

**Package Manager:**
- None - No Node.js build step; extension is loaded directly from source
- Lockfile: Not applicable

## Frameworks

**Core:**
- None - Vanilla JavaScript only; no UI framework (no React, Vue, etc.)

**Testing:**
- None detected - No test framework configured

**Build/Dev:**
- None - No build tooling (no webpack, Vite, Rollup, etc.)
- Development workflow: load unpacked extension directly in Chrome via `chrome://extensions/`

## Key Dependencies

**External Libraries:**
- None bundled - No third-party JS libraries are imported
- All functionality is implemented using native Browser APIs and Chrome Extension APIs

**Chrome Extension Manifest:**
- Manifest Version: 3
- Defined in: `manifest.json`

## Configuration

**Extension Manifest:**
- `manifest.json` - Defines permissions, entry points, icons, service worker, devtools page, web-accessible resources

**Permissions declared:**
- `activeTab`, `webRequest`, `downloads`, `scripting`, `storage`, `tabs`, `debugger`
- Host permissions: `<all_urls>` (required for cross-site network interception)

**Web Accessible Resources:**
- `injected.js` (referenced but not present in repo - potential gap)
- `local-analyzer.js`

**Build:**
- No build configuration files present
- Extension runs directly from source directory

## Platform Requirements

**Development:**
- Chrome Browser (any recent version supporting Manifest V3)
- No Node.js required
- No npm install required

**Production:**
- Chrome Web Store submission (planned)
- Load unpacked from source for local use
- Output files (`.json` analysis exports) are gitignored via `output*.json` and `migration-analysis-*.json` patterns

---

*Stack analysis: 2026-03-13*
