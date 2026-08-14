'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('declares the Chrome version required by storage.session', () => {
  assert.equal(manifest.minimum_chrome_version, '102');
});

test('requests only the storage permission needed by the current feature set', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
});

test('all manifest localization placeholders exist in both locales', () => {
  const en = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', 'en', 'messages.json'), 'utf8'));
  const zh = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', 'zh_CN', 'messages.json'), 'utf8'));
  const placeholders = JSON.stringify(manifest).match(/__MSG_([A-Za-z0-9_]+)__/g) || [];
  const keys = placeholders.map((placeholder) => placeholder.slice(6, -2));

  for (const key of keys) {
    assert.equal(typeof en[key]?.message, 'string', `missing English manifest message: ${key}`);
    assert.equal(typeof zh[key]?.message, 'string', `missing Chinese manifest message: ${key}`);
  }
});
