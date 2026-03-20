#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const PACKAGE_LOCK_JSON = path.join(PROJECT_ROOT, 'package-lock.json');

function fail(message) {
  console.error(`[version:sync] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeVersion(ref) {
  if (!ref) {
    return null;
  }

  const trimmed = String(ref).trim();
  const match = /^(?:refs\/tags\/)?v(.+)$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const version = match[1];
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`Tag ref does not contain a supported package version: ${trimmed}`);
  }

  return version;
}

function syncPackageVersion(version) {
  const pkg = readJson(PACKAGE_JSON);
  const lock = readJson(PACKAGE_LOCK_JSON);

  pkg.version = version;
  lock.version = version;

  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }

  writeJson(PACKAGE_JSON, pkg);
  writeJson(PACKAGE_LOCK_JSON, lock);
}

function main() {
  const ref = process.argv[2] || process.env.RELEASE_REF || process.env.GITHUB_REF || '';
  const version = normalizeVersion(ref);

  if (!version) {
    console.log(`[version:sync] Skipping package version sync for non-tag ref: ${ref || '(empty)'}`);
    return;
  }

  syncPackageVersion(version);
  console.log(`[version:sync] Synced package version to ${version} from ${ref}`);
}

main();
