#!/usr/bin/env node

const path = require('node:path');
const { spawn } = require('node:child_process');
const { targetsWindows } = require('./build-targets');

const PROJECT_ROOT = path.join(__dirname, '..');
const ELECTRON_BUILDER_CLI = path.join(
  PROJECT_ROOT,
  'node_modules',
  'electron-builder',
  'cli.js'
);

function main() {
  const args = process.argv.slice(2);

  if (targetsWindows(args) && process.platform !== 'win32') {
    console.error('[build] Windows installers must be built on a Windows host.');
    console.error('[build] Use `npm run build:win` on Windows so native modules are rebuilt and validated for the packaged arch.');
    process.exit(1);
  }

  const child = spawn(process.execPath, [ELECTRON_BUILDER_CLI, ...args], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[build] electron-builder terminated by signal: ${signal}`);
      process.exit(1);
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error('[build] Failed to start electron-builder:', error.message);
    process.exit(1);
  });
}

main();
