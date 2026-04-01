import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Shield, Trash2 } from 'lucide-react';
import { useAppStore } from '../store';
import { useIPC } from '../hooks/useIPC';
import type { PermissionRule, PermissionRequest } from '../types';

function summarizePermissionInput(input: Record<string, unknown>): string {
  const priorityKeys = ['command', 'cmd', 'path', 'file_path', 'filePath', 'query', 'url'];
  for (const key of priorityKeys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return JSON.stringify(input);
}

export function PermissionsPanel() {
  const pendingPermissions = useAppStore((s) => s.pendingPermissions);
  const setShowPermissionsPanel = useAppStore((s) => s.setShowPermissionsPanel);
  const setGlobalNotice = useAppStore((s) => s.setGlobalNotice);
  const { respondToPermission } = useIPC();
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextRules = await window.electronAPI.permissions.listRules();
      setRules(nextRules);
    } catch (error) {
      setGlobalNotice({
        id: `permissions-load-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to load permission rules.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [setGlobalNotice]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const deleteRule = useCallback(async (rule: PermissionRule) => {
    setIsLoading(true);
    try {
      const nextRules = await window.electronAPI.permissions.deleteRule(rule);
      setRules(nextRules);
    } catch (error) {
      setGlobalNotice({
        id: `permissions-delete-${Date.now()}`,
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to delete permission rule.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [setGlobalNotice]);

  const renderPendingCard = (permission: PermissionRequest) => {
    const highRisk = ['bash', 'write', 'edit', 'execute_command'].some((fragment) =>
      permission.toolName.toLowerCase().includes(fragment)
    );

    return (
      <article
        key={permission.toolUseId}
        className="rounded-2xl border border-border-subtle bg-background/65 px-4 py-4"
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            highRisk ? 'bg-warning/10 text-warning' : 'bg-surface-hover text-text-secondary'
          }`}>
            {highRisk ? <AlertTriangle className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-primary">{permission.toolName}</div>
            <div className="mt-1 text-xs text-text-muted break-all">
              {summarizePermissionInput(permission.input)}
            </div>
            <pre className="mt-3 rounded-xl bg-surface/80 p-3 text-xs text-text-secondary overflow-auto max-h-40">
              {JSON.stringify(permission.input, null, 2)}
            </pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => respondToPermission(permission.toolUseId, 'deny')}
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Deny
              </button>
              <button
                onClick={() => respondToPermission(permission.toolUseId, 'allow')}
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Allow once
              </button>
              <button
                onClick={() => respondToPermission(permission.toolUseId, 'allow_always')}
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs text-accent hover:bg-accent/10 transition-colors"
              >
                Allow and remember
              </button>
            </div>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="flex-1 min-h-0 bg-background px-6 py-6 overflow-auto">
      <div className="mx-auto max-w-6xl h-full flex flex-col gap-5">
        <div className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl border border-border-subtle bg-background/70 flex items-center justify-center text-text-secondary">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-text-primary">Approvals</h2>
                  <p className="text-sm text-text-muted">
                    Review live tool approvals and the rules the app will remember for future runs.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowPermissionsPanel(false)}
              className="rounded-xl border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-text-primary">Pending approvals</h3>
              <span className="text-sm text-text-muted">{pendingPermissions.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {pendingPermissions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-background/40 px-5 py-8 text-sm text-text-muted">
                  No pending approvals.
                </div>
              ) : (
                pendingPermissions.map(renderPendingCard)
              )}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-border-subtle bg-surface/80 px-6 py-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-text-primary">Saved rules</h3>
              {isLoading && <span className="text-sm text-text-muted">Loading…</span>}
            </div>
            <div className="mt-4 space-y-3">
              {rules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-subtle bg-background/40 px-5 py-8 text-sm text-text-muted">
                  No remembered approval rules yet.
                </div>
              ) : (
                rules.map((rule) => (
                  <article
                    key={`${rule.tool}-${rule.pattern || 'any'}-${rule.action}`}
                    className="rounded-2xl border border-border-subtle bg-background/65 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary">{rule.tool}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          Action: {rule.action}
                        </div>
                        <div className="mt-2 text-xs text-text-muted break-all">
                          Match: {rule.pattern || 'any input for this tool'}
                        </div>
                      </div>
                      <button
                        onClick={() => void deleteRule(rule)}
                        className="rounded-lg p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
