'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const packageScript = path.join(repoRoot, 'scripts', 'package-extension.ps1');

test('package script creates a minimal installable extension archive', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lasttab-package-'));
  const outputPath = path.join(tempDir, 'lastTab.zip');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const packageResult = spawnSync(
    'pwsh',
    ['-NoProfile', '-File', packageScript, '-OutputPath', outputPath],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(packageResult.status, 0, packageResult.stderr || packageResult.stdout);
  assert.ok(fs.existsSync(outputPath), 'the package archive should be created');

  const escapedOutputPath = outputPath.replaceAll("'", "''");
  const listArchiveCommand = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$archive = [System.IO.Compression.ZipFile]::OpenRead('${escapedOutputPath}')`,
    'try { $archive.Entries | ForEach-Object { $_.FullName } } finally { $archive.Dispose() }',
  ].join('; ');
  const listResult = spawnSync(
    'pwsh',
    ['-NoProfile', '-Command', listArchiveCommand],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  assert.equal(listResult.status, 0, listResult.stderr || listResult.stdout);

  const entries = listResult.stdout
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();

  assert.deepEqual(entries, [
    '_locales/en/messages.json',
    '_locales/zh_CN/messages.json',
    'background.js',
    'icons/icon128.png',
    'icons/icon16.png',
    'icons/icon48.png',
    'manifest.json',
    'options.css',
    'options.html',
    'options.js',
  ]);
});
