import { describe, expect, it } from 'vitest';

const { targetsWindows } = require('../scripts/build-targets.js') as {
  targetsWindows: (args: string[]) => boolean;
};

describe('build target detection', () => {
  it('detects explicit windows target flags', () => {
    expect(targetsWindows(['--win', 'nsis'])).toBe(true);
    expect(targetsWindows(['-w', 'portable'])).toBe(true);
    expect(targetsWindows(['--windows'])).toBe(true);
  });

  it('ignores non-windows targets', () => {
    expect(targetsWindows(['--mac', 'dmg'])).toBe(false);
    expect(targetsWindows(['--linux', 'AppImage'])).toBe(false);
    expect(targetsWindows([])).toBe(false);
  });
});
