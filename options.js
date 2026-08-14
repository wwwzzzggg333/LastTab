const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { historyScope: 'global' };
const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });
  document.title = chrome.i18n.getMessage('optionsTitle') || 'LastTab';
  document.documentElement.lang = chrome.i18n.getUILanguage().replace('_', '-');
}

async function loadSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
  const radio = document.querySelector(`input[name="historyScope"][value="${settings.historyScope}"]`);
  if (radio) {
    radio.checked = true;
  }
}

async function loadShortcuts() {
  const commands = await chrome.commands.getAll();
  const shortcuts = new Map(commands.map((command) => [command.name, command.shortcut]));
  const unassigned = chrome.i18n.getMessage('optionsShortcutUnassigned') || 'Unassigned';
  document.getElementById('shortcut-back').textContent = shortcuts.get('go-back') || unassigned;
  document.getElementById('shortcut-forward').textContent = shortcuts.get('go-forward') || unassigned;
}

function showStatus(message, isError = false) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.hidden = false;
  status.classList?.toggle('error', isError);
  setTimeout(() => {
    status.hidden = true;
  }, 2000);
}

async function saveSettings(historyScope) {
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { historyScope }
  });
  showStatus(chrome.i18n.getMessage('optionsSaved') || 'Saved.');
}

async function copyShortcutsUrl() {
  await navigator.clipboard.writeText(SHORTCUTS_URL);
  showStatus(chrome.i18n.getMessage('optionsCopySuccess') || 'Address copied.');
}

function showError() {
  showStatus(chrome.i18n.getMessage('optionsError') || 'Something went wrong.', true);
}

document.addEventListener('DOMContentLoaded', async () => {
  applyI18n();
  document.getElementById('shortcuts-url').textContent = SHORTCUTS_URL;

  try {
    await Promise.all([loadSettings(), loadShortcuts()]);
  } catch (err) {
    console.warn('LastTab: cannot load options', err);
    showError();
  }

  document.querySelectorAll('input[name="historyScope"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      if (event.target.checked) {
        saveSettings(event.target.value).catch((err) => {
          console.warn('LastTab: cannot save options', err);
          showError();
        });
      }
    });
  });

  document.getElementById('copy-shortcuts-url').addEventListener('click', () => {
    copyShortcutsUrl().catch((err) => {
      console.warn('LastTab: cannot copy shortcuts address', err);
      showError();
    });
  });
});
