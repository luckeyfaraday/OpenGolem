import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rootPackageJsonPath = path.resolve(process.cwd(), 'package.json');
const vendoredPiPackageJsonPath = path.resolve(process.cwd(), 'packages/pi-coding-agent/package.json');
const vendoredPiSourcePath = path.resolve(process.cwd(), 'packages/pi-coding-agent/src/core/agent-session.ts');
const vendoredPiTsconfigPath = path.resolve(process.cwd(), 'packages/pi-coding-agent/tsconfig.build.json');

describe('pi vendoring', () => {
  it('pins the app to the vendored pi package', () => {
    const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.['@mariozechner/pi-coding-agent']).toBe('file:packages/pi-coding-agent');
  });

  it('keeps a vendored pi package snapshot in-repo', () => {
    const pkg = JSON.parse(fs.readFileSync(vendoredPiPackageJsonPath, 'utf8')) as {
      name?: string;
      version?: string;
      main?: string;
      types?: string;
    };

    expect(pkg.name).toBe('@mariozechner/pi-coding-agent');
    expect(pkg.version).toBe('0.56.3');
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
  });

  it('includes source-level files and build scaffolding for the vendored package', () => {
    expect(fs.existsSync(vendoredPiSourcePath)).toBe(true);
    expect(fs.existsSync(vendoredPiTsconfigPath)).toBe(true);

    const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(rootPkg.scripts?.['build:pi-vendored']).toContain('packages/pi-coding-agent/tsconfig.build.json');
    expect(rootPkg.scripts?.['build:pi-vendored']).toContain('packages/pi-coding-agent/scripts/copy-assets.mjs');
  });
});
