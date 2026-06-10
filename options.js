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
