# LastTab Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Manifest V3 Chrome extension that navigates tab visit history back/forward via Alt+Z/Alt+X shortcuts and toolbar icon click, with global/per-window scope settings and en/zh i18n.

**Architecture:** A single Service Worker (`background.js`) maintains two independent history stacks (global + per-window) in `chrome.storage.session`, driven by `tabs.onActivated` events. User scope preference lives in `chrome.storage.local`. Options page is a standalone HTML page with `chrome.i18n` for all visible text.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript, `chrome.storage` / `chrome.tabs` / `chrome.windows` / `chrome.commands` / `chrome.i18n` APIs. No build tools.

**Spec:** `docs/superpowers/specs/2026-06-11-lasttab-chrome-extension-design.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `manifest.json` | MV3 config, permissions, commands, i18n refs, icons |
| `background.js` | History stack CRUD, event listeners, navigation |
| `options.html` | Settings page structure with `data-i18n` placeholders |
| `options.css` | Settings page layout and typography |
| `options.js` | Load/save settings, apply i18n to DOM |
| `_locales/en/messages.json` | English strings |
| `_locales/zh_CN/messages.json` | Simplified Chinese strings |
| `icons/icon16.png` | Toolbar icon |
| `icons/icon48.png` | Extensions management page icon |
| `icons/icon128.png` | Chrome Web Store icon |
| `README.md` | Install instructions and usage |

---

### Task 1: Extension Manifest

**Files:**
- Create: `manifest.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__",
  "version": "1.0.0",
  "default_locale": "en",
  "permissions": ["tabs", "storage"],
  "background": {
    "service_worker": "background.js"
  },
  "action": {
    "default_title": "__MSG_extName__",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "options_page": "options.html",
  "commands": {
    "go-back": {
      "suggested_key": {
        "default": "Alt+Z"
      },
      "description": "__MSG_commandGoBack__"
    },
    "go-forward": {
      "suggested_key": {
        "default": "Alt+X"
      },
      "description": "__MSG_commandGoForward__"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Verify manifest is valid JSON**

Run: `Get-Content manifest.json | ConvertFrom-Json`
Expected: outputs parsed object, no error

- [ ] **Step 3: Commit**

```powershell
git add manifest.json
git commit -m "feat: add MV3 manifest with commands and i18n hooks"
```

---

### Task 2: Placeholder Icons

**Files:**
- Create: `icons/icon16.png`
- Create: `icons/icon48.png`
- Create: `icons/icon128.png`

- [ ] **Step 1: Generate placeholder PNG icons via PowerShell**

Run from project root:

```powershell
Add-Type -AssemblyName System.Drawing

function New-IconPng($size, $path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(66, 133, 244))
  $fontSize = [math]::Max(8, [int]($size * 0.45))
  $font = New-Object System.Drawing.Font 'Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold
  $brush = [System.Drawing.Brushes]::White
  $text = 'LT'
  $sizeF = $g.MeasureString($text, $font)
  $x = ($size - $sizeF.Width) / 2
  $y = ($size - $sizeF.Height) / 2
  $g.DrawString($text, $font, $brush, $x, $y)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Item -ItemType Directory -Force -Path icons | Out-Null
New-IconPng 16  'icons/icon16.png'
New-IconPng 48  'icons/icon48.png'
New-IconPng 128 'icons/icon128.png'
```

Expected: three PNG files created under `icons/`

- [ ] **Step 2: Commit**

```powershell
git add icons/
git commit -m "feat: add placeholder extension icons"
```

---

### Task 3: Internationalization Messages

**Files:**
- Create: `_locales/en/messages.json`
- Create: `_locales/zh_CN/messages.json`

- [ ] **Step 1: Create English messages**

```json
{
  "extName": {
    "message": "LastTab"
  },
  "extDescription": {
    "message": "Navigate back and forward through your tab visit history, like an editor."
  },
  "commandGoBack": {
    "message": "Go back to previous tab"
  },
  "commandGoForward": {
    "message": "Go forward to next tab"
  },
  "optionsTitle": {
    "message": "LastTab Settings"
  },
  "optionsHistoryScopeTitle": {
    "message": "History Scope"
  },
  "optionsGlobal": {
    "message": "Global history (navigate across all windows)"
  },
  "optionsPerWindow": {
    "message": "Per-window history (navigate within current window only)"
  },
  "optionsShortcutsTitle": {
    "message": "Keyboard Shortcuts"
  },
  "optionsShortcutBack": {
    "message": "Go back: Alt+Z (default)"
  },
  "optionsShortcutForward": {
    "message": "Go forward: Alt+X (default)"
  },
  "optionsShortcutsLink": {
    "message": "Customize shortcuts in Chrome"
  },
  "optionsShortcutsHint": {
    "message": "Open chrome://extensions/shortcuts to change key bindings. If a shortcut does not work, check for conflicts with Chrome or other extensions."
  },
  "optionsIconTitle": {
    "message": "Toolbar Icon"
  },
  "optionsIconDesc": {
    "message": "Clicking the extension icon goes back to the previous tab."
  },
  "optionsSaved": {
    "message": "Settings saved."
  }
}
```

Save to `_locales/en/messages.json`.

- [ ] **Step 2: Create Chinese messages**

```json
{
  "extName": {
    "message": "LastTab"
  },
  "extDescription": {
    "message": "像编辑器一样在标签页访问历史中后退和前进。"
  },
  "commandGoBack": {
    "message": "后退到上一个标签页"
  },
  "commandGoForward": {
    "message": "前进到下一个标签页"
  },
  "optionsTitle": {
    "message": "LastTab 设置"
  },
  "optionsHistoryScopeTitle": {
    "message": "历史范围"
  },
  "optionsGlobal": {
    "message": "全局历史（可跨窗口导航）"
  },
  "optionsPerWindow": {
    "message": "按窗口独立（仅在当前窗口内导航）"
  },
  "optionsShortcutsTitle": {
    "message": "键盘快捷键"
  },
  "optionsShortcutBack": {
    "message": "后退：Alt+Z（默认）"
  },
  "optionsShortcutForward": {
    "message": "前进：Alt+X（默认）"
  },
  "optionsShortcutsLink": {
    "message": "在 Chrome 中自定义快捷键"
  },
  "optionsShortcutsHint": {
    "message": "打开 chrome://extensions/shortcuts 修改快捷键。若快捷键无效，请检查是否与浏览器或其他扩展冲突。"
  },
  "optionsIconTitle": {
    "message": "工具栏图标"
  },
  "optionsIconDesc": {
    "message": "点击扩展图标将后退到上一个标签页。"
  },
  "optionsSaved": {
    "message": "设置已保存。"
  }
}
```

Save to `_locales/zh_CN/messages.json`.

- [ ] **Step 3: Verify JSON validity**

Run:
```powershell
Get-Content _locales/en/messages.json | ConvertFrom-Json
Get-Content _locales/zh_CN/messages.json | ConvertFrom-Json
```
Expected: both parse without error

- [ ] **Step 4: Commit**

```powershell
git add _locales/
git commit -m "feat: add en and zh_CN i18n messages"
```

---

### Task 4: Background Service Worker — History Stack Core

**Files:**
- Create: `background.js`

- [ ] **Step 1: Create background.js with storage helpers and stack operations**

```javascript
const MAX_STACK_SIZE = 50;
const STORAGE_KEY = 'tabHistory';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { historyScope: 'global' };

let isNavigating = false;

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function getHistoryData() {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {
    global: { stack: [], pointer: -1 },
    perWindow: {}
  };
}

async function saveHistoryData(data) {
  await chrome.storage.session.set({ [STORAGE_KEY]: data });
}

function getActiveStack(data, windowId, scope) {
  if (scope === 'global') {
    return data.global;
  }
  const key = String(windowId);
  if (!data.perWindow[key]) {
    data.perWindow[key] = { stack: [], pointer: -1 };
  }
  return data.perWindow[key];
}

function isSameEntry(a, b) {
  return a && b && a.tabId === b.tabId && a.windowId === b.windowId;
}

function removeTabFromStack(stackData, tabId) {
  let removedBeforeOrAtPointer = 0;
  const newStack = [];
  for (let i = 0; i < stackData.stack.length; i++) {
    if (stackData.stack[i].tabId === tabId) {
      if (i <= stackData.pointer) {
        removedBeforeOrAtPointer++;
      }
      continue;
    }
    newStack.push(stackData.stack[i]);
  }
  stackData.stack = newStack;
  stackData.pointer -= removedBeforeOrAtPointer;
  if (stackData.pointer < -1) {
    stackData.pointer = -1;
  }
  if (stackData.pointer >= stackData.stack.length) {
    stackData.pointer = stackData.stack.length - 1;
  }
}

async function recordActivation(tabId, windowId) {
  if (isNavigating) {
    return;
  }

  const settings = await getSettings();
  const data = await getHistoryData();
  const stackData = getActiveStack(data, windowId, settings.historyScope);
  const entry = { tabId, windowId };
  const current = stackData.stack[stackData.pointer];

  if (isSameEntry(current, entry)) {
    return;
  }

  if (stackData.pointer < stackData.stack.length - 1) {
    stackData.stack = stackData.stack.slice(0, stackData.pointer + 1);
  }

  stackData.stack.push(entry);
  stackData.pointer = stackData.stack.length - 1;

  if (stackData.stack.length > MAX_STACK_SIZE) {
    const overflow = stackData.stack.length - MAX_STACK_SIZE;
    stackData.stack = stackData.stack.slice(overflow);
    stackData.pointer = stackData.stack.length - 1;
  }

  await saveHistoryData(data);
}

async function isEntryValid(entry) {
  try {
    await chrome.tabs.get(entry.tabId);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add background.js
git commit -m "feat: add history stack storage helpers in service worker"
```

---

### Task 5: Background Service Worker — Navigation and Event Listeners

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Append navigation, cleanup, and listener code to background.js**

Add below the existing code in `background.js`:

```javascript
async function navigate(direction) {
  let windowId;
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    windowId = win.id;
  } catch (err) {
    console.warn('LastTab: cannot get focused window', err);
    return;
  }

  const settings = await getSettings();
  const data = await getHistoryData();
  const stackData = getActiveStack(data, windowId, settings.historyScope);

  if (stackData.stack.length === 0) {
    return;
  }

  while (true) {
    const nextPointer = stackData.pointer + direction;
    if (nextPointer < 0 || nextPointer >= stackData.stack.length) {
      break;
    }

    const entry = stackData.stack[nextPointer];
    if (!(await isEntryValid(entry))) {
      stackData.stack.splice(nextPointer, 1);
      if (nextPointer <= stackData.pointer) {
        stackData.pointer--;
      }
      continue;
    }

    stackData.pointer = nextPointer;
    await saveHistoryData(data);

    isNavigating = true;
    try {
      await chrome.windows.update(entry.windowId, { focused: true });
      await chrome.tabs.update(entry.tabId, { active: true });
    } catch (err) {
      console.warn('LastTab: navigation failed', err);
    } finally {
      setTimeout(() => {
        isNavigating = false;
      }, 100);
    }
    return;
  }

  await saveHistoryData(data);
}

async function handleTabRemoved(tabId) {
  const data = await getHistoryData();
  removeTabFromStack(data.global, tabId);
  for (const key of Object.keys(data.perWindow)) {
    removeTabFromStack(data.perWindow[key], tabId);
  }
  await saveHistoryData(data);
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId)
    .then((tab) => recordActivation(activeInfo.tabId, tab.windowId))
    .catch((err) => console.warn('LastTab: onActivated error', err));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId).catch((err) => console.warn('LastTab: onRemoved error', err));
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'go-back') {
    navigate(-1).catch((err) => console.warn('LastTab: go-back error', err));
  } else if (command === 'go-forward') {
    navigate(1).catch((err) => console.warn('LastTab: go-forward error', err));
  }
});

chrome.action.onClicked.addListener(() => {
  navigate(-1).catch((err) => console.warn('LastTab: action click error', err));
});
```

- [ ] **Step 2: Load extension in Chrome for smoke test**

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**, select project root `lastTab/`
4. Open 3 tabs (A, B, C), click through A → B → C
5. Press **Alt+Z** twice — should land on tab A
6. Press **Alt+X** once — should land on tab B

Expected: back/forward navigation works; no errors in Service Worker console (`chrome://extensions` → LastTab → "Service worker")

- [ ] **Step 3: Commit**

```powershell
git add background.js
git commit -m "feat: add tab navigation, event listeners, and commands"
```

---

### Task 6: Options Page

**Files:**
- Create: `options.html`
- Create: `options.css`
- Create: `options.js`

- [ ] **Step 1: Create options.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LastTab</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <main class="container">
    <h1 data-i18n="optionsTitle"></h1>

    <section>
      <h2 data-i18n="optionsHistoryScopeTitle"></h2>
      <label class="radio-row">
        <input type="radio" name="historyScope" value="global" checked>
        <span data-i18n="optionsGlobal"></span>
      </label>
      <label class="radio-row">
        <input type="radio" name="historyScope" value="perWindow">
        <span data-i18n="optionsPerWindow"></span>
      </label>
    </section>

    <section>
      <h2 data-i18n="optionsShortcutsTitle"></h2>
      <p data-i18n="optionsShortcutBack"></p>
      <p data-i18n="optionsShortcutForward"></p>
      <p>
        <a href="chrome://extensions/shortcuts" data-i18n="optionsShortcutsLink"></a>
      </p>
      <p class="hint" data-i18n="optionsShortcutsHint"></p>
    </section>

    <section>
      <h2 data-i18n="optionsIconTitle"></h2>
      <p data-i18n="optionsIconDesc"></p>
    </section>

    <p id="status" class="status" hidden></p>
  </main>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create options.css**

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-size: 14px;
  color: #202124;
  background: #f8f9fa;
}

.container {
  max-width: 640px;
  margin: 32px auto;
  padding: 24px 28px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

h1 {
  margin: 0 0 24px;
  font-size: 22px;
}

h2 {
  margin: 0 0 12px;
  font-size: 16px;
}

section {
  margin-bottom: 24px;
}

section p {
  margin: 6px 0;
  line-height: 1.5;
}

.radio-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  cursor: pointer;
}

.hint {
  color: #5f6368;
  font-size: 13px;
}

.status {
  color: #188038;
  font-size: 13px;
}
```

- [ ] **Step 3: Create options.js**

```javascript
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { historyScope: 'global' };

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
  document.title = chrome.i18n.getMessage('optionsTitle') || 'LastTab';
}

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
  const radio = document.querySelector(`input[name="historyScope"][value="${settings.historyScope}"]`);
  if (radio) {
    radio.checked = true;
  }
}

async function saveSettings(historyScope) {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { historyScope }
  });
  const status = document.getElementById('status');
  status.textContent = chrome.i18n.getMessage('optionsSaved') || 'Saved.';
  status.hidden = false;
  setTimeout(() => {
    status.hidden = true;
  }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();
  loadSettings();

  document.querySelectorAll('input[name="historyScope"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        saveSettings(event.target.value);
      }
    });
  });
});
```

- [ ] **Step 4: Manual test options page**

1. Reload extension at `chrome://extensions`
2. Click LastTab **Details** → **Extension options**
3. Verify page shows localized text (matches Chrome UI language)
4. Switch radio to "Per-window", verify "Settings saved." / "设置已保存。" toast appears
5. Click shortcuts link — should open `chrome://extensions/shortcuts`

Expected: settings persist after page reload; UI text is localized

- [ ] **Step 5: Commit**

```powershell
git add options.html options.css options.js
git commit -m "feat: add localized options page with history scope setting"
```

---

### Task 7: README and Final Integration Test

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create README.md**

```markdown
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
```

- [ ] **Step 2: Run full manual test checklist**

Execute every item in the README checklist. Fix any failures before proceeding.

- [ ] **Step 3: Commit**

```powershell
git add README.md
git commit -m "docs: add README with install and test instructions"
```

---

## Spec Coverage Checklist

| Spec Requirement | Task |
|------------------|------|
| MV3 zero-build architecture | Task 1 |
| History stack in session storage | Task 4 |
| Global + per-window stacks | Task 4, 5 |
| onActivated write rules | Task 4 |
| Back/forward navigation | Task 5 |
| Cross-window focus | Task 5 |
| Tab close cleanup | Task 5 |
| Alt+Z / Alt+X commands | Task 1, 5 |
| Icon click = back | Task 5 |
| Options page scope setting | Task 6 |
| Shortcuts instructions + link | Task 6 |
| en / zh_CN i18n | Task 3, 6 |
| Error handling (try/catch, silent) | Task 4, 5 |
| Manual test plan | Task 5, 7 |

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks
2. **Inline Execution** — implement all tasks in this session with checkpoints

Which approach?
