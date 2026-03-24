# Phase 1: Infrastructure Foundation - Research

**Researched:** 2026-03-13
**Domain:** Chrome Extension MV3 reliability — service worker keep-alive, chunked IPC, ZIP packaging, codebase sanitization
**Confidence:** HIGH (core claims verified against official Chrome docs and fflate repo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Service Worker Recovery**
- Strategy: Both prevent AND recover — use `chrome.alarms` to ping the SW every ~20s during active analysis (prevents dormancy), AND checkpoint progress to `chrome.storage.session` for recovery if it still dies
- Checkpoint granularity: Per-stage (after each major stage completes: DOM capture, style extraction, network capture, etc.) — resume from the last completed stage, not from scratch
- On popup reopen after SW restart: Show a brief dismissable "Analysis resumed from checkpoint" notice, then auto-continue — no user decision required

**ZIP Library**
- Library: fflate (preferred: ~35KB, pure-JS, fastest, service-worker compatible)
- Inclusion: Vendor file — commit as `/vendor/fflate.min.js`, import via `importScripts()` in background.js. No inlining.
- Replace old download: Remove the single-JSON `chrome.downloads` path entirely — ZIP is the only output from Phase 1 forward. No fallback.
- ZIP directory structure: Pre-scaffold the final layout from Phase 1: `index.json` at root + empty `/html`, `/css`, `/computed-styles`, `/assets`, `/network`, `/tracking` subdirs. Phase 1 populates what exists; later phases fill the rest.

**Detection Cleanup (TRACK-03)**
- Scope: Remove the 2 named comment references (content.js:337, popup.js:484) AND audit all detection logic to ensure no site names appear in string literals, regexes, or conditions anywhere in the codebase
- Detection approach: Observable signals only — detect by global variables (e.g. `window.__MF_REMOTES__`), DOM attributes, script URL patterns, and data structures. No site-name wrapping conditions.
- istocksource.html: Remove or rename to a generic name (e.g. `test-page.html`) — it's in the public repo and violates the generic-only rule

**IPC Chunked Transport**
- Failure handling: Retry failed chunks — each chunk requires an ack; if no ack within timeout, resend that chunk. After N retries exhausted, surface an error to the user.
- Chunk sizing: Dynamic / auto-sized — start at a sensible default (researcher to determine safe default based on Chrome IPC limits), back off to smaller chunks if errors occur
- Progress display: Show transfer progress in the popup status bar during large transfers (e.g. "Transferring data... 3 / 12 chunks")
- Exhausted retry error: Show "Transfer failed after N retries — the page may be too large." with a [Retry Analysis] button that starts fresh

### Claude's Discretion
- Exact chunk retry count (3 is reasonable) and timeout values
- Alarm interval for SW keep-alive (20s suggested)
- Exact error messages and copy
- Storage key naming conventions for checkpoints
- Whether to preserve `output.json` in repo as a gitignored sample or delete it

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Extension maintains analysis session across service worker dormancy events without data loss (long-lived port or `storage.session` flush) | chrome.alarms (30s min interval, Chrome 120+) + chrome.storage.session (10 MB quota, survives SW restart) provide the two-layer prevent+recover strategy |
| INFRA-02 | Large payloads (computed styles) are transported from content script to popup/background via chunked streaming rather than a single `sendMessage` call, staying under the ~5–10MB IPC limit | Official Chrome docs confirm 64 MiB hard limit; chunking at ~512 KB default (backoff to smaller) enables progress display and retry granularity |
| INFRA-03 | Output directory is packaged as a single ZIP download (using a pure-JS library, no build system) rather than one OS dialog per file | fflate 0.8.2 (UMD build ~31 KB uncompressed) loads via `importScripts()` in the SW; `zipSync()` accepts nested object file trees; `chrome.downloads` accepts data: URLs from the SW |
| TRACK-03 | All detection logic is expressed as generic observable patterns with no hardcoded site names in the codebase | Audit confirms 2 comment references (content.js:337, popup.js:484) + istocksource.html + output.json with Shutterstock URLs — all must be removed or genericized |
</phase_requirements>

---

## Summary

Phase 1 establishes four reliability primitives that all later work depends on. Three are runtime reliability concerns (SW keep-alive, chunked IPC, ZIP download) and one is a codebase hygiene concern (removing hardcoded site names).

The Chrome MV3 service worker termination rules are well-understood: 30 seconds of inactivity kills the SW (Chrome 110+ removed the old 5-minute hard cap, but the 30s idle rule remains). The two-layer strategy — `chrome.alarms` firing every 20–25 seconds to reset the idle timer, plus `chrome.storage.session` checkpoints persisted after each analysis stage — provides both prevention and recovery. The `chrome.alarms` minimum interval is 30 seconds (Chrome 120+), so a 20s alarm must be scheduled as `periodInMinutes: 0.5` (the minimum), which fires every 30 seconds. The debugger session the extension already attaches (`chrome.debugger.attach`) actually keeps the SW alive per Chrome 118+ behaviour — this is a useful natural keep-alive during active analysis, but alarms remain necessary for stages where the debugger is not attached.

For IPC transport, the official Chrome limit is 64 MiB per message (not the commonly-cited 32 MB from older community posts). The computed-style payloads are 2–5 MB — well below the raw limit — but chunking is still required by the design decision to show progress and enable per-chunk retry. A default chunk size of 512 KB with binary exponential backoff (256 KB, 128 KB) on errors is the recommended approach. Messages use `chrome.runtime.sendMessage` with an explicit ack response from the receiver before the next chunk is sent.

fflate 0.8.2 is the correct library choice: the UMD build (~31 KB unzipped, ~11.5 KB gzipped) is loaded once via `importScripts('/vendor/fflate.min.js')` in background.js and exposes a global `fflate` object. The `zipSync()` API accepts a nested plain-object file tree and returns a `Uint8Array` that is converted to a base64 data URL for `chrome.downloads.download()`. No build system or bundler is needed.

**Primary recommendation:** Implement in four discrete areas: (1) SW keep-alive + session checkpoints in background.js, (2) chunked message protocol across content.js/background.js/popup.js, (3) replace `downloadAnalysisPackage()` with fflate ZIP assembly, (4) scrub all hardcoded site names and rename/remove istocksource.html.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fflate | 0.8.2 | Synchronous ZIP creation in the service worker | Pure JS, no build system, ~11.5 KB gzipped, fastest benchmark, UMD loads via importScripts |
| chrome.alarms | MV3 built-in | SW keep-alive ping every 30s | Only API that fires reliably while SW is dormant |
| chrome.storage.session | MV3 built-in | In-memory checkpoint across SW restarts | Persists for browser session duration; 10 MB quota; SW can read on restart |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chrome.storage.local | MV3 built-in | Fallback for `output.json` gitignore decision | If session storage quota is a concern for very large checkpoints |
| chrome.downloads | MV3 built-in | Trigger single ZIP download | Already in manifest permissions; accepts data: URL from SW |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fflate | JSZip | JSZip is ~100 KB; no meaningful advantage; fflate is faster and smaller |
| fflate | client-zip | client-zip is streaming-focused, more complex API; overkill for sync use case |
| chrome.alarms | Long-lived port to popup | Popup can be closed; alarm fires even if popup is not open |
| chrome.storage.session | chrome.storage.local | session is cleared on browser restart (expected); local persists across restarts (may leave stale checkpoints) |

**Installation:**
```bash
# No npm install — fflate UMD is vendored directly
# Download from: https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
# Save to: /vendor/fflate.min.js
```

---

## Architecture Patterns

### Recommended Project Structure
```
chrome-builder/
├── background.js          # SW: add keep-alive, checkpoints, ZIP assembly
├── content.js             # Page context: add chunked sender
├── popup.js               # UI: add chunked receiver, progress bar, checkpoint notice
├── vendor/
│   └── fflate.min.js      # fflate 0.8.2 UMD build (new)
├── test-page.html         # Renamed from istocksource.html (generic test fixture)
└── [istocksource.html]    # DELETE or rename
```

### Pattern 1: Service Worker Keep-Alive with Alarms

**What:** Register a named alarm on analysis start; remove it on analysis end. The alarm handler sends a no-op message to itself, resetting the 30-second idle timer.
**When to use:** Any time a long-running analysis sequence is active.

```javascript
// Source: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
// In background.js — start keep-alive
function startKeepAlive(tabId) {
  chrome.alarms.create(`keepalive_${tabId}`, { periodInMinutes: 0.5 }); // 30s minimum
}

// Alarm handler resets idle timer
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('keepalive_')) {
    // No-op — firing the alarm event itself resets the SW idle timer
    console.log('[SW keep-alive] ping');
  }
});

// On analysis end
function stopKeepAlive(tabId) {
  chrome.alarms.clear(`keepalive_${tabId}`);
}
```

### Pattern 2: Session Checkpoint (Prevent + Recover)

**What:** After each analysis stage completes, write the stage name and partial data to `chrome.storage.session`. On SW restart (popup opens and SW has no in-memory state), read the checkpoint and resume.
**When to use:** After each major analysis stage.

```javascript
// Source: https://developer.chrome.com/docs/extensions/reference/api/storage
// Write checkpoint after a stage completes
async function saveCheckpoint(tabId, stage, partialData) {
  const key = `checkpoint_${tabId}`;
  await chrome.storage.session.set({
    [key]: { stage, partialData, ts: Date.now() }
  });
}

// Read checkpoint on SW wake (called at SW startup)
async function loadCheckpoint(tabId) {
  const key = `checkpoint_${tabId}`;
  const result = await chrome.storage.session.get(key);
  return result[key] || null;
}

// Clear checkpoint when analysis completes or is cancelled
async function clearCheckpoint(tabId) {
  await chrome.storage.session.remove(`checkpoint_${tabId}`);
}
```

### Pattern 3: Chunked IPC Transport

**What:** Content script serializes payload to JSON string, splits into fixed-size string slices, and sends each slice as an individual `sendMessage` with a sequence number and total count. Background (or popup) acks each chunk before the sender sends the next. Receiver reassembles by ordering on sequence number.
**When to use:** Any payload exceeding a configurable threshold (recommended: 256 KB — start chunking well below the 64 MiB limit to enable progress display).

```javascript
// Source: Chrome Messaging docs — https://developer.chrome.com/docs/extensions/develop/concepts/messaging
// content.js — sender
const CHUNK_SIZE = 512 * 1024; // 512 KB default; back off on ack timeout
const MAX_RETRIES = 3;
const ACK_TIMEOUT_MS = 5000;

async function sendChunked(action, payload) {
  const json = JSON.stringify(payload);
  const totalChunks = Math.ceil(json.length / CHUNK_SIZE);
  const transferId = crypto.randomUUID();

  for (let i = 0; i < totalChunks; i++) {
    const chunk = json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    let attempt = 0;
    let acked = false;

    while (attempt < MAX_RETRIES && !acked) {
      try {
        const response = await Promise.race([
          chrome.runtime.sendMessage({
            action,
            transferId,
            chunkIndex: i,
            totalChunks,
            chunk
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('ACK timeout')), ACK_TIMEOUT_MS)
          )
        ]);
        if (response?.ack) acked = true;
      } catch {
        attempt++;
      }
    }

    if (!acked) throw new Error(`Transfer failed after ${MAX_RETRIES} retries`);
  }
}

// background.js or popup.js — receiver
const transfers = new Map(); // transferId -> { chunks: [], totalChunks }

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.transferId) {
    const { transferId, chunkIndex, totalChunks, chunk, action } = message;

    if (!transfers.has(transferId)) {
      transfers.set(transferId, { chunks: new Array(totalChunks), received: 0, action });
    }

    const transfer = transfers.get(transferId);
    transfer.chunks[chunkIndex] = chunk;
    transfer.received++;

    sendResponse({ ack: true }); // Ack this chunk

    if (transfer.received === totalChunks) {
      const fullPayload = JSON.parse(transfer.chunks.join(''));
      transfers.delete(transferId);
      handleCompletePayload(transfer.action, fullPayload);
    }
    return true;
  }
});
```

### Pattern 4: ZIP Assembly with fflate

**What:** Load fflate via `importScripts()` once in the SW. Build a plain-object file tree representing the ZIP directory structure. Call `zipSync()` to produce a `Uint8Array`. Convert to a base64 data URL for `chrome.downloads.download()`.
**When to use:** Replacing the existing `downloadAnalysisPackage()` in background.js.

```javascript
// Source: fflate README — https://github.com/101arrowz/fflate
// At top of background.js service worker:
importScripts('/vendor/fflate.min.js');
// fflate is now available as the global `fflate`

async function downloadAsZip(tabId, analysisData) {
  const domain = getDomain(analysisData.url);
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[^0-9]/g, '');

  // Build file tree — pre-scaffold final Phase 3 directory layout
  const fileTree = {
    'index.json': fflate.strToU8(JSON.stringify(analysisData.index, null, 2)),
    'html/':      {}, // empty dir placeholder — fflate needs a file to create dir
    'css/':       {},
    'computed-styles/': {},
    'assets/':    {},
    'network/':   {},
    'tracking/':  {},
  };

  // Populate what Phase 1 has
  if (analysisData.network) {
    fileTree['network/requests.json'] = fflate.strToU8(
      JSON.stringify(analysisData.network, null, 2)
    );
  }

  const zipped = fflate.zipSync(fileTree, { level: 1 }); // level 1 = fast, minimal CPU

  // Convert Uint8Array to base64 data URL (works in SW — no Blob URL)
  const base64 = uint8ArrayToBase64(zipped);
  const dataUrl = `data:application/zip;base64,${base64}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: `analysis-${domain}-${timestamp}.zip`,
    saveAs: false // no dialog per requirement
  });
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

### Anti-Patterns to Avoid

- **Using `setInterval` for SW keep-alive:** `setInterval` is destroyed when the SW terminates. If the SW dies, the interval is gone. Use `chrome.alarms` instead — alarms persist and wake the SW.
- **Storing full payload in chrome.storage.session for checkpoints:** The 10 MB quota is shared. Store only the stage name and minimal resume metadata (not the full 2–5 MB payload). Actual data lives in the SW's in-memory Map until download.
- **Using Blob URLs in the service worker:** Service workers cannot use `URL.createObjectURL()`. Use `data:` URLs instead (already done in existing `downloadAnalysisPackage()`).
- **Sending all chunks before waiting for acks:** Without ack-gating, the receiver Map can grow unboundedly if chunks arrive out of order or are lost. Always wait for each ack before sending the next chunk.
- **Nesting fflate directory objects without a file inside:** fflate requires at least one file inside a nested object for the directory to appear in the ZIP. Use a `.gitkeep`-style empty file or ensure every sub-directory has at least one entry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZIP creation | Custom zip encoder | fflate `zipSync()` | ZIP format has non-trivial CRC32, deflate, central directory header logic |
| Base64 from Uint8Array in SW | Custom encoder | `btoa(String.fromCharCode(...bytes))` + chunked approach for large buffers | Built-in; works in SW context |
| Chunk size discovery | Runtime binary search | Fixed default + linear backoff table | Chrome IPC limit is 64 MiB; 512 KB chunks are conservatively safe; no discovery needed |

**Key insight:** The ZIP format specification is deceptively complex (CRC32 checksums, multiple header types, UTF-8 filename encoding edge cases). fflate handles all of this correctly and has been battle-tested across millions of downloads.

---

## Common Pitfalls

### Pitfall 1: Alarm Minimum Interval (Chrome 120+)
**What goes wrong:** Setting `periodInMinutes` to a value less than 0.5 (30 seconds) silently coerces to 0.5 with a console warning. A developer expecting 20-second pings gets 30-second ones.
**Why it happens:** Chrome 120 changed the minimum from 1 minute to 30 seconds. Pre-120 the minimum was 1 minute.
**How to avoid:** Set `periodInMinutes: 0.5` explicitly. Accept that 30 seconds is the floor.
**Warning signs:** Console warning "Alarm delay is less than minimum of 0.5 minutes."

### Pitfall 2: chrome.storage.session Cleared on Browser Restart
**What goes wrong:** A checkpoint written during a session is gone after the user restarts Chrome.
**Why it happens:** `storage.session` is cleared on browser restart by design (also on extension reload/update).
**How to avoid:** This is acceptable behaviour for analysis checkpoints — if the browser restarts mid-analysis, the user must restart anyway. Document this in the "resumed from checkpoint" logic: only resume if checkpoint timestamp is recent (e.g., within 30 minutes).
**Warning signs:** Checkpoint key missing on SW startup, recovery code should silently start fresh.

### Pitfall 3: Large Checkpoint Data Fills storage.session Quota
**What goes wrong:** Storing full computed-style payload (2–5 MB) as a checkpoint alongside other keys causes quota errors.
**Why it happens:** `storage.session` has a 10 MB total quota across all keys.
**How to avoid:** Checkpoint only the stage name and a small resume-state object (tab ID, stage index, URL). Do NOT store the actual payload in session storage.
**Warning signs:** `chrome.storage.session.set()` rejects with quota error.

### Pitfall 4: btoa() Fails on Large Uint8Arrays (Stack Overflow)
**What goes wrong:** `btoa(String.fromCharCode(...uint8Array))` using spread syntax throws a "Maximum call stack size exceeded" error for ZIP files larger than ~500 KB.
**Why it happens:** Spreading a large array as function arguments overflows the JS call stack.
**How to avoid:** Use a loop-based implementation (see Code Examples) rather than spread syntax. Process the array in chunks of 8192 bytes.
**Warning signs:** RangeError: Maximum call stack size exceeded in the SW console.

### Pitfall 5: Popup Receives Chunk Messages Before Listener Is Ready
**What goes wrong:** If content.js starts sending chunks before popup.js has registered its `onMessage` listener, early chunks are lost and reassembly never completes.
**Why it happens:** The popup opens asynchronously; there is a race between the popup's DOMContentLoaded and the first chunk arriving.
**How to avoid:** Content script should wait for a "READY" ack from the popup before beginning chunked transmission. Route all large-payload messages through background.js (which is always alive) rather than directly to the popup.
**Warning signs:** Transfer hangs at chunk 0; no error, no progress.

---

## Code Examples

### Safe base64 Encoding for Large Uint8Array (SW-compatible)
```javascript
// Source: MDN + SW compatibility requirement (no Blob URL)
function uint8ArrayToBase64(bytes) {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
```

### fflate zipSync with Empty Directory Stubs
```javascript
// Source: fflate README — https://github.com/101arrowz/fflate
// fflate represents empty dirs with trailing slash keys + empty object value
const fileTree = {
  'index.json': fflate.strToU8(JSON.stringify(indexData)),
  'html/':             {}, // empty dir — fflate recognises trailing slash
  'css/':              {},
  'computed-styles/':  {},
  'assets/':           {},
  'network/':          { 'requests.json': fflate.strToU8(JSON.stringify(networkData)) },
  'tracking/':         {},
};
const zipped = fflate.zipSync(fileTree, { level: 1 });
```

### Checkpoint Read on SW Startup
```javascript
// Source: https://developer.chrome.com/docs/extensions/reference/api/storage
// Called at SW module scope (top level, runs on each SW wake)
async function checkForActiveAnalysis() {
  const all = await chrome.storage.session.get(null);
  const checkpointKeys = Object.keys(all).filter(k => k.startsWith('checkpoint_'));
  for (const key of checkpointKeys) {
    const cp = all[key];
    const ageMs = Date.now() - cp.ts;
    if (ageMs < 30 * 60 * 1000) { // Ignore checkpoints older than 30 minutes
      // Notify popup to show "Analysis resumed from checkpoint" notice
      notifyPopupOfResume(cp);
    } else {
      await chrome.storage.session.remove(key); // Stale — clean up
    }
  }
}
```

### Detection Pattern — Observable Only (no site names)
```javascript
// content.js — replace "like what we see in iStock" comment + pattern
// BEFORE (violates TRACK-03):
// // Component-based data architecture (like what we see in iStock)
// if (window.experiences && typeof window.experiences === 'object' && Object.keys(window.experiences).length > 10)

// AFTER (generic observable pattern only):
// Detect component experience registry (observable: global object with 10+ component keys)
if (window.experiences &&
    typeof window.experiences === 'object' &&
    Object.keys(window.experiences).length > 10) {
  // ...
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 5-minute hard SW timeout | 30s idle timeout (events reset it) | Chrome 110 (Feb 2023) | Long analyses CAN complete without alarms IF activity is continuous; alarms still needed for gaps |
| 1-minute minimum alarm | 30-second minimum alarm | Chrome 120 (Nov 2023) | Can ping every 30s instead of every 60s — tighter keep-alive window |
| No debugger keep-alive | `chrome.debugger` sessions keep SW alive | Chrome 118 (Oct 2023) | Extension's existing `chrome.debugger.attach()` call already provides natural SW keep-alive during debugger-active stages |
| `sendMessage` 32 MB (misreported) | 64 MiB confirmed limit | Official docs (current) | Single-message for 5 MB payload would work raw, but chunking is still required for progress UI |

**Deprecated/outdated:**
- "Keep a port open to popup to keep SW alive" pattern: Fragile — popup can be closed. Superseded by `chrome.alarms` + `chrome.debugger` built-in keep-alive.
- `output.json` in repo root: Contains Shutterstock URLs, violates TRACK-03. Delete or add to `.gitignore`.

---

## Open Questions

1. **Alarm interval vs debugger keep-alive overlap**
   - What we know: `chrome.debugger.attach()` keeps SW alive on Chrome 118+. The extension already attaches debugger at analysis start.
   - What's unclear: If the debugger stays attached for the full analysis, is the alarm redundant? Or does the debugger detach between stages?
   - Recommendation: Keep the alarm regardless. Defensive belt-and-suspenders approach. Detach timing is implementation-specific and may vary across Chrome versions.

2. **fflate `importScripts` in MV3 service worker**
   - What we know: UMD build exposes global `fflate`. `importScripts()` is supported in extension service workers in MV3 (it is NOT supported in web service workers, but extension SWs still support it).
   - What's unclear: Whether Chrome will deprecate `importScripts` in extension service workers in a future MV3 revision.
   - Recommendation: Use `importScripts('/vendor/fflate.min.js')` now — it works in current Chrome. If deprecated, the fallback is ES module import (`import * as fflate from './vendor/fflate.esm.js'`) with `"type": "module"` in the manifest background declaration.

3. **output.json disposition**
   - What we know: Contains Shutterstock page content — violates TRACK-03.
   - What's unclear: Whether it should be deleted entirely or gitignored as a sample.
   - Recommendation: Delete from the repo. The CONTEXT.md states this is Claude's discretion. A sample file with real site data is a liability; a generic fabricated sample would be better if one is ever needed.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in repo |
| Config file | None — see Wave 0 |
| Quick run command | `(none yet — Wave 0 creates infrastructure)` |
| Full suite command | `(none yet — Wave 0 creates infrastructure)` |

Given the no-build-system constraint (plain vanilla JS files, no npm, no bundler), the test framework must also be zero-dependency or runnable without a build step. Recommended: **none for this phase** — the four deliverables are best validated through manual integration testing and a Chrome extension load + smoke test. The CONTEXT.md does not call out automated testing as a deliverable.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| INFRA-01 | SW survives 35+ seconds of inactivity during analysis | Manual smoke | Automate with Puppeteer/Playwright + chrome extension loading; no unit test possible for SW lifecycle |
| INFRA-01 | Checkpoint written after each stage | Manual / console | Verify `chrome.storage.session` contents in SW DevTools |
| INFRA-01 | "Analysis resumed" notice shown on popup reopen | Manual smoke | Open popup, kill SW in chrome://serviceworker-internals, reopen popup |
| INFRA-02 | 3 MB payload transfers without error | Manual smoke | Use DevTools to inject large payload; verify transfer completes |
| INFRA-02 | Progress counter updates in popup status bar | Manual smoke | Visual check: "Transferring data... 3 / 12 chunks" |
| INFRA-02 | Failed chunk shows retry error + Retry Analysis button | Manual smoke | Simulate ack timeout by patching timeout to 1ms |
| INFRA-03 | Download produces a single .zip file | Manual smoke | Click download; verify OS saves one file |
| INFRA-03 | ZIP contains index.json + 6 subdirectory stubs | Manual / unzip | `unzip -l analysis-*.zip` |
| TRACK-03 | No site names in codebase | Automated grep | `grep -ri "istock\|getty\|shutterstock" . --include="*.js" --include="*.html"` |

### Sampling Rate
- Per task commit: Run the grep audit: `grep -ri "istock\|getty\|shutterstock" . --include="*.js" --include="*.html" --include="*.json" | grep -v ".planning" | grep -v "node_modules"`
- Per wave merge: Full manual smoke test — load extension in Chrome, run analysis on a known large page, verify ZIP download
- Phase gate: All manual smoke tests pass + grep returns zero matches before `/gsd:verify-work`

### Wave 0 Gaps
The grep audit command is the only automated check possible without a build system. No unit test files are needed for this phase because all four requirements are SW/DOM/IPC lifecycle concerns that cannot be exercised in a headless unit test environment without significant test infrastructure setup.

- [ ] `vendor/fflate.min.js` — download fflate 0.8.2 UMD build before fflate tasks begin
- [ ] `.gitignore` entry for `output.json` (or delete the file)

---

## Sources

### Primary (HIGH confidence)
- [Chrome extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — 30s idle termination, alarms minimum, debugger keep-alive
- [Chrome extension longer SW lifetimes blog](https://developer.chrome.com/blog/longer-esw-lifetimes) — Chrome 110 removal of 5-minute hard limit
- [chrome.storage API reference](https://developer.chrome.com/docs/extensions/reference/api/storage) — storage.session quota (10 MB), cleared-on-restart behaviour
- [Chrome extension messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging) — 64 MiB message limit (official), port vs sendMessage
- [fflate GitHub repo](https://github.com/101arrowz/fflate) — version 0.8.2, zipSync API, UMD bundle size (~31 KB uncompressed)

### Secondary (MEDIUM confidence)
- [fflate multi-file zip discussion #159](https://github.com/101arrowz/fflate/discussions/159) — nested object file tree syntax for zipSync
- [ext-send-chunked-message](https://github.com/abelozerov/ext-send-chunked-message) — community chunked IPC pattern; confirms 32 MB default chunk as ceiling, not floor

### Tertiary (LOW confidence — for awareness only)
- Various community posts on 30s alarm minimum (Chrome 120): confirmed by official alarms API reference
- Medium post on MV3 SW keep-alive patterns: patterns consistent with official docs but not independently verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — fflate version and API verified from GitHub; Chrome APIs from official docs
- Architecture: HIGH — all patterns derive from official Chrome extension documentation
- Pitfalls: MEDIUM–HIGH — btoa stack overflow is well-documented; alarm minimum verified in official docs; chunk race condition is a logical deduction from the protocol

**Research date:** 2026-03-13
**Valid until:** 2026-09-13 (stable Chrome APIs; fflate is mature; 6-month window reasonable)
