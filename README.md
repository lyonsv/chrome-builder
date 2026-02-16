# Website Migration Analyzer

A comprehensive Chrome extension for analyzing websites to support framework migrations. Captures assets, network traffic, SSR data structures, and third-party services to provide developers with complete migration context.

## 🎯 Features

### Core Analysis
- **📁 Asset Discovery**: Complete extraction of HTML, CSS, JavaScript, images, fonts, and other resources
- **🌐 Network Monitoring**: Captures API calls, GraphQL queries, and request patterns
- **📊 Next.js SSR Data**: Extracts `__NEXT_DATA__` with pageProps, API endpoints, and data structures
- **🔍 Framework Detection**: Identifies React, Vue, Angular, Next.js, Nuxt.js, and other frameworks
- **📈 Third-Party Analysis**: Detects and catalogs external services, CDNs, and integrations
- **📱 Screenshots**: Full-page visual documentation
- **🏗️ API Architecture**: Maps microservices, GraphQL endpoints, and REST APIs

### Advanced Capabilities
- **SSR Data Extraction**: Analyzes server-side rendered data for Next.js applications
- **GraphQL Discovery**: Finds GraphQL endpoints, queries, and Apollo cache structures
- **Entity Mapping**: Identifies data entities and relationships from SSR props
- **Real-time Monitoring**: Live network request capture with detailed logging
- **Page Reload Triggers**: Captures initial requests for SSR applications

## 🚀 Installation

### From Source
1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/website-migration-analyzer.git
   cd website-migration-analyzer
   ```

2. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the project directory
   - The extension icon will appear in your toolbar

### From Chrome Web Store
*Coming soon - extension will be published after review*

## 📖 Usage

### Basic Analysis
1. **Navigate** to the website you want to analyze
2. **Click** the extension icon in your toolbar
3. **Configure** analysis options:
   - ✅ Download Assets (HTML, CSS, JS, Images)
   - ✅ Capture Network Requests
   - ✅ Reload Page to Capture Initial Requests (Recommended for SSR sites)
   - ✅ Take Screenshot
   - ✅ Audit Third-Party Services
   - ✅ Detect Frameworks
4. **Click** "Start Analysis"
5. **Wait** for analysis completion
6. **Download** the comprehensive analysis package

### Next.js / SSR Applications
For server-side rendered applications, enable these options:
- ✅ **Reload Page to Capture Initial Requests** - Captures network traffic during fresh page load
- ✅ **Trigger Navigation** - Captures client-side requests during route changes

### Advanced Features
- **Debug Status**: Check service worker status and request capture statistics
- **Show All Requests**: View detailed list of captured network requests
- **DevTools Panel**: Advanced network monitoring with real-time request display

## 📊 Output Structure

The extension generates a comprehensive JSON analysis file:

```json
{
  "url": "https://example.com",
  "title": "Example Site",
  "assets": {
    "html": [/* HTML content */],
    "css": [/* Stylesheets */],
    "js": [/* JavaScript files */],
    "images": [/* Image assets */],
    "fonts": [/* Font files */],
    "other": [/* Other resources */]
  },
  "frameworks": [
    {
      "name": "Next.js",
      "confidence": 0.9
    }
  ],
  "thirdPartyServices": [
    {
      "name": "Google Analytics",
      "category": "Analytics",
      "urls": ["https://www.google-analytics.com/..."]
    }
  ],
  "nextJsData": {
    "hasNextData": true,
    "pageProps": {/* Server-side props */},
    "graphqlQueries": [/* Found GraphQL patterns */],
    "apiEndpoints": [/* Discovered API endpoints */],
    "dataStructure": {/* Entity analysis */}
  },
  "networkRequests": [
    {
      "url": "https://api.example.com/graphql",
      "method": "POST",
      "isGraphQL": true,
      "graphQLQuery": {/* Parsed query */}
    }
  ],
  "metadata": {/* SEO and page metadata */}
}
```

## 🎯 Use Cases

### Framework Migrations
- **React → Next.js**: Analyze current React app structure and data flow
- **Vue → Nuxt.js**: Understand component architecture and state management
- **Legacy → Modern**: Map existing functionality to modern framework patterns

### API Migrations
- **REST → GraphQL**: Discover existing API patterns and data relationships
- **Monolith → Microservices**: Map current service boundaries and dependencies
- **Data Architecture**: Understand current data structures and entity relationships

### Third-Party Audits
- **Service Inventory**: Complete catalog of external integrations
- **Performance Impact**: Identify heavy third-party dependencies
- **Security Review**: Map data sharing with external services

## 🔧 Technical Architecture

### Components
- **Content Script** (`content.js`): DOM analysis, asset discovery, Next.js data extraction
- **Background Service Worker** (`background.js`): Network request interception, data storage
- **Popup Interface** (`popup.js`, `popup.html`): User controls and status display
- **DevTools Panel** (`devtools-panel.js`): Advanced network monitoring

### Permissions Required
- `activeTab` - Access current page content
- `webRequest` - Network traffic interception
- `downloads` - Save analysis files
- `scripting` - Content script injection
- `storage` - Temporary data storage
- `tabs` - Page reload functionality
- `debugger` - Advanced network monitoring

### Browser Compatibility
- **Chrome**: Fully supported (Manifest V3)
- **Edge**: Compatible with Chromium-based versions
- **Firefox**: Requires Manifest V2 adaptation (planned)

### Project Structure
```
website-migration-analyzer/
├── manifest.json           # Extension configuration
├── popup.html             # Main UI interface
├── popup.js               # UI logic and controls
├── background.js          # Service worker (network monitoring)
├── content.js             # DOM analysis and SSR extraction
├── devtools.js            # DevTools integration
├── devtools-panel.js      # Advanced network monitoring
├── local-analyzer.js      # Alternative analysis engine
├── css/                   # Stylesheets
├── icons/                 # Extension icons
└── ai/decisions/          # Technical documentation
```

## 🛠️ Development

### Prerequisites
- Chrome Browser (for testing)
- Basic knowledge of Chrome Extension APIs
- Understanding of web development concepts

### Local Development
1. Make changes to source files
2. Reload extension in `chrome://extensions/`
3. Test on various websites
4. Check console logs for debugging

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

- **Bug Reports**: Use GitHub issues with detailed reproduction steps
- **Feature Requests**: Describe the use case and expected behavior
- **Code Contributions**: Follow existing code style and include tests
- **Documentation**: Help improve README and inline documentation

### Development Priorities
1. Firefox/Safari compatibility (Manifest V2 support)
2. Improved GraphQL schema introspection
3. Advanced data relationship mapping
4. Custom analysis rule configuration
5. Batch analysis for multiple pages

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Chrome DevTools Protocol documentation
- Next.js team for SSR architecture insights
- GraphQL community for query parsing techniques
- Open source contributors and testers

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/website-migration-analyzer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/website-migration-analyzer/discussions)
- **Documentation**: See `ai/decisions/` for technical deep-dives

---

**Built for developers migrating websites and applications to modern frameworks.**

This tool provides the comprehensive analysis needed to understand existing architectures and plan successful migrations to Next.js, Nuxt.js, or other modern frameworks with GraphQL APIs.