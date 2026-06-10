# LastTab

Chrome extension to navigate back and forward through tab visit history, similar to editor navigation.

## Features

- **Alt+Z** — go back to previous tab
- **Alt+X** — go forward to next tab
- **Toolbar icon click** — go back
- **Global or per-window** history scope (configurable in options)
- **English / 简体中文** — follows Chrome browser language

## Install (Development)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder

## Customize Shortcuts

Open `chrome://extensions/shortcuts` and find **LastTab** to change key bindings.

## Settings

Right-click the extension icon → **Options**, or open from `chrome://extensions` → LastTab → **Extension options**.

## Manual Test Checklist

- [ ] Switch tabs A → B → C, Alt+Z goes to B then A, Alt+X goes forward
- [ ] After going back, switch to new tab D — Alt+X does not return to C (forward history truncated)
- [ ] Close a tab in history, Alt+Z skips it
- [ ] Global mode: two windows, Alt+Z crosses window boundary
- [ ] Per-window mode: Alt+Z stays within current window
- [ ] Toolbar icon click = go back
- [ ] Chrome language en/zh — options page text matches
- [ ] Custom shortcut in `chrome://extensions/shortcuts` works
