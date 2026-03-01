
const DEFAULT_SHORTCUTS = {
  goBack:    { key: 'KeyZ', alt: true, ctrl: false, shift: false, meta: false },
  goForward: { key: 'KeyX', alt: true, ctrl: false, shift: false, meta: false }
};
let shortcuts = { ...DEFAULT_SHORTCUTS };

function loadShortcuts() {
  chrome.storage.sync.get('shortcuts', (data) => {
    if (data.shortcuts) {
      shortcuts = { ...DEFAULT_SHORTCUTS, ...data.shortcuts };
    }
  });
}

loadShortcuts();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.shortcuts) {
    shortcuts = { ...DEFAULT_SHORTCUTS, ...changes.shortcuts.newValue };
  }
});

function matchesShortcut(event, shortcut) {
  if (!shortcut || !shortcut.key) return false;
  return (
    event.code === shortcut.key &&
    event.altKey === !!shortcut.alt &&
    event.ctrlKey === !!shortcut.ctrl &&
    event.shiftKey === !!shortcut.shift &&
    event.metaKey === !!shortcut.meta
  );
}
document.addEventListener('keydown', (event) => {
  if (matchesShortcut(event, shortcuts.goBack)) {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ action: 'go-back' });
  } else if (matchesShortcut(event, shortcuts.goForward)) {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ action: 'go-forward' });
  }
}, true);
