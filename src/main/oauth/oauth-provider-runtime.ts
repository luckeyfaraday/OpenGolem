import { isOAuthProvider, resolveOAuthApiKey } from './oauth-store';

type OAuthConfigLike = {
  provider: string;
  apiKey?: string;
};

type PiProviderConfigLike = {
  provider: string;
  customProtocol?: string;
};

export async function resolveConfiguredApiKey(
  config: OAuthConfigLike
): Promise<string> {
  if (isOAuthProvider(config.provider)) {
    return (await resolveOAuthApiKey(config.provider)) || '';
  }
  return config.apiKey?.trim() || '';
}

export function getPiProviderForConfig(
  config: PiProviderConfigLike
): string {
  if (config.provider === 'custom') {
    return config.customProtocol || 'anthropic';
  }
  return config.provider || 'anthropic';
}
