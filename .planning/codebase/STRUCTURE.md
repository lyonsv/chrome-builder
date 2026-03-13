# Codebase Structure

**Analysis Date:** 2026-03-13

## Directory Layout

```
chrome-builder/                  # Project root
├── manifest.json                # Chrome Extension MV3 manifest (entry point declaration)
├── background.js                # Service worker — network capture & state management
├── content.js                   # Content script — DOM analysis in page context
├── popup.html                   # Popup UI shell
├── popup.js                     # Popup UI controller & analysis orchestration
├── local-analyzer.js            # CSP-bypass HTML fetcher/parser (loaded in popup)
├── devtools.html                # DevTools page shell (registers the panel)
├── devtools.js                  # DevTools page script — registers panel via devtools API
├── devtools-panel.html          # DevTools panel UI shell
├── devtools-panel.js            # DevTools panel controller
├── css/
│   ├── popup.css                # Styles for popup.html
│   └── devtools-panel.css       # Styles for devtools-panel.html
├── icons/
│   ├── icon16.svg               # Toolbar icon 16px
│   ├── icon32.svg               # Toolbar icon 32px
│   ├── icon48.svg               # Extension management icon 48px
│   ├── icon128.svg              # Chrome Web Store icon 128px
│   └── create-icons.sh          # Shell script to generate icon variants
├── src/                         # Empty — reserved, not yet used
├── ai/
│   └── decisions/               # AI-authored decision log (markdown files)
│       ├── 00-project-plan.md
│       ├── 01-technical-decisions.md
│       ├── 02-milestone-foundation.md
│       └── 03-milestone-completion.md
├── .planning/
│   └── codebase/                # GSD codebase mapping documents
├── .claude/                     # Claude Code config
├── output.json                  # Sample analysis output (4.2MB, not committed pattern)
├── test-page.html               # Static test page for local extension testing
├── minimal-test.html            # Minimal test page
├── debug-devtools.html          # Debug helper page for DevTools testing
├── istocksource.html            # Captured source HTML (test artifact, untracked)
├── module-federation-test.html  # Module federation test page (untracked)
├── README.md                    # Project documentation
└── LICENSE                      # License file
```

## Directory Purposes

**Root (flat JS files):**
- Purpose: All runtime extension scripts live at the root; Chrome MV3 requires direct paths in `manifest.json`
- Contains: Service worker, content script, popup script, devtools scripts, local analyzer
- Key files: `manifest.json`, `background.js`, `content.js`, `popup.js`, `popup.html`

**`css/`:**
- Purpose: Stylesheets for extension UI pages
- Contains: One CSS file per HTML page (`popup.css` for popup, `devtools-panel.css` for devtools panel)
- Key files: `css/popup.css`, `css/devtools-panel.css`

**`icons/`:**
- Purpose: SVG icons for all required Chrome extension icon sizes
- Contains: Four SVG files (16, 32, 48, 128px) plus a generation script
- Key files: `icons/icon16.svg`, `icons/icon32.svg`, `icons/icon48.svg`, `icons/icon128.svg`

**`src/`:**
- Purpose: Reserved directory — currently empty, no source files placed here yet
- Contains: Nothing
- Generated: No

**`ai/decisions/`:**
- Purpose: Decision log documenting architectural choices during development
- Contains: Numbered markdown files (00–03) covering project plan, technical decisions, and milestones
- Generated: No — authored artifacts, committed to repo

**`.planning/codebase/`:**
- Purpose: GSD codebase mapping documents consumed by plan-phase and execute-phase commands
- Contains: ARCHITECTURE.md, STRUCTURE.md, and other analysis docs
- Generated: Yes — by `/gsd:map-codebase` command

## Key File Locations

**Entry Points (declared in `manifest.json`):**
- `manifest.json`: Extension manifest; defines service worker, popup, devtools page, icons, permissions
- `background.js`: Service worker entry point; `MigrationAnalyzer` class instantiated at line 471
- `popup.html`: Popup shell; loads `local-analyzer.js` then `popup.js`
- `devtools.html`: DevTools page shell; loads `devtools.js` which registers the panel
- `devtools-panel.html`: DevTools panel shell; loads `devtools-panel.js`

**Web Accessible Resources (per `manifest.json`):**
- `local-analyzer.js`: Accessible to web pages; loaded inside popup context to parse fetched HTML
- Any file referenced in `"web_accessible_resources"` can be accessed from tab pages

**Core Logic:**
- `background.js`: Network capture, session state, download packaging
- `content.js`: DOM analysis, asset discovery, framework detection, service identification
- `popup.js`: Analysis orchestration, progress tracking, fallback analysis paths
- `local-analyzer.js`: Fetch-based HTML analysis fallback

**Styles:**
- `css/popup.css`: All styles for popup UI
- `css/devtools-panel.css`: All styles for DevTools panel UI

**Test/Debug Pages (not loaded by extension itself):**
- `test-page.html`: Used for manual local testing of content script behavior
- `minimal-test.html`: Stripped-down test page
- `debug-devtools.html`: Helper page for debugging the DevTools integration

## Naming Conventions

**Files:**
- HTML shells: `[context-name].html` (e.g., `popup.html`, `devtools-panel.html`)
- Scripts: `[context-name].js` (e.g., `popup.js`, `devtools-panel.js`, `background.js`)
- CSS: named after their corresponding HTML file, placed in `css/` (e.g., `css/popup.css`)
- Icons: `icon[size].svg` (e.g., `icon16.svg`, `icon128.svg`)

**Directories:**
- Lowercase, hyphenated (e.g., `chrome-builder`, `devtools-panel`)
- Functional grouping: `css/` for styles, `icons/` for images, `ai/decisions/` for docs

**Classes:**
- PascalCase singletons matching their context role: `MigrationAnalyzer`, `PopupController`, `WebsiteAnalyzer`, `LocalHTMLAnalyzer`, `DevToolsPanel`

**Message Actions:**
- SCREAMING_SNAKE_CASE strings: `START_ANALYSIS`, `GET_NETWORK_DATA`, `STORE_ANALYSIS`, `DOWNLOAD_PACKAGE`, `STOP_ANALYSIS`, `DEBUG_STATUS`, `ANALYZE_WEBSITE`

## Where to Add New Code

**New background capability (network/storage/download):**
- Add method to `MigrationAnalyzer` class in `background.js`
- Add a new `case` in the `switch` inside `handleMessage`

**New analysis capability that reads the DOM:**
- Add method to `WebsiteAnalyzer` class in `content.js`
- Call it from `analyzeWebsite()` — either in the `Promise.all` array (async) or after it (sync)

**New popup UI section:**
- Add HTML to `popup.html`
- Add element references in `PopupController.initializeElements()` in `popup.js`
- Add event listeners in `PopupController.setupEventListeners()`

**New DevTools panel feature:**
- Add HTML to `devtools-panel.html`
- Add logic to `DevToolsPanel` class in `devtools-panel.js`

**New stylesheet:**
- Add CSS file to `css/`
- Reference with `<link rel="stylesheet" href="css/[name].css">` in the corresponding HTML page

**New icon size:**
- Add SVG to `icons/`
- Reference in `manifest.json` under `"action".default_icon` and `"icons"`

**New test/debug page:**
- Add HTML file at root level
- These are not loaded by the extension; used for manual development testing only

## Special Directories

**`src/`:**
- Purpose: Intended future home for modular source code
- Generated: No
- Committed: Yes (empty directory tracked by git)
- Note: Currently unused — all source files are at root level

**`ai/decisions/`:**
- Purpose: Architecture decision records
- Generated: No
- Committed: Yes

**`.planning/`:**
- Purpose: GSD planning artifacts
- Generated: Partially (codebase docs auto-generated; phase plans written by AI)
- Committed: Yes

---

*Structure analysis: 2026-03-13*
