'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'options.html'), 'utf8');
const script = fs.readFileSync(path.join(ROOT, 'options.js'), 'utf8');
const enMessages = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', 'en', 'messages.json'), 'utf8'));
const zhMessages = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', 'zh_CN', 'messages.json'), 'utf8'));

test('uses a copyable shortcuts address instead of an unclickable chrome URL link', () => {
  assert.doesNotMatch(html, /href=["']chrome:\/\//i);
  assert.match(html, /id=["']shortcuts-url["']/);
  assert.match(html, /id=["']copy-shortcuts-url["']/);
});

test('defines localized messages for dynamic shortcut and error states', () => {
  const requiredKeys = [
    'optionsShortcutBackLabel',
    'optionsShortcutForwardLabel',
    'optionsShortcutUnassigned',
    'optionsCopyShortcutsUrl',
    'optionsCopySuccess',
    'optionsError'
  ];

  for (const key of requiredKeys) {
    assert.equal(typeof enMessages[key]?.message, 'string', `missing English message: ${key}`);
    assert.equal(typeof zhMessages[key]?.message, 'string', `missing Chinese message: ${key}`);
  }
});

test('renders the real command bindings and sets the document language', async () => {
  const domReadyListeners = [];
  const elements = new Map([
    ['shortcut-back', { textContent: '' }],
    ['shortcut-forward', { textContent: '' }],
    ['shortcuts-url', { textContent: '' }],
    ['status', { textContent: '', hidden: true }],
    ['copy-shortcuts-url', { addEventListener() {} }]
  ]);
  const document = {
    documentElement: { lang: 'en' },
    title: '',
    addEventListener(name, listener) {
      if (name === 'DOMContentLoaded') {
        domReadyListeners.push(listener);
      }
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-i18n]' ? [] : [];
    }
  };
  const messages = {
    optionsTitle: 'LastTab Settings',
    optionsShortcutUnassigned: 'Unassigned'
  };
  const context = {
    chrome: {
      commands: {
        async getAll() {
          return [
            { name: 'go-back', shortcut: 'Ctrl+Shift+B' },
            { name: 'go-forward', shortcut: '' }
          ];
        }
      },
      i18n: {
        getMessage(key) {
          return messages[key] || '';
        },
        getUILanguage() {
          return 'zh-CN';
        }
      },
      storage: {
        local: {
          async get() {
            return { settings: { historyScope: 'global' } };
          },
          async set() {}
        }
      }
    },
    clearTimeout,
    console,
    document,
    navigator: { clipboard: { async writeText() {} } },
    setTimeout
  };

  vm.createContext(context);
  vm.runInContext(script, context, { filename: path.join(ROOT, 'options.js') });
  domReadyListeners[0]();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(document.documentElement.lang, 'zh-CN');
  assert.equal(elements.get('shortcut-back').textContent, 'Ctrl+Shift+B');
  assert.equal(elements.get('shortcut-forward').textContent, 'Unassigned');
});
