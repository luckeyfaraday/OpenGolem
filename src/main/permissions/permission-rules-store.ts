import Store from 'electron-store';
import type { PermissionRule } from '../../renderer/types';
import { deriveStableStoreKey, getStableStoreCwd } from '../utils/persisted-store';
import { buildRememberedPermissionRule, matchesPermissionRule } from './permission-rules';

interface PermissionRulesState {
  rules: PermissionRule[];
}

export class PermissionRulesStore {
  private store: Store<PermissionRulesState>;

  constructor() {
    this.store = new Store<PermissionRulesState>({
      name: 'permission-rules',
      cwd: getStableStoreCwd(),
      defaults: { rules: [] },
      encryptionKey: deriveStableStoreKey('open-cowork-permissions-v1', 'open-cowork-permissions-salt').toString('hex'),
      clearInvalidConfig: true,
    });
  }

  list(): PermissionRule[] {
    return this.store.get('rules', []);
  }

  add(rule: PermissionRule): PermissionRule[] {
    const current = this.list();
    const deduped = current.filter(
      (existing) =>
        !(existing.tool === rule.tool && existing.pattern === rule.pattern && existing.action === rule.action)
    );
    const next = [...deduped, rule];
    this.store.set('rules', next);
    return next;
  }

  addRememberedRule(toolName: string, input: Record<string, unknown>): PermissionRule[] {
    return this.add(buildRememberedPermissionRule(toolName, input));
  }

  delete(rule: PermissionRule): PermissionRule[] {
    const next = this.list().filter(
      (existing) =>
        !(existing.tool === rule.tool && existing.pattern === rule.pattern && existing.action === rule.action)
    );
    this.store.set('rules', next);
    return next;
  }

  match(toolName: string, input: Record<string, unknown>): PermissionRule | null {
    return this.list().find((rule) => matchesPermissionRule(rule, toolName, input)) ?? null;
  }
}

export const permissionRulesStore = new PermissionRulesStore();
