#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const RESOURCES_DIR = path.join(PROJECT_ROOT, 'resources');
const SOURCE_ICON = path.join(RESOURCES_DIR, 'icon.png');
const ICONSET_DIR = path.join(RESOURCES_DIR, 'icon.iconset');
const WINDOWS_ICON = path.join(RESOURCES_DIR, 'icon.ico');
const MACOS_ICON = path.join(RESOURCES_DIR, 'icon.icns');

const ICONSET_FILES = [
  { filename: 'icon_16x16.png', size: 16 },
  { filename: 'icon_16x16@2x.png', size: 32 },
  { filename: 'icon_32x32.png', size: 32 },
  { filename: 'icon_32x32@2x.png', size: 64 },
  { filename: 'icon_128x128.png', size: 128 },
  { filename: 'icon_128x128@2x.png', size: 256 },
  { filename: 'icon_256x256.png', size: 256 },
  { filename: 'icon_256x256@2x.png', size: 512 },
  { filename: 'icon_512x512.png', size: 512 },
  { filename: 'icon_512x512@2x.png', size: 1024 },
];

const ICNS_CHUNKS = [
  { filename: 'icon_16x16.png', type: 'icp4' },
  { filename: 'icon_16x16@2x.png', type: 'icp5' },
  { filename: 'icon_32x32@2x.png', type: 'icp6' },
  { filename: 'icon_128x128.png', type: 'ic07' },
  { filename: 'icon_128x128@2x.png', type: 'ic08' },
  { filename: 'icon_256x256@2x.png', type: 'ic09' },
  { filename: 'icon_512x512@2x.png', type: 'ic10' },
];

function fail(message) {
  console.error(`[build:icons] ${message}`);
  process.exit(1);
}

function findImageMagickCommand() {
  const candidates = process.platform === 'win32' ? ['magick', 'convert'] : ['magick', 'convert'];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-version'], { stdio: 'ignore' });
    if (result.status === 0) {
      return candidate;
    }
  }

  fail('ImageMagick is required. Install `magick` or `convert` and rerun `npm run build:icons`.');
}

function runImageMagick(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureSourceIcon() {
  if (!fs.existsSync(SOURCE_ICON)) {
    fail(`Source icon not found: ${SOURCE_ICON}`);
  }
}

function renderSquarePng(command, size, outputPath) {
  runImageMagick(command, [
    SOURCE_ICON,
    '-background',
    'none',
    '-gravity',
    'center',
    '-resize',
    `${size}x${size}`,
    '-extent',
    `${size}x${size}`,
    `PNG32:${outputPath}`,
  ]);
}

function buildIconset(command) {
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  for (const { filename, size } of ICONSET_FILES) {
    renderSquarePng(command, size, path.join(ICONSET_DIR, filename));
  }
}

function buildWindowsIcon(command) {
  runImageMagick(command, [
    SOURCE_ICON,
    '-background',
    'none',
    '-gravity',
    'center',
    '-resize',
    '1024x1024',
    '-extent',
    '1024x1024',
    '-define',
    'icon:auto-resize=16,24,32,48,64,128,256',
    WINDOWS_ICON,
  ]);
}

function chunkBuffer(type, data) {
  const header = Buffer.alloc(8);
  header.write(type, 0, 4, 'ascii');
  header.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([header, data]);
}

function buildMacosIcon() {
  const chunks = ICNS_CHUNKS.map(({ filename, type }) => {
    const filePath = path.join(ICONSET_DIR, filename);
    const data = fs.readFileSync(filePath);
    return chunkBuffer(type, data);
  });

  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 8);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalSize, 4);

  fs.writeFileSync(MACOS_ICON, Buffer.concat([header, ...chunks]));
}

function main() {
  ensureSourceIcon();

  const imageMagick = findImageMagickCommand();
  buildIconset(imageMagick);
  buildWindowsIcon(imageMagick);
  buildMacosIcon();

  console.log('[build:icons] Generated icon.iconset, icon.ico, and icon.icns from resources/icon.png');
}

main();
