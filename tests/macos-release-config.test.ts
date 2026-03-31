import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const electronBuilderPath = path.resolve(process.cwd(), 'electron-builder.yml');
const workflowPath = path.resolve(process.cwd(), '.github/workflows/macos-release.yml');

describe('macOS release config', () => {
  it('defines a dedicated build:mac script', () => {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['build:mac']).toBe('npm run build -- --mac dmg');
  });

  it('wires notarization through electron-builder afterSign', () => {
    const source = fs.readFileSync(electronBuilderPath, 'utf8');

    expect(source).toContain('afterSign: scripts/notarize.js');
    expect(source).toContain('mac:');
  });

  it('adds a macOS release workflow for both architectures', () => {
    const source = fs.readFileSync(workflowPath, 'utf8');

    expect(source).toContain('name: macOS Release');
    expect(source).toContain('runner: macos-13');
    expect(source).toContain('runner: macos-14');
    expect(source).toContain('npm run build:mac -- --${{ matrix.arch }} --publish never');
    expect(source).toContain('APPLE_ID');
    expect(source).toContain('APPLE_TEAM_ID');
    expect(source).toContain('APPLE_CERTIFICATE_P12');
  });
});
