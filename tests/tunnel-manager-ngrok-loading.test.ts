import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const tunnelManagerPath = path.resolve(process.cwd(), 'src/main/remote/tunnel-manager.ts');

describe('TunnelManager ngrok loading', () => {
  it('loads ngrok lazily through createRequire instead of a static dependency import', () => {
    const source = fs.readFileSync(tunnelManagerPath, 'utf8');

    expect(source).toContain("import { createRequire } from 'module';");
    expect(source).toContain("TunnelManager.require('ngrok')");
    expect(source).not.toContain("import ngrok from 'ngrok';");
    expect(source).toContain('optional "ngrok" package is not installed');
  });
});
