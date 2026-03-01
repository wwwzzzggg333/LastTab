
const DEFAULT_SHORTCUTS = {
  goBack:    { key: 'KeyZ', alt: true, ctrl: false, shift: false, meta: false },
  goForward: { key: 'KeyX', alt: true, ctrl: false, shift: false, meta: false }
};
let currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
let activeRecorder = null;
const KEY_DISPLAY_MAP = {
  'KeyA': 'A', 'KeyB': 'B', 'KeyC': 'C', 'KeyD': 'D', 'KeyE': 'E',
  'KeyF': 'F', 'KeyG': 'G', 'KeyH': 'H', 'KeyI': 'I', 'KeyJ': 'J',
  'KeyK': 'K', 'KeyL': 'L', 'KeyM': 'M', 'KeyN': 'N', 'KeyO': 'O',
  'KeyP': 'P', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyS': 'S', 'KeyT': 'T',
  'KeyU': 'U', 'KeyV': 'V', 'KeyW': 'W', 'KeyX': 'X', 'KeyY': 'Y',
  'KeyZ': 'Z',
  'Digit0': '0', 'Digit1': '1', 'Digit2': '2', 'Digit3': '3', 'Digit4': '4',
  'Digit5': '5', 'Digit6': '6', 'Digit7': '7', 'Digit8': '8', 'Digit9': '9',
  'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4', 'F5': 'F5', 'F6': 'F6',
  'F7': 'F7', 'F8': 'F8', 'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
  'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
  'Space': 'Space', 'Enter': 'Enter', 'Escape': 'Esc', 'Tab': 'Tab',
  'Backspace': 'Backspace', 'Delete': 'Delete', 'Home': 'Home', 'End': 'End',
  'PageUp': 'PageUp', 'PageDown': 'PageDown',
  'BracketLeft': '[', 'BracketRight': ']', 'Backslash': '\\',
  'Semicolon': ';', 'Quote': "'", 'Comma': ',', 'Period': '.', 'Slash': '/',
  'Minus': '-', 'Equal': '=', 'Backquote': '`',
};
function formatShortcut(sc) {
  if (!sc || !sc.key) return '未设置';
  const parts = [];
  if (sc.ctrl) parts.push('Ctrl');
  if (sc.alt) parts.push('Alt');
  if (sc.shift) parts.push('Shift');
  if (sc.meta) parts.push('Meta');
  parts.push(KEY_DISPLAY_MAP[sc.key] || sc.key);
  return parts.join(' + ');
}
function updateDisplay() {
  document.getElementById('shortcut-back').textContent = formatShortcut(currentShortcuts.goBack);
  document.getElementById('shortcut-forward').textContent = formatShortcut(currentShortcuts.goForward);
}
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
function isModifierOnly(code) {
  return ['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight',
          'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(code);
}
function startRecording(element, shortcutKey) {
  if (activeRecorder) {
    stopRecording();
  }

  activeRecorder = { element, shortcutKey };
  element.textContent = '请按下快捷键...';
  element.classList.add('recording');

  function onKeyDown(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.code === 'Escape') {
      stopRecording();
      return;
    }

    if (isModifierOnly(e.code)) return;

    const hasModifier = e.altKey || e.ctrlKey || e.shiftKey || e.metaKey;
    if (!hasModifier) {
      showToast('请至少使用一个修饰键（Ctrl/Alt/Shift）');
      return;
    }

    currentShortcuts[shortcutKey] = {
      key: e.code,
      alt: e.altKey,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      meta: e.metaKey
    };

    stopRecording();
    updateDisplay();
  }

  element._keyHandler = onKeyDown;
  document.addEventListener('keydown', onKeyDown, true);
}
function stopRecording() {
  if (!activeRecorder) return;
  const { element } = activeRecorder;
  element.classList.remove('recording');
  if (element._keyHandler) {
    document.removeEventListener('keydown', element._keyHandler, true);
    element._keyHandler = null;
  }
  activeRecorder = null;
  updateDisplay();
}
function loadSettings() {
  chrome.storage.sync.get('shortcuts', (data) => {
    if (data.shortcuts) {
      currentShortcuts = { ...DEFAULT_SHORTCUTS, ...data.shortcuts };
    }
    updateDisplay();
  });
}
function saveSettings() {
  chrome.storage.sync.set({ shortcuts: currentShortcuts }, () => {
    showToast('设置已保存');
  });
}
function resetSettings() {
  currentShortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
  updateDisplay();
  chrome.storage.sync.set({ shortcuts: currentShortcuts }, () => {
    showToast('已恢复默认设置');
  });
}
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  document.getElementById('shortcut-back').addEventListener('click', function () {
    startRecording(this, 'goBack');
  });

  document.getElementById('shortcut-forward').addEventListener('click', function () {
    startRecording(this, 'goForward');
  });

  document.getElementById('btn-save').addEventListener('click', saveSettings);
  document.getElementById('btn-reset').addEventListener('click', resetSettings);

  document.getElementById('btn-chrome-shortcuts').addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
});
