import { describe, expect, it } from 'vitest';
import { buildRememberedPermissionRule, matchesPermissionRule } from '../src/main/permissions/permission-rules';
import type { PermissionRule } from '../src/renderer/types';

describe('permission rules', () => {
  it('scopes remembered high-risk rules to a concrete pattern when available', () => {
    expect(
      buildRememberedPermissionRule('Bash', { command: 'git status --short' })
    ).toEqual({
      tool: 'bash',
      pattern: 'git status --short',
      action: 'allow',
    });
  });

  it('stores lower-risk tools as tool-wide allow rules when no scoped pattern exists', () => {
    expect(
      buildRememberedPermissionRule('read', { recursive: true })
    ).toEqual({
      tool: 'read',
      pattern: undefined,
      action: 'allow',
    });
  });

  it('matches remembered rules case-insensitively and against serialized input', () => {
    const rule: PermissionRule = {
      tool: 'write',
      pattern: 'README.md',
      action: 'allow',
    };

    expect(
      matchesPermissionRule(rule, 'WRITE', { path: '/tmp/README.md', content: 'hello' })
    ).toBe(true);
    expect(
      matchesPermissionRule(rule, 'write', { path: '/tmp/notes.txt', content: 'hello' })
    ).toBe(false);
  });
});
