import type { AppConfig } from '../config/config-store';
import { isOAuthProvider, resolveOAuthApiKey } from './oauth-store';

export async function resolveConfiguredApiKey(
  config: Pick<AppConfig, 'provider' | 'apiKey'>
): Promise<string> {
  if (isOAuthProvider(config.provider)) {
    return (await resolveOAuthApiKey(config.provider)) || '';
  }
  return config.apiKey?.trim() || '';
}

export function getPiProviderForConfig(
  config: Pick<AppConfig, 'provider' | 'customProtocol'>
): string {
  if (config.provider === 'custom') {
    return config.customProtocol || 'anthropic';
  }
  return config.provider || 'anthropic';
}
