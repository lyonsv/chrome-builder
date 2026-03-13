# External Integrations

**Analysis Date:** 2026-03-13

## APIs & External Services

This extension does not itself call any external APIs or SaaS services. It is a tool that analyzes *other* websites' integrations. All network activity it generates is directed at the user's currently-active tab URL.

**Chrome DevTools Protocol (CDP):**
- Used via `chrome.debugger` API in `background.js`
- CDP version: `1.3` (hardcoded in `background.js` line 206)
- Domains enabled: `Network`, `Runtime`
- Purpose: Attach to tabs for advanced network monitoring beyond what `webRequest` provides

## Data Storage

**Databases:**
- None - No external database

**Local Storage:**
- `chrome.storage.local` - Used in `background.js` to persist analysis summaries
- Keys follow pattern: `analysis_{tabId}_{timestamp}`
- Stores only summary metadata (URL, title, counts) to avoid Chrome storage quota limits (~5MB)
- Full analysis data is held in-memory in the service worker's `Map` instances

**File Storage:**
- Local filesystem only - Analysis output saved via `chrome.downloads.download()` in `background.js`
- Output format: JSON file named `migration-analysis-{domain}-{timestamp}.json`
- User is prompted with `saveAs: true` to choose download location

**Caching:**
- In-memory only - `networkRequests` Map and `recentRequests` Map (rolling buffer of last 100 requests per tab) in `background.js`
- No persistent caching layer

## Authentication & Identity

**Auth Provider:**
- None - The extension requires no user authentication
- No login, no accounts, no tokens

## Monitoring & Observability

**Error Tracking:**
- None - No external error tracking service integrated

**Logs:**
- `console.log` / `console.error` / `console.warn` throughout all JS files
- Logs are visible in:
  - Chrome DevTools service worker console (for `background.js`)
  - Chrome DevTools page console (for `content.js`)
  - Extension popup DevTools (for `popup.js`)

## CI/CD & Deployment

**Hosting:**
- Chrome Web Store (planned - not yet published per README)
- Local unpacked load is the current distribution method

**CI Pipeline:**
- None detected - No CI configuration files present (`.github/`, `.circleci/`, etc.)

## Environment Configuration

**Required env vars:**
- None - This extension has no environment variables or secrets
- No `.env` files used in production operation

**Secrets location:**
- Not applicable - No secrets required

## Webhooks & Callbacks

**Incoming:**
- None - The extension does not expose any endpoints

**Outgoing:**
- None - The extension does not POST to any external service

## Third-Party Services Detected (on analyzed websites)

The extension's detection engine in `content.js` (`identifyThirdPartyServices()`) identifies the following categories of third-party integrations on scanned websites. This is the extension's *output capability*, not its own integrations:

**Analytics:**
- Google Analytics / Google Tag Manager
- Adobe Analytics
- Hotjar, Mixpanel, Segment

**Advertising:**
- Google Ads, Facebook Pixel, Amazon Advertising, Bing Ads

**Social Media:**
- Twitter, LinkedIn, Instagram, YouTube

**Customer Support:**
- Intercom, Zendesk, Freshdesk, Help Scout

**Payments:**
- Stripe, PayPal, Square, Braintree

**CDNs:**
- Cloudflare, AWS CloudFront, JSDelivr, unpkg, Bootstrap CDN, Google Fonts

**Email Marketing:**
- Mailchimp, Constant Contact, SendGrid

**Error Tracking (on target sites):**
- Sentry, Bugsnag, LogRocket

**Performance Monitoring (on target sites):**
- New Relic, DataDog

Detection is implemented via domain-pattern matching in `content.js` lines 424-477.

---

*Integration audit: 2026-03-13*
