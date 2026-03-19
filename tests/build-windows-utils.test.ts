import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const {
  parseWindowsTargetArch,
  validateWindowsBinaryForArch,
} = require('../scripts/build-windows-utils.js') as {
  parseWindowsTargetArch: (args: string[]) => string;
  validateWindowsBinaryForArch: (
    filePath: string,
    expectedArch: string
  ) => {
    ok: boolean;
    reason?: string;
    actualArch?: string;
    expectedArch?: string;
  };
};

function writePeFixture(filePath: string, machine: number) {
  const buffer = Buffer.alloc(256);
  buffer[0] = 0x4d;
  buffer[1] = 0x5a;
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'ascii');
  buffer.writeUInt16LE(machine, 0x84);
  writeFileSync(filePath, buffer);
}

describe('windows build utilities', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('defaults the windows target arch to x64', () => {
    expect(parseWindowsTargetArch([])).toBe('x64');
    expect(parseWindowsTargetArch(['--win', 'nsis'])).toBe('x64');
  });

  it('parses explicit windows target arch flags', () => {
    expect(parseWindowsTargetArch(['--win', '--arm64'])).toBe('arm64');
    expect(parseWindowsTargetArch(['--win', '--ia32'])).toBe('ia32');
  });

  it('rejects a packaged PE with the wrong machine type', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'open-golem-win-test-'));
    tempDirs.push(tempDir);

    const binaryPath = join(tempDir, 'better_sqlite3.node');
    writePeFixture(binaryPath, 0xaa64);

    expect(validateWindowsBinaryForArch(binaryPath, 'x64')).toEqual({
      ok: false,
      reason: 'machine-mismatch',
      actualArch: 'arm64',
      expectedArch: 'x64',
    });
  });

  it('accepts a packaged PE that matches the target arch', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'open-golem-win-test-'));
    tempDirs.push(tempDir);

    const binaryPath = join(tempDir, 'better_sqlite3.node');
    writePeFixture(binaryPath, 0x8664);

    expect(validateWindowsBinaryForArch(binaryPath, 'x64')).toEqual({
      ok: true,
      actualArch: 'x64',
      expectedArch: 'x64',
    });
  });
});
