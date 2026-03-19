import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getOAuthApiKey, type OAuthCredentials } from '@mariozechner/pi-ai/oauth';

export const OAUTH_PROVIDER_IDS = [
  'openai-codex',
  'google-gemini-cli',
  'google-antigravity',
] as const;

export type OAuthProviderId = typeof OAUTH_PROVIDER_IDS[number];

export interface OAuthProviderStatus {
  provider: OAuthProviderId;
  connected: boolean;
  email?: string;
  expiresAt?: number;
}

type StoredAuthEntry = {
  type: 'oauth';
  refresh: string;
  access: string;
  expires: number;
  [key: string]: unknown;
};

type AuthFile = Record<string, StoredAuthEntry | Record<string, unknown>>;

function resolveAuthFilePath(): string {
  const override = process.env.OPEN_COWORK_AUTH_FILE?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), '.open-cowork', 'agent', 'auth.json');
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readAuthFile(): AuthFile {
  const filePath = resolveAuthFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as AuthFile;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAuthFile(data: AuthFile): void {
  const filePath = resolveAuthFilePath();
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function isOAuthProviderId(value: string): value is OAuthProviderId {
  return (OAUTH_PROVIDER_IDS as readonly string[]).includes(value);
}

function isStoredOAuthEntry(value: unknown): value is StoredAuthEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.type === 'oauth'
    && typeof record.refresh === 'string'
    && typeof record.access === 'string'
    && typeof record.expires === 'number';
}

function getStoredOAuthEntry(provider: OAuthProviderId): StoredAuthEntry | null {
  const authFile = readAuthFile();
  const entry = authFile[provider];
  return isStoredOAuthEntry(entry) ? entry : null;
}

export function isOAuthProvider(provider: string): provider is OAuthProviderId {
  return isOAuthProviderId(provider);
}

export function getOAuthProviderStatus(provider: OAuthProviderId): OAuthProviderStatus {
  const entry = getStoredOAuthEntry(provider);
  return {
    provider,
    connected: Boolean(entry),
    email: typeof entry?.email === 'string' ? entry.email : undefined,
    expiresAt: typeof entry?.expires === 'number' ? entry.expires : undefined,
  };
}

export function getAllOAuthProviderStatuses(): Record<OAuthProviderId, OAuthProviderStatus> {
  return Object.fromEntries(
    OAUTH_PROVIDER_IDS.map((provider) => [provider, getOAuthProviderStatus(provider)])
  ) as Record<OAuthProviderId, OAuthProviderStatus>;
}

export function saveOAuthCredentials(provider: OAuthProviderId, credentials: OAuthCredentials): void {
  const authFile = readAuthFile();
  authFile[provider] = {
    type: 'oauth',
    ...credentials,
  };
  writeAuthFile(authFile);
}

export function clearOAuthCredentials(provider: OAuthProviderId): void {
  const authFile = readAuthFile();
  delete authFile[provider];
  writeAuthFile(authFile);
}

export function hasSavedOAuthCredentials(provider: string): boolean {
  if (!isOAuthProvider(provider)) {
    return false;
  }
  return getStoredOAuthEntry(provider) !== null;
}

export async function resolveOAuthApiKey(provider: OAuthProviderId): Promise<string | null> {
  const authFile = readAuthFile();
  const oauthEntries: Record<string, OAuthCredentials> = {};

  for (const [key, value] of Object.entries(authFile)) {
    if (isOAuthProviderId(key) && isStoredOAuthEntry(value)) {
      oauthEntries[key] = value;
    }
  }

  const result = await getOAuthApiKey(provider, oauthEntries);
  if (!result) {
    return null;
  }

  saveOAuthCredentials(provider, result.newCredentials);
  return result.apiKey;
}

export function getAuthStoragePath(): string {
  return resolveAuthFilePath();
}
