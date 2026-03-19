#!/usr/bin/env node

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const DEFAULT_MODULES = ['better-sqlite3'];

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseArgs(args) {
  let arch;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--arch=')) {
      arch = arg.slice('--arch='.length);
      continue;
    }
    if (arg === '--arch') {
      arch = args[i + 1];
      i += 1;
    }
  }

  return { arch };
}

function getElectronVersion() {
  // Resolve from the installed package to keep rebuilds pinned to the packaged Electron ABI.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(path.join(PROJECT_ROOT, 'node_modules', 'electron', 'package.json')).version;
}

function buildNpmArgs({ arch, modules = DEFAULT_MODULES } = {}) {
  const electronVersion = getElectronVersion();
  const args = [
    'rebuild',
    ...modules,
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--disturl=https://electronjs.org/headers',
    '--update-binary',
  ];

  if (arch) {
    args.push(`--arch=${arch}`);
  }

  return args;
}

function rebuildNativeModules({ arch, modules = DEFAULT_MODULES, env = process.env } = {}) {
  const args = buildNpmArgs({ arch, modules });
  console.log('[rebuild] Running:', `${resolveNpmCommand()} ${args.join(' ')}`);

  const result = spawnSync(resolveNpmCommand(), args, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (require.main === module) {
  rebuildNativeModules(parseArgs(process.argv.slice(2)));
}

module.exports = {
  DEFAULT_MODULES,
  buildNpmArgs,
  parseArgs,
  rebuildNativeModules,
};
