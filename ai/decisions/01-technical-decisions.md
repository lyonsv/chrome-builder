# Technical Decisions Log

**Date**: 2026-02-16

## Key Technical Decisions

### 1. Chrome Extension Manifest Version
**Decision**: Use Manifest V3
**Rationale**:
- Required for new extensions in Chrome Web Store
- Better security model with service workers
- Future-proof approach

### 2. Architecture Pattern
**Decision**: Multi-component architecture
**Components**:
- **Content Script**: DOM analysis, asset discovery
- **Service Worker**: Network interception, background processing
- **DevTools Panel**: Advanced network capture
- **Popup**: User interface and controls

**Rationale**: Separates concerns and leverages Chrome's security model

### 3. Asset Discovery Strategy
**Decision**: Multi-layered approach
**Methods**:
1. **DOM Parsing**: Extract linked resources from HTML
2. **Computed Styles**: Get actual CSS files and inline styles
3. **Network Monitoring**: Capture dynamically loaded assets
4. **Resource Timing API**: Get performance data

**Rationale**: Ensures comprehensive asset capture including dynamic content

### 4. Network Request Capture
**Decision**: Dual approach - webRequest API + DevTools Protocol
**Implementation**:
- **webRequest API**: Basic request/response capture
- **DevTools Protocol**: Detailed timing, headers, payload

**Rationale**: webRequest has limitations, DevTools provides richer data

### 5. Third-Party Service Detection
**Decision**: Pattern-based detection with extensible ruleset
**Method**:
- Domain pattern matching
- Script signature detection
- Network request analysis
- Known service fingerprinting

**Rationale**: Allows for accurate identification and easy updates

### 6. File Organization
**Decision**: Structured directory approach
**Benefits**:
- Clear separation of asset types
- Easy navigation for developers
- Consistent naming conventions
- Metadata preservation

### 7. Framework Detection
**Decision**: Multi-signal approach
**Signals**:
- Global variables (React, Vue, Angular)
- DOM attributes (data-reactroot, v-cloak)
- Script analysis
- Build tool artifacts

**Rationale**: Single-signal detection is unreliable

## Risks and Mitigations

### Risk 1: CORS and Content Security Policy
**Mitigation**: Use chrome.scripting API with proper permissions

### Risk 2: Dynamic Content Loading
**Mitigation**: Implement delay mechanisms and MutationObserver

### Risk 3: Large Asset Files
**Mitigation**: Implement size limits and user confirmation

### Risk 4: Rate Limiting
**Mitigation**: Implement request throttling and retry logic