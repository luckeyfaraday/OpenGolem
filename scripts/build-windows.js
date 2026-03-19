#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { rebuildNativeModules } = require('./rebuild-native-modules');
const {
  parseWindowsTargetArch,
  validateWindowsBinaryForArch,
} = require('./build-windows-utils');

const PROJECT_ROOT = path.join(__dirname, '..');
const CACHE_ROOT = path.resolve(
  process.env.OPEN_COWORK_BUILD_ROOT || path.join(PROJECT_ROOT, '.build-cache')
);

const DIRS = {
  root: CACHE_ROOT,
  temp: path.join(CACHE_ROOT, 'temp'),
  appDataRoaming: path.join(CACHE_ROOT, 'appdata', 'Roaming'),
  appDataLocal: path.join(CACHE_ROOT, 'appdata', 'Local'),
  electronCache: path.join(CACHE_ROOT, 'electron'),
  electronBuilderCache: path.join(CACHE_ROOT, 'electron-builder'),
  npmCache: path.join(CACHE_ROOT, 'npm-cache'),
};
const LOCAL_ELECTRON_DIST = path.join(PROJECT_ROOT, 'node_modules', 'electron', 'dist');
const RELEASE_DIR = path.join(PROJECT_ROOT, 'release');
const PACKAGED_BETTER_SQLITE3 = path.join(
  RELEASE_DIR,
  'win-unpacked',
  'resources',
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveNpmCommand() {
  if (process.platform === 'win32') {
    return 'npm.cmd';
  }
  return 'npm';
}

function toPowerShellLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function isValidZipArchive(zipPath, requiredEntry) {
  const inspectScript = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$zip = ${toPowerShellLiteral(zipPath)}`,
    `$requiredEntry = ${toPowerShellLiteral(requiredEntry)}`,
    '$archive = [System.IO.Compression.ZipFile]::OpenRead($zip)',
    'try {',
    '  if ($archive.Entries.Count -le 0) { exit 2 }',
    '  $match = $archive.Entries | Where-Object { $_.FullName -eq $requiredEntry } | Select-Object -First 1',
    '  if (-not $match) { exit 3 }',
    '} finally {',
    '  $archive.Dispose()',
    '}',
  ].join('; ');

  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', inspectScript], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  return result.status === 0;
}

function cleanInvalidElectronCache(electronCacheDir) {
  if (process.platform !== 'win32' || !fs.existsSync(electronCacheDir)) {
    return;
  }

  const zipFiles = fs.readdirSync(electronCacheDir)
    .filter((name) => /^electron-v.+-win32-.+\.zip$/i.test(name))
    .map((name) => path.join(electronCacheDir, name));

  for (const zipPath of zipFiles) {
    if (isValidZipArchive(zipPath, 'electron.exe')) {
      console.log('[build:win] Electron cache OK:', zipPath);
      continue;
    }

    console.warn('[build:win] Removing invalid Electron cache:', zipPath);
    fs.rmSync(zipPath, { force: true });
  }
}

function cleanWindowsReleaseArtifacts() {
  if (!fs.existsSync(RELEASE_DIR)) {
    return;
  }

  const entries = fs.readdirSync(RELEASE_DIR);
  for (const entry of entries) {
    const fullPath = path.join(RELEASE_DIR, entry);
    if (
      /^latest\.yml$/i.test(entry)
      || /^builder-(debug|effective-config)\./i.test(entry)
      || /win-(x64|arm64|ia32)\.(exe|exe\.blockmap)$/i.test(entry)
      || /\.nsis\.7z$/i.test(entry)
      || /^win-unpacked$/i.test(entry)
    ) {
      console.log('[build:win] Removing stale release artifact:', fullPath);
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

function validatePackagedNativeModules(targetArch) {
  if (!fs.existsSync(PACKAGED_BETTER_SQLITE3)) {
    console.warn('[build:win] Packaged better-sqlite3 binary not found for validation:', PACKAGED_BETTER_SQLITE3);
    return;
  }

  const validation = validateWindowsBinaryForArch(PACKAGED_BETTER_SQLITE3, targetArch);
  if (!validation.ok) {
    if (validation.reason === 'machine-mismatch') {
      console.error(
        `[build:win] Invalid Windows package: better_sqlite3.node is ${validation.actualArch}, expected ${validation.expectedArch}.`
      );
    } else {
      console.error('[build:win] Invalid Windows package: better_sqlite3.node is not a valid Windows PE binary.');
    }
    console.error('[build:win] Packaged file:', PACKAGED_BETTER_SQLITE3);
    console.error('[build:win] This usually means the packaged native module was built for the wrong platform or CPU architecture.');
    console.error('[build:win] Build the installer on a Windows host with `npm run build:win` so native modules are rebuilt for the packaged Electron target.');
    process.exit(1);
  }

  console.log(`[build:win] Verified packaged better-sqlite3 binary matches win32-${targetArch}.`);
}

function main() {
  if (process.platform !== 'win32') {
    console.error('[build:win] Windows installers must be built on a Windows host.');
    process.exit(1);
  }

  Object.values(DIRS).forEach(ensureDir);

  const forwardedArgs = process.argv.slice(2);
  const builderArgs = forwardedArgs.length > 0 ? [...forwardedArgs] : ['--win', 'nsis'];
  const targetArch = parseWindowsTargetArch(builderArgs);
  const env = {
    ...process.env,
    APPDATA: DIRS.appDataRoaming,
    LOCALAPPDATA: DIRS.appDataLocal,
    TEMP: DIRS.temp,
    TMP: DIRS.temp,
    ELECTRON_CACHE: DIRS.electronCache,
    ELECTRON_BUILDER_CACHE: DIRS.electronBuilderCache,
    NPM_CONFIG_CACHE: DIRS.npmCache,
    npm_config_cache: DIRS.npmCache,
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
    npm_config_platform: 'win32',
    npm_config_target_platform: 'win32',
  };

  delete env.ELECTRON_RUN_AS_NODE;
  cleanInvalidElectronCache(DIRS.electronCache);
  cleanWindowsReleaseArtifacts();

  const hasElectronDistOverride = builderArgs.some((arg) => arg.includes('electronDist'));
  if (process.platform === 'win32' && !hasElectronDistOverride && fs.existsSync(LOCAL_ELECTRON_DIST)) {
    builderArgs.push(`--config.electronDist=${LOCAL_ELECTRON_DIST}`);
  }

  console.log('[build:win] Using cache root:', DIRS.root);
  console.log('[build:win] TEMP:', DIRS.temp);
  console.log('[build:win] APPDATA:', DIRS.appDataRoaming);
  console.log('[build:win] LOCALAPPDATA:', DIRS.appDataLocal);
  console.log('[build:win] ELECTRON_CACHE:', DIRS.electronCache);
  console.log('[build:win] ELECTRON_BUILDER_CACHE:', DIRS.electronBuilderCache);
  console.log('[build:win] NPM_CONFIG_CACHE:', DIRS.npmCache);
  console.log('[build:win] Target arch:', targetArch);
  if (builderArgs.some((arg) => arg.includes('electronDist'))) {
    console.log('[build:win] electronDist:', LOCAL_ELECTRON_DIST);
  }
  console.log('[build:win] Running build with args:', builderArgs.join(' '));

  rebuildNativeModules({ arch: targetArch, env });

  const child = spawn(resolveNpmCommand(), ['run', 'build', '--', ...builderArgs], {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.error(`[build:win] Build terminated by signal: ${signal}`);
      process.exit(1);
    }

    const exitCode = code ?? 1;
    if (exitCode !== 0) {
      process.exit(exitCode);
    }

    validatePackagedNativeModules(targetArch);
    process.exit(0);
  });

  child.on('error', (error) => {
    console.error('[build:win] Failed to start build:', error.message);
    process.exit(1);
  });
}

main();
