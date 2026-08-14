# LastTab

Chrome extension to navigate back and forward through tab visit history, similar to editor navigation.

## Features

- **Alt+Z** — go back to previous tab
- **Alt+X** — go forward to next tab
- **Toolbar icon click** — go back
- **Global or per-window** history scope (configurable in options)
- **Cross-window tracking** — focusing another Chrome window records its active tab
- **Live shortcut status** — options show the shortcuts currently assigned by Chrome
- **English / 简体中文** — follows Chrome browser language

## Install (Development)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

## Customize Shortcuts

Open `chrome://extensions/shortcuts` and find **LastTab** to change key bindings.

Chrome does not allow extension pages to link directly to `chrome://` pages. The options page provides a button that copies this address so you can paste it into Chrome's address bar.

## Settings

Right-click the extension icon → **Options**, or open from `chrome://extensions` → LastTab → **Extension options**.

## History Lifetime

Tab history is kept in `chrome.storage.session`. It survives extension Service Worker suspension, but is cleared when Chrome restarts or when the extension is reloaded, updated, disabled, or removed. Existing active tabs are used to seed a fresh history after startup.

## Automated Tests

Run the dependency-free Node.js test suite:

```powershell
node --test tests/*.test.js
```

## CI Package

Every push and pull request runs the tests and builds an installable `lastTab.zip` with GitHub Actions. You can also start the workflow manually, then download the `lastTab-extension` artifact from the workflow run.

Build the same archive locally with PowerShell:

```powershell
./scripts/package-extension.ps1
```

## Manual Test Checklist

- [ ] Switch tabs A → B → C, Alt+Z goes to B then A, Alt+X goes forward
- [ ] After going back, switch to new tab D — Alt+X does not return to C (forward history truncated)
- [ ] Close a tab in history, Alt+Z skips it
- [ ] Global mode: two windows, Alt+Z crosses window boundary
- [ ] Focus another Chrome window without changing its active tab, then Alt+Z returns to the previous window
- [ ] Per-window mode: Alt+Z stays within current window
- [ ] Switch global → per-window → global; both histories remain usable
- [ ] Drag a historical tab to another window; navigation follows the moved tab
- [ ] Press Alt+Z twice quickly; history moves back two entries
- [ ] Toolbar icon click = go back
- [ ] Chrome language en/zh — options page text matches
- [ ] Custom or unassigned shortcuts are reflected on the options page
