# LastTab Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tab-history navigation deterministic across rapid input, multiple windows, scope changes, moved tabs, and extension startup, then make the options page report the real shortcut state.

**Architecture:** Keep the zero-build Manifest V3 extension, but route every history mutation through one Promise queue. Record real user visits into both the global and per-window histories, initialize missing histories from Chrome's active tabs, and treat navigation as a transaction whose pointer is committed only after Chrome activates the target successfully.

**Tech Stack:** Manifest V3, vanilla JavaScript, Chrome Extensions APIs, Node.js built-in `node:test` and `vm` modules.

## Global Constraints

- No build step or runtime dependencies.
- Preserve English and Simplified Chinese localization.
- History remains session-only and limited to 50 entries per stack.
- Do not use the brainstorm workflow; the recovered conversation is reference material only.

---

### Task 1: Background Test Harness and Serialized Mutations

**Files:**
- Create: `tests/background.test.js`
- Modify: `background.js`

**Interfaces:**
- Consumes: the existing service-worker event listeners and storage schema.
- Produces: `enqueueOperation(operation)`, with `recordActivation`, `navigate`, and cleanup functions returning queued Promises.

- [x] Write a VM-based Chrome API harness and failing tests showing that two concurrent activations retain both entries and two concurrent back commands move two positions.
- [x] Run `node --test tests/background.test.js` and verify both assertions fail against the current code.
- [x] Add a single Promise operation queue around every history read-modify-write transaction.
- [x] Re-run the tests and verify they pass without warnings.

### Task 2: Startup, Window Focus, and Dual Histories

**Files:**
- Modify: `tests/background.test.js`
- Modify: `background.js`

**Interfaces:**
- Produces: `initializeHistory()`, `recordEntryInStack(stackData, entry)`, and a `windows.onFocusChanged` listener.

- [x] Add failing tests proving startup seeds the focused tab, a focus-only window change is recorded, and every manual activation updates both global and per-window stacks.
- [x] Run the targeted tests and confirm the expected failures.
- [x] Query active tabs during worker initialization, seed only missing stacks, listen for window focus changes, and record manual activations into both histories.
- [x] Re-run the targeted and complete background suites.

### Task 3: Moved Tabs and Transactional Navigation

**Files:**
- Modify: `tests/background.test.js`
- Modify: `background.js`

**Interfaces:**
- Produces: `handleTabAttached(tabId, newWindowId)` and target-specific navigation suppression.

- [x] Add failing tests for a tab moved to another window, a closed/stale stored window, a failed `windows.update`, and an unrelated manual activation during programmatic navigation.
- [x] Confirm failures show stale `windowId`, premature pointer commits, or lost manual history.
- [x] Resolve the live tab before navigation, focus its current window, commit the pointer only after success, update global entries on `tabs.onAttached`, and remove moved tabs from obsolete per-window stacks.
- [x] Replace the global 100 ms suppression flag with matching tab/window suppression and re-run the full suite.

### Task 4: Options Page Shortcut State and Error Handling

**Files:**
- Create: `tests/options.test.js`
- Modify: `options.html`
- Modify: `options.js`
- Modify: `_locales/en/messages.json`
- Modify: `_locales/zh_CN/messages.json`

**Interfaces:**
- Consumes: `chrome.commands.getAll()` and `navigator.clipboard.writeText()`.
- Produces: actual shortcut labels, an unassigned state, and a copyable `chrome://extensions/shortcuts` address.

- [x] Add failing structural tests proving the page has no `href="chrome://..."`, exposes shortcut value elements, and includes localized copy/error messages.
- [x] Confirm the tests fail against the current page.
- [x] Render actual command bindings, replace the internal-page link with a copy button, set `document.documentElement.lang`, and catch load/save/copy errors.
- [x] Run the options and background suites.

### Task 5: Manifest, Documentation, and Verification

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`

**Interfaces:**
- Produces: a Chrome 102+ manifest with only the required `storage` permission and an updated manual test checklist.

- [x] Add tests/checks for `minimum_chrome_version`, the reduced permission list, JSON parsing, and JavaScript syntax.
- [x] Remove the unused `tabs` permission, declare Chrome 102 as the minimum, and document session lifetime and the new edge-case tests.
- [x] Run `node --test tests/*.test.js`, `node --check background.js`, `node --check options.js`, JSON parse checks, and `git diff --check`.
- [x] Inspect the final diff and confirm no unrelated untracked files were added.
