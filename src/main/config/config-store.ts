import fs from 'node:fs';
import Store from 'electron-store';
import { log } from '../utils/logger';
import { isOpenAIProvider, resolveOpenAICredentials, shouldUseAnthropicAuthToken } from './auth-utils';

/**
 * Application configuration schema
 */
export type ProviderType = 'openrouter' | 'anthropic' | 'custom' | 'openai';
export type CustomProtocolType = 'anthropic' | 'openai';
export type ProviderProfileKey = 'openrouter' | 'anthropic' | 'openai' | 'custom:anthropic' | 'custom:openai';
export type ConfigSetId = string;
export type CreateSetMode = 'blank' | 'clone';

export interface CreateConfigSetPayload {
  name: string;
  mode?: CreateSetMode;
  fromSetId?: string;
}

export interface ProviderProfile {
  apiKey: string;
  baseUrl?: string;
  model: string;
  openaiMode?: 'responses' | 'chat';
}

export interface ApiConfigSet {
  id: ConfigSetId;
  name: string;
  isSystem?: boolean;
  provider: ProviderType;
  customProtocol: CustomProtocolType;
  activeProfileKey: ProviderProfileKey;
  profiles: Partial<Record<ProviderProfileKey, ProviderProfile>>;
  enableThinking: boolean;
  updatedAt: string;
}

export interface AppConfig {
  // API Provider
  provider: ProviderType;

  // API credentials
  apiKey: string;
  baseUrl?: string;
  customProtocol?: CustomProtocolType;

  // Model selection
  model: string;

  // OpenAI API mode
  openaiMode: 'responses' | 'chat';

  // Active profile
  activeProfileKey: ProviderProfileKey;
  profiles: Partial<Record<ProviderProfileKey, ProviderProfile>>;

  // Active config set
  activeConfigSetId: ConfigSetId;
  configSets: ApiConfigSet[];

  // Optional: Claude Code CLI path override
  claudeCodePath?: string;

  // Optional: Default working directory
  defaultWorkdir?: string;

  // Optional: Global skills storage directory
  globalSkillsPath?: string;

  // Developer logs
  enableDevLogs: boolean;

  // Sandbox mode (WSL/Lima isolation)
  sandboxEnabled: boolean;

  // Enable thinking mode (show thinking steps)
  enableThinking: boolean;

  // First run flag
  isConfigured: boolean;
}

const DEFAULT_CONFIG_SET_ID = 'default';
const MAX_CONFIG_SET_COUNT = 20;

const defaultProfiles: Record<ProviderProfileKey, ProviderProfile> = {
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api',
    model: 'anthropic/claude-sonnet-4.5',
    openaiMode: 'responses',
  },
  anthropic: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    openaiMode: 'responses',
  },
  openai: {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    openaiMode: 'responses',
  },
  'custom:anthropic': {
    apiKey: '',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    model: 'glm-4.7',
    openaiMode: 'responses',
  },
  'custom:openai': {
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.2',
    openaiMode: 'responses',
  },
};

const defaultConfigSet: ApiConfigSet = {
  id: DEFAULT_CONFIG_SET_ID,
  name: '默认方案',
  isSystem: true,
  provider: 'openrouter',
  customProtocol: 'anthropic',
  activeProfileKey: 'openrouter',
  profiles: defaultProfiles,
  enableThinking: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
};

const defaultConfig: AppConfig = {
  provider: defaultConfigSet.provider,
  apiKey: defaultProfiles.openrouter.apiKey,
  baseUrl: defaultProfiles.openrouter.baseUrl,
  customProtocol: defaultConfigSet.customProtocol,
  model: defaultProfiles.openrouter.model,
  openaiMode: defaultProfiles.openrouter.openaiMode || 'responses',
  activeProfileKey: defaultConfigSet.activeProfileKey,
  profiles: defaultProfiles,
  activeConfigSetId: DEFAULT_CONFIG_SET_ID,
  configSets: [defaultConfigSet],
  claudeCodePath: '',
  defaultWorkdir: '',
  globalSkillsPath: '',
  enableDevLogs: true,
  sandboxEnabled: false,
  enableThinking: false,
  isConfigured: false,
};

// Provider presets
export const PROVIDER_PRESETS = {
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    models: [
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'moonshotai/kimi-k2-0905', name: 'Kimi K2' },
      { id: 'z-ai/glm-4.7', name: 'GLM-4.7' },
    ],
    keyPlaceholder: 'sk-or-v1-...',
    keyHint: '从 openrouter.ai/keys 获取',
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: [
      { id: 'claude-sonnet-4-5', name: 'claude-sonnet-4-5' },
      { id: 'claude-opus-4-5', name: 'claude-opus-4-5' },
      { id: 'claude-haiku-4-5', name: 'claude-haiku-4-5' },
    ],
    keyPlaceholder: 'sk-ant-...',
    keyHint: '从 console.anthropic.com 获取',
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-5.2', name: 'gpt-5.2' },
      { id: 'gpt-5.2-codex', name: 'gpt-5.2-codex' },
      { id: 'gpt-5.2-mini', name: 'gpt-5.2-mini' },
    ],
    keyPlaceholder: 'sk-...',
    keyHint: '从 platform.openai.com 获取',
  },
  custom: {
    name: '更多模型',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    models: [
      { id: 'glm-4.7', name: 'GLM-4.7' },
      { id: 'glm-4-plus', name: 'GLM-4-Plus' },
      { id: 'glm-4-air', name: 'GLM-4-Air' },
    ],
    keyPlaceholder: 'sk-xxx',
    keyHint: '输入你的 API Key',
  },
};

const PROFILE_KEYS: ProviderProfileKey[] = ['openrouter', 'anthropic', 'openai', 'custom:anthropic', 'custom:openai'];

function isProviderType(value: unknown): value is ProviderType {
  return value === 'openrouter' || value === 'anthropic' || value === 'custom' || value === 'openai';
}

function isCustomProtocol(value: unknown): value is CustomProtocolType {
  return value === 'anthropic' || value === 'openai';
}

function isProfileKey(value: unknown): value is ProviderProfileKey {
  return typeof value === 'string' && PROFILE_KEYS.includes(value as ProviderProfileKey);
}

function profileKeyFromProvider(provider: ProviderType, customProtocol: CustomProtocolType = 'anthropic'): ProviderProfileKey {
  if (provider !== 'custom') {
    return provider;
  }
  return customProtocol === 'openai' ? 'custom:openai' : 'custom:anthropic';
}

function profileKeyToProvider(profileKey: ProviderProfileKey): { provider: ProviderType; customProtocol: CustomProtocolType } {
  if (profileKey === 'custom:openai') {
    return { provider: 'custom', customProtocol: 'openai' };
  }
  if (profileKey === 'custom:anthropic') {
    return { provider: 'custom', customProtocol: 'anthropic' };
  }
  return { provider: profileKey, customProtocol: 'anthropic' };
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nowISO(): string {
  return new Date().toISOString();
}

export class ConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    const storeOptions: any = {
      name: 'config',
      defaults: defaultConfig,
      // Encrypt the API key for basic security
      encryptionKey: 'open-cowork-config-v1',
    };

    // Add projectName for non-Electron environments (e.g., MCP servers)
    // This is required by the underlying 'conf' package
    if (typeof process !== 'undefined' && !process.versions.electron) {
      storeOptions.projectName = 'open-cowork';
    }

    this.store = new Store<AppConfig>(storeOptions);
    this.ensureNormalized();
  }

  private ensureNormalized(): void {
    const normalized = this.normalizeConfig(this.store.store as Partial<AppConfig>);
    this.store.set(normalized);
  }

  private getDefaultProfile(profileKey: ProviderProfileKey): ProviderProfile {
    const fallback = defaultProfiles[profileKey];
    return {
      apiKey: fallback.apiKey,
      baseUrl: fallback.baseUrl,
      model: fallback.model,
      openaiMode: fallback.openaiMode || 'responses',
    };
  }

  private normalizeProfile(profileKey: ProviderProfileKey, profile: Partial<ProviderProfile> | undefined): ProviderProfile {
    const fallback = this.getDefaultProfile(profileKey);
    const model = typeof profile?.model === 'string' && profile.model.trim()
      ? profile.model.trim()
      : fallback.model;
    const baseUrl = typeof profile?.baseUrl === 'string' && profile.baseUrl.trim()
      ? profile.baseUrl.trim()
      : fallback.baseUrl;
    return {
      apiKey: typeof profile?.apiKey === 'string' ? profile.apiKey : '',
      baseUrl,
      model,
      openaiMode: profile?.openaiMode === 'chat' ? 'chat' : 'responses',
    };
  }

  private cloneProfiles(
    profiles: Partial<Record<ProviderProfileKey, ProviderProfile>> | undefined
  ): Record<ProviderProfileKey, ProviderProfile> {
    const cloned = {} as Record<ProviderProfileKey, ProviderProfile>;
    for (const key of PROFILE_KEYS) {
      cloned[key] = this.normalizeProfile(key, profiles?.[key]);
    }
    return cloned;
  }

  private normalizeLegacyProjection(raw: Partial<AppConfig>): {
    provider: ProviderType;
    customProtocol: CustomProtocolType;
    activeProfileKey: ProviderProfileKey;
    profiles: Record<ProviderProfileKey, ProviderProfile>;
    enableThinking: boolean;
  } {
    const provider = isProviderType(raw.provider) ? raw.provider : defaultConfig.provider;
    const customProtocol: CustomProtocolType = isCustomProtocol(raw.customProtocol) ? raw.customProtocol : 'anthropic';
    const derivedProfileKey = profileKeyFromProvider(provider, customProtocol);

    const hasAnyRawProfiles = Boolean(raw.profiles && Object.keys(raw.profiles).length > 0);
    const hasProfileUserData = PROFILE_KEYS.some((key) => {
      const rawProfile = raw.profiles?.[key];
      if (!rawProfile) {
        return false;
      }
      const fallback = this.getDefaultProfile(key);
      if (typeof rawProfile.apiKey === 'string' && rawProfile.apiKey.trim()) {
        return true;
      }
      if (typeof rawProfile.baseUrl === 'string' && rawProfile.baseUrl.trim() && rawProfile.baseUrl.trim() !== fallback.baseUrl) {
        return true;
      }
      if (typeof rawProfile.model === 'string' && rawProfile.model.trim() && rawProfile.model.trim() !== fallback.model) {
        return true;
      }
      return rawProfile.openaiMode === 'chat';
    });
    const shouldUseLegacyProjection = !hasAnyRawProfiles || !hasProfileUserData;

    let activeProfileKey: ProviderProfileKey = shouldUseLegacyProjection
      ? derivedProfileKey
      : (isProfileKey(raw.activeProfileKey) ? raw.activeProfileKey : derivedProfileKey);

    const profiles = this.cloneProfiles(raw.profiles);
    const hasLegacyProjection =
      typeof raw.apiKey === 'string' ||
      typeof raw.baseUrl === 'string' ||
      typeof raw.model === 'string';

    if (shouldUseLegacyProjection && hasLegacyProjection) {
      profiles[derivedProfileKey] = this.normalizeProfile(derivedProfileKey, {
        apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
        baseUrl: typeof raw.baseUrl === 'string' ? raw.baseUrl : undefined,
        model: typeof raw.model === 'string' ? raw.model : undefined,
        openaiMode: raw.openaiMode,
      });
      activeProfileKey = derivedProfileKey;
    }

    if (!profiles[activeProfileKey]) {
      activeProfileKey = derivedProfileKey;
    }

    return {
      provider,
      customProtocol,
      activeProfileKey,
      profiles,
      enableThinking: toBoolean(raw.enableThinking, defaultConfig.enableThinking),
    };
  }

  private projectFromConfigSet(configSet: ApiConfigSet): {
    provider: ProviderType;
    customProtocol: CustomProtocolType;
    activeProfileKey: ProviderProfileKey;
    profiles: Record<ProviderProfileKey, ProviderProfile>;
    apiKey: string;
    baseUrl?: string;
    model: string;
    openaiMode: 'responses' | 'chat';
    enableThinking: boolean;
  } {
    const profiles = this.cloneProfiles(configSet.profiles);
    const activeProfileKey = isProfileKey(configSet.activeProfileKey)
      ? configSet.activeProfileKey
      : profileKeyFromProvider(configSet.provider, configSet.customProtocol);
    const activeProfile = profiles[activeProfileKey] || this.getDefaultProfile(activeProfileKey);

    return {
      provider: configSet.provider,
      customProtocol: configSet.customProtocol,
      activeProfileKey,
      profiles,
      apiKey: activeProfile.apiKey,
      baseUrl: activeProfile.baseUrl,
      model: activeProfile.model,
      openaiMode: activeProfile.openaiMode === 'chat' ? 'chat' : 'responses',
      enableThinking: toBoolean(configSet.enableThinking, false),
    };
  }

  private normalizeConfigSet(
    rawSet: Partial<ApiConfigSet> | undefined,
    fallback: {
      id: string;
      name: string;
      provider: ProviderType;
      customProtocol: CustomProtocolType;
      activeProfileKey: ProviderProfileKey;
      profiles: Record<ProviderProfileKey, ProviderProfile>;
      enableThinking: boolean;
      isSystem?: boolean;
    }
  ): ApiConfigSet {
    const provider = isProviderType(rawSet?.provider) ? rawSet.provider : fallback.provider;
    const customProtocol: CustomProtocolType = isCustomProtocol(rawSet?.customProtocol)
      ? rawSet.customProtocol
      : fallback.customProtocol;

    const derivedProfileKey = profileKeyFromProvider(provider, customProtocol);
    const activeProfileKey = isProfileKey(rawSet?.activeProfileKey)
      ? rawSet.activeProfileKey
      : fallback.activeProfileKey || derivedProfileKey;

    const profiles = this.cloneProfiles(rawSet?.profiles || fallback.profiles);

    if (!profiles[activeProfileKey]) {
      profiles[activeProfileKey] = this.getDefaultProfile(activeProfileKey);
    }

    const id = toNonEmptyString(rawSet?.id) || fallback.id;
    const name = toNonEmptyString(rawSet?.name) || fallback.name;
    const updatedAt = toNonEmptyString(rawSet?.updatedAt) || nowISO();

    return {
      id,
      name,
      isSystem: toBoolean(rawSet?.isSystem, Boolean(fallback.isSystem)),
      provider,
      customProtocol,
      activeProfileKey,
      profiles,
      enableThinking: toBoolean(rawSet?.enableThinking, fallback.enableThinking),
      updatedAt,
    };
  }

  private makeDefaultConfigSetFromLegacy(legacy: {
    provider: ProviderType;
    customProtocol: CustomProtocolType;
    activeProfileKey: ProviderProfileKey;
    profiles: Record<ProviderProfileKey, ProviderProfile>;
    enableThinking: boolean;
  }): ApiConfigSet {
    return this.normalizeConfigSet(
      {
        id: DEFAULT_CONFIG_SET_ID,
        name: defaultConfigSet.name,
        isSystem: true,
        provider: legacy.provider,
        customProtocol: legacy.customProtocol,
        activeProfileKey: legacy.activeProfileKey,
        profiles: legacy.profiles,
        enableThinking: legacy.enableThinking,
        updatedAt: nowISO(),
      },
      {
        id: DEFAULT_CONFIG_SET_ID,
        name: defaultConfigSet.name,
        isSystem: true,
        provider: legacy.provider,
        customProtocol: legacy.customProtocol,
        activeProfileKey: legacy.activeProfileKey,
        profiles: legacy.profiles,
        enableThinking: legacy.enableThinking,
      }
    );
  }

  private normalizeConfigSets(
    rawSets: unknown,
    legacy: {
      provider: ProviderType;
      customProtocol: CustomProtocolType;
      activeProfileKey: ProviderProfileKey;
      profiles: Record<ProviderProfileKey, ProviderProfile>;
      enableThinking: boolean;
    }
  ): ApiConfigSet[] {
    const list = Array.isArray(rawSets) ? rawSets : [];
    if (list.length === 0) {
      return [this.makeDefaultConfigSetFromLegacy(legacy)];
    }

    const normalized: ApiConfigSet[] = [];
    const usedIds = new Set<string>();

    for (let index = 0; index < list.length; index += 1) {
      const rawSet = (list[index] || {}) as Partial<ApiConfigSet>;
      const seedId = toNonEmptyString(rawSet.id) || `set-${index + 1}`;
      let nextId = seedId;
      let suffix = 2;
      while (usedIds.has(nextId)) {
        nextId = `${seedId}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(nextId);

      const normalizedSet = this.normalizeConfigSet(rawSet, {
        id: nextId,
        name: toNonEmptyString(rawSet.name) || `方案 ${index + 1}`,
        provider: legacy.provider,
        customProtocol: legacy.customProtocol,
        activeProfileKey: legacy.activeProfileKey,
        profiles: legacy.profiles,
        enableThinking: legacy.enableThinking,
        isSystem: Boolean(rawSet.isSystem),
      });
      normalizedSet.id = nextId;
      normalized.push(normalizedSet);
    }

    const hasSystemSet = normalized.some((set) => set.isSystem);
    if (!hasSystemSet) {
      normalized.unshift(this.makeDefaultConfigSetFromLegacy(legacy));
    }

    return normalized;
  }

  private hasLegacySignal(legacy: {
    provider: ProviderType;
    customProtocol: CustomProtocolType;
    activeProfileKey: ProviderProfileKey;
    profiles: Record<ProviderProfileKey, ProviderProfile>;
    enableThinking: boolean;
  }): boolean {
    if (
      legacy.provider !== defaultConfig.provider ||
      legacy.customProtocol !== (defaultConfig.customProtocol || 'anthropic') ||
      legacy.activeProfileKey !== defaultConfig.activeProfileKey ||
      legacy.enableThinking !== defaultConfig.enableThinking
    ) {
      return true;
    }

    const activeProfile = legacy.profiles[legacy.activeProfileKey];
    const fallbackActive = this.getDefaultProfile(legacy.activeProfileKey);
    return Boolean(
      activeProfile.apiKey.trim() ||
      (activeProfile.baseUrl || '') !== (fallbackActive.baseUrl || '') ||
      activeProfile.model !== fallbackActive.model ||
      (activeProfile.openaiMode === 'chat')
    );
  }

  private shouldPreferLegacyConfigSetProjection(
    normalizedSets: ApiConfigSet[],
    legacy: {
      provider: ProviderType;
      customProtocol: CustomProtocolType;
      activeProfileKey: ProviderProfileKey;
      profiles: Record<ProviderProfileKey, ProviderProfile>;
      enableThinking: boolean;
    }
  ): boolean {
    if (!this.hasLegacySignal(legacy)) {
      return false;
    }
    if (normalizedSets.length !== 1) {
      return false;
    }

    const onlySet = normalizedSets[0];
    if (!(onlySet.id === DEFAULT_CONFIG_SET_ID && onlySet.isSystem)) {
      return false;
    }

    const projected = this.projectFromConfigSet(onlySet);
    const legacyActive = legacy.profiles[legacy.activeProfileKey];
    return !(
      projected.provider === legacy.provider &&
      projected.customProtocol === legacy.customProtocol &&
      projected.activeProfileKey === legacy.activeProfileKey &&
      projected.enableThinking === legacy.enableThinking &&
      projected.apiKey === legacyActive.apiKey &&
      (projected.baseUrl || '') === (legacyActive.baseUrl || '') &&
      projected.model === legacyActive.model &&
      projected.openaiMode === (legacyActive.openaiMode === 'chat' ? 'chat' : 'responses')
    );
  }

  private normalizeConfig(rawConfig: Partial<AppConfig> | undefined): AppConfig {
    const raw = rawConfig || {};
    const legacy = this.normalizeLegacyProjection(raw);
    const normalizedFromRaw = this.normalizeConfigSets(raw.configSets, legacy);
    const configSets = this.shouldPreferLegacyConfigSetProjection(normalizedFromRaw, legacy)
      ? [this.makeDefaultConfigSetFromLegacy(legacy)]
      : normalizedFromRaw;

    const requestedActiveSetId = toNonEmptyString(raw.activeConfigSetId);
    const activeConfigSetId = configSets.some((set) => set.id === requestedActiveSetId)
      ? (requestedActiveSetId as string)
      : configSets[0].id;

    const activeConfigSet = configSets.find((set) => set.id === activeConfigSetId) || configSets[0];
    const projected = this.projectFromConfigSet(activeConfigSet);

    return {
      provider: projected.provider,
      customProtocol: projected.customProtocol,
      apiKey: projected.apiKey,
      baseUrl: projected.baseUrl,
      model: projected.model,
      openaiMode: projected.openaiMode,
      activeProfileKey: projected.activeProfileKey,
      profiles: projected.profiles,
      activeConfigSetId,
      configSets,
      claudeCodePath: typeof raw.claudeCodePath === 'string' ? raw.claudeCodePath : defaultConfig.claudeCodePath,
      defaultWorkdir: typeof raw.defaultWorkdir === 'string' ? raw.defaultWorkdir : defaultConfig.defaultWorkdir,
      globalSkillsPath: typeof raw.globalSkillsPath === 'string' ? raw.globalSkillsPath : defaultConfig.globalSkillsPath,
      enableDevLogs: toBoolean(raw.enableDevLogs, defaultConfig.enableDevLogs),
      sandboxEnabled: toBoolean(raw.sandboxEnabled, defaultConfig.sandboxEnabled),
      enableThinking: projected.enableThinking,
      isConfigured: toBoolean(raw.isConfigured, defaultConfig.isConfigured),
    };
  }

  private cloneConfigSet(configSet: ApiConfigSet): ApiConfigSet {
    return {
      ...configSet,
      profiles: this.cloneProfiles(configSet.profiles),
      updatedAt: toNonEmptyString(configSet.updatedAt) || nowISO(),
    };
  }

  private saveConfig(config: AppConfig): void {
    const normalized = this.normalizeConfig(config);
    this.store.set(normalized);
  }

  private composeProjectedConfig(
    base: AppConfig,
    nextConfigSets: ApiConfigSet[],
    requestedActiveConfigSetId: string
  ): AppConfig {
    const activeConfigSet = nextConfigSets.find((set) => set.id === requestedActiveConfigSetId) || nextConfigSets[0];
    const projected = this.projectFromConfigSet(activeConfigSet);
    return {
      ...base,
      provider: projected.provider,
      customProtocol: projected.customProtocol,
      apiKey: projected.apiKey,
      baseUrl: projected.baseUrl,
      model: projected.model,
      openaiMode: projected.openaiMode,
      activeProfileKey: projected.activeProfileKey,
      profiles: projected.profiles,
      enableThinking: projected.enableThinking,
      activeConfigSetId: activeConfigSet.id,
      configSets: nextConfigSets,
    };
  }

  private buildUniqueConfigSetName(name: string, existingSets: ApiConfigSet[], excludeId?: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('配置方案名称不能为空');
    }

    const usedNames = new Set(
      existingSets
        .filter((set) => set.id !== excludeId)
        .map((set) => set.name)
    );

    if (!usedNames.has(trimmed)) {
      return trimmed;
    }

    let suffix = 2;
    let candidate = `${trimmed} (${suffix})`;
    while (usedNames.has(candidate)) {
      suffix += 1;
      candidate = `${trimmed} (${suffix})`;
    }
    return candidate;
  }

  private generateConfigSetId(existingSets: ApiConfigSet[]): ConfigSetId {
    let index = existingSets.length + 1;
    let candidate = `set-${index}`;
    const used = new Set(existingSets.map((set) => set.id));
    while (used.has(candidate)) {
      index += 1;
      candidate = `set-${index}`;
    }
    return candidate;
  }

  private buildBlankConfigSet(payload: {
    id: ConfigSetId;
    name: string;
    provider: ProviderType;
    customProtocol: CustomProtocolType;
  }): ApiConfigSet {
    const activeProfileKey = profileKeyFromProvider(payload.provider, payload.customProtocol);
    const profiles = this.cloneProfiles(undefined);
    const defaultProfile = this.getDefaultProfile(activeProfileKey);
    profiles[activeProfileKey] = this.normalizeProfile(activeProfileKey, {
      apiKey: '',
      baseUrl: defaultProfile.baseUrl,
      model: defaultProfile.model,
      openaiMode: 'responses',
    });

    return {
      id: payload.id,
      name: payload.name,
      isSystem: false,
      provider: payload.provider,
      customProtocol: payload.customProtocol,
      activeProfileKey,
      profiles,
      enableThinking: false,
      updatedAt: nowISO(),
    };
  }

  /**
   * Get all config
   */
  getAll(): AppConfig {
    return this.normalizeConfig(this.store.store as Partial<AppConfig>);
  }

  /**
   * Get a specific config value
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.getAll()[key];
  }

  /**
   * Set a specific config value
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.update({ [key]: value } as Partial<AppConfig>);
  }

  /**
   * Create a new named config set.
   * - mode=blank: create a fresh set from current provider/protocol defaults
   * - mode=clone: clone current/selected set
   */
  createSet(payload: CreateConfigSetPayload): AppConfig {
    const current = this.getAll();
    if (current.configSets.length >= MAX_CONFIG_SET_COUNT) {
      throw new Error(`最多只能保存 ${MAX_CONFIG_SET_COUNT} 个配置方案`);
    }

    const id = this.generateConfigSetId(current.configSets);
    const name = this.buildUniqueConfigSetName(payload.name, current.configSets);
    const mode: CreateSetMode = payload.mode === 'blank' ? 'blank' : 'clone';
    let newSet: ApiConfigSet;

    if (mode === 'blank') {
      const activeSet = current.configSets.find((set) => set.id === current.activeConfigSetId) || current.configSets[0];
      const seedProvider = activeSet?.provider || current.provider;
      const seedProtocol: CustomProtocolType = activeSet?.customProtocol === 'openai' ? 'openai' : 'anthropic';
      newSet = this.buildBlankConfigSet({
        id,
        name,
        provider: seedProvider,
        customProtocol: seedProtocol,
      });
    } else {
      const source = current.configSets.find((set) => set.id === payload.fromSetId)
        || current.configSets.find((set) => set.id === current.activeConfigSetId)
        || current.configSets[0];

      if (!source) {
        throw new Error('找不到可复制的配置方案');
      }

      const cloned = this.cloneConfigSet(source);
      newSet = {
        ...cloned,
        id,
        name,
        isSystem: false,
        updatedAt: nowISO(),
      };
    }

    this.saveConfig({
      ...this.composeProjectedConfig(current, [...current.configSets, newSet], id),
    } as AppConfig);

    return this.getAll();
  }

  renameSet(payload: { id: string; name: string }): AppConfig {
    const current = this.getAll();
    const target = current.configSets.find((set) => set.id === payload.id);
    if (!target) {
      throw new Error('配置方案不存在');
    }

    const nextName = this.buildUniqueConfigSetName(payload.name, current.configSets, payload.id);
    const nextSets = current.configSets.map((set) => {
      if (set.id !== payload.id) {
        return this.cloneConfigSet(set);
      }
      return {
        ...this.cloneConfigSet(set),
        name: nextName,
        updatedAt: nowISO(),
      };
    });

    this.saveConfig(this.composeProjectedConfig(current, nextSets, current.activeConfigSetId));

    return this.getAll();
  }

  deleteSet(payload: { id: string }): AppConfig {
    const current = this.getAll();
    const target = current.configSets.find((set) => set.id === payload.id);
    if (!target) {
      throw new Error('配置方案不存在');
    }
    if (target.isSystem) {
      throw new Error('默认方案不可删除');
    }
    if (current.configSets.length <= 1) {
      throw new Error('至少需要保留一个配置方案');
    }

    const nextSets = current.configSets
      .filter((set) => set.id !== payload.id)
      .map((set) => this.cloneConfigSet(set));

    const fallbackActive = nextSets.find((set) => set.isSystem)?.id || nextSets[0]?.id;
    const nextActiveConfigSetId = current.activeConfigSetId === payload.id
      ? fallbackActive
      : current.activeConfigSetId;

    this.saveConfig(this.composeProjectedConfig(current, nextSets, nextActiveConfigSetId));

    return this.getAll();
  }

  switchSet(payload: { id: string }): AppConfig {
    const current = this.getAll();
    if (!current.configSets.some((set) => set.id === payload.id)) {
      throw new Error('配置方案不存在');
    }

    this.saveConfig(this.composeProjectedConfig(current, current.configSets, payload.id));

    return this.getAll();
  }

  /**
   * Update multiple config values
   */
  update(updates: Partial<AppConfig>): void {
    const current = this.getAll();
    let nextConfigSets = current.configSets.map((set) => this.cloneConfigSet(set));

    if (Array.isArray(updates.configSets) && updates.configSets.length > 0) {
      const normalizedSets = this.normalizeConfigSets(updates.configSets, {
        provider: current.provider,
        customProtocol: current.customProtocol === 'openai' ? 'openai' : 'anthropic',
        activeProfileKey: current.activeProfileKey,
        profiles: this.cloneProfiles(current.profiles),
        enableThinking: current.enableThinking,
      });
      nextConfigSets = normalizedSets;
    }

    const requestedActiveConfigSetId = toNonEmptyString(updates.activeConfigSetId) || current.activeConfigSetId;
    const activeConfigSetId = nextConfigSets.some((set) => set.id === requestedActiveConfigSetId)
      ? requestedActiveConfigSetId
      : nextConfigSets[0].id;

    const targetIndex = nextConfigSets.findIndex((set) => set.id === activeConfigSetId);
    const targetSet = targetIndex >= 0
      ? this.cloneConfigSet(nextConfigSets[targetIndex])
      : this.cloneConfigSet(nextConfigSets[0]);

    let nextProfiles = this.cloneProfiles(targetSet.profiles);
    let nextActiveProfileKey = targetSet.activeProfileKey;
    let nextProvider = targetSet.provider;
    let nextCustomProtocol: CustomProtocolType = targetSet.customProtocol === 'openai' ? 'openai' : 'anthropic';

    const mutatesActiveSet =
      updates.profiles !== undefined ||
      updates.activeProfileKey !== undefined ||
      updates.provider !== undefined ||
      updates.customProtocol !== undefined ||
      updates.apiKey !== undefined ||
      updates.baseUrl !== undefined ||
      updates.model !== undefined ||
      updates.openaiMode !== undefined ||
      updates.enableThinking !== undefined;

    if (mutatesActiveSet) {
      if (updates.profiles) {
        for (const key of PROFILE_KEYS) {
          if (updates.profiles[key]) {
            nextProfiles[key] = this.normalizeProfile(key, updates.profiles[key]);
          }
        }
      }

      if (isProfileKey(updates.activeProfileKey)) {
        nextActiveProfileKey = updates.activeProfileKey;
        const fromProfile = profileKeyToProvider(nextActiveProfileKey);
        nextProvider = fromProfile.provider;
        nextCustomProtocol = fromProfile.customProtocol;
      }

      if (updates.provider || updates.customProtocol) {
        const requestedProvider = isProviderType(updates.provider) ? updates.provider : nextProvider;
        const requestedProtocol = requestedProvider === 'custom'
          ? (isCustomProtocol(updates.customProtocol) ? updates.customProtocol : nextCustomProtocol)
          : 'anthropic';
        nextActiveProfileKey = profileKeyFromProvider(requestedProvider, requestedProtocol);
        const fromProfile = profileKeyToProvider(nextActiveProfileKey);
        nextProvider = fromProfile.provider;
        nextCustomProtocol = fromProfile.customProtocol;
      }

      const nextActiveProfile = {
        ...nextProfiles[nextActiveProfileKey],
      };
      if (updates.apiKey !== undefined) {
        nextActiveProfile.apiKey = updates.apiKey;
      }
      if (updates.baseUrl !== undefined) {
        const baseUrl = updates.baseUrl?.trim();
        nextActiveProfile.baseUrl = baseUrl || this.getDefaultProfile(nextActiveProfileKey).baseUrl;
      }
      if (updates.model !== undefined) {
        const model = updates.model?.trim();
        nextActiveProfile.model = model || this.getDefaultProfile(nextActiveProfileKey).model;
      }
      if (updates.openaiMode !== undefined) {
        nextActiveProfile.openaiMode = updates.openaiMode === 'chat' ? 'chat' : 'responses';
      }
      nextProfiles[nextActiveProfileKey] = this.normalizeProfile(nextActiveProfileKey, nextActiveProfile);

      const updatedSet: ApiConfigSet = {
        ...targetSet,
        provider: nextProvider,
        customProtocol: nextCustomProtocol,
        activeProfileKey: nextActiveProfileKey,
        profiles: nextProfiles,
        enableThinking: updates.enableThinking !== undefined ? updates.enableThinking : targetSet.enableThinking,
        updatedAt: nowISO(),
      };

      if (targetIndex >= 0) {
        nextConfigSets[targetIndex] = updatedSet;
      }
    }

    const projectedConfig = this.composeProjectedConfig(current, nextConfigSets, activeConfigSetId);
    this.saveConfig({
      ...projectedConfig,
      claudeCodePath: updates.claudeCodePath !== undefined ? updates.claudeCodePath : current.claudeCodePath,
      defaultWorkdir: updates.defaultWorkdir !== undefined ? updates.defaultWorkdir : current.defaultWorkdir,
      globalSkillsPath: updates.globalSkillsPath !== undefined ? updates.globalSkillsPath : current.globalSkillsPath,
      enableDevLogs: updates.enableDevLogs !== undefined ? updates.enableDevLogs : current.enableDevLogs,
      sandboxEnabled: updates.sandboxEnabled !== undefined ? updates.sandboxEnabled : current.sandboxEnabled,
      isConfigured: updates.isConfigured !== undefined ? updates.isConfigured : current.isConfigured,
    });
  }

  /**
   * Check if the app is configured (has API key)
   */
  isConfigured(): boolean {
    return this.hasAnyUsableCredentials(this.getAll());
  }

  private hasUsableCredentialsForProjection(projection: {
    provider: ProviderType;
    customProtocol?: CustomProtocolType;
    apiKey?: string;
    baseUrl?: string;
  }): boolean {
    const apiKey = projection.apiKey?.trim();
    if (apiKey) {
      return true;
    }
    const protocol: CustomProtocolType = projection.customProtocol === 'openai' ? 'openai' : 'anthropic';
    if (!isOpenAIProvider({ provider: projection.provider, customProtocol: protocol })) {
      return false;
    }
    return resolveOpenAICredentials({
      provider: projection.provider,
      customProtocol: protocol,
      apiKey: projection.apiKey,
      baseUrl: projection.baseUrl,
    }) !== null;
  }

  hasUsableCredentials(config: AppConfig = this.getAll()): boolean {
    return this.hasUsableCredentialsForActiveSet(config);
  }

  hasUsableCredentialsForActiveSet(config: AppConfig = this.getAll()): boolean {
    const normalized = this.normalizeConfig(config);
    return this.hasUsableCredentialsForProjection({
      provider: normalized.provider,
      customProtocol: normalized.customProtocol,
      apiKey: normalized.apiKey,
      baseUrl: normalized.baseUrl,
    });
  }

  hasAnyUsableCredentials(config: AppConfig = this.getAll()): boolean {
    const normalized = this.normalizeConfig(config);
    return normalized.configSets.some((configSet) => {
      const projected = this.projectFromConfigSet(configSet);
      return this.hasUsableCredentialsForProjection({
        provider: projected.provider,
        customProtocol: projected.customProtocol,
        apiKey: projected.apiKey,
        baseUrl: projected.baseUrl,
      });
    });
  }

  /**
   * Apply config to environment variables
   * This should be called before creating sessions
   *
   * 环境变量映射：
   * - OpenAI 直连: OPENAI_API_KEY = apiKey, OPENAI_BASE_URL 可选
   * - Anthropic 直连: ANTHROPIC_API_KEY = apiKey
   * - Custom Anthropic: ANTHROPIC_API_KEY = apiKey
   * - OpenRouter: ANTHROPIC_AUTH_TOKEN = apiKey, ANTHROPIC_API_KEY = '' (proxy mode)
   */
  applyToEnv(): void {
    const config = this.getAll();
    const activeProfile = config.profiles?.[config.activeProfileKey] || {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      openaiMode: config.openaiMode,
    };
    const projectedConfig: AppConfig = {
      ...config,
      apiKey: activeProfile.apiKey || '',
      baseUrl: activeProfile.baseUrl,
      model: activeProfile.model || '',
      openaiMode: activeProfile.openaiMode === 'chat' ? 'chat' : 'responses',
    };

    // Clear all API-related env vars first to ensure clean state when switching providers
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.CLAUDE_MODEL;
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_API_MODE;
    delete process.env.OPENAI_ACCOUNT_ID;
    delete process.env.OPENAI_CODEX_OAUTH;

    const useOpenAI =
      projectedConfig.provider === 'openai' ||
      (projectedConfig.provider === 'custom' && projectedConfig.customProtocol === 'openai');

    if (useOpenAI) {
      const resolvedOpenAI = resolveOpenAICredentials(projectedConfig);
      if (resolvedOpenAI?.apiKey) {
        process.env.OPENAI_API_KEY = resolvedOpenAI.apiKey;
      }
      const openAIBaseUrl = resolvedOpenAI?.baseUrl || projectedConfig.baseUrl;
      if (openAIBaseUrl) {
        process.env.OPENAI_BASE_URL = openAIBaseUrl;
      }
      if (resolvedOpenAI?.accountId) {
        process.env.OPENAI_ACCOUNT_ID = resolvedOpenAI.accountId;
      }
      process.env.OPENAI_CODEX_OAUTH = resolvedOpenAI?.useCodexOAuth ? '1' : '0';
      if (projectedConfig.model) {
        process.env.OPENAI_MODEL = projectedConfig.model;
      }
      process.env.OPENAI_API_MODE = 'responses';
    } else {
      if (projectedConfig.provider === 'anthropic' || (projectedConfig.provider === 'custom' && projectedConfig.customProtocol !== 'openai')) {
        const useAuthToken = shouldUseAnthropicAuthToken(projectedConfig);
        if (projectedConfig.apiKey) {
          if (useAuthToken) {
            process.env.ANTHROPIC_AUTH_TOKEN = projectedConfig.apiKey;
          } else {
            process.env.ANTHROPIC_API_KEY = projectedConfig.apiKey;
          }
        }
        if (projectedConfig.baseUrl) {
          process.env.ANTHROPIC_BASE_URL = projectedConfig.baseUrl;
        }
        if (useAuthToken) {
          delete process.env.ANTHROPIC_API_KEY;
        } else {
          delete process.env.ANTHROPIC_AUTH_TOKEN;
        }
      } else {
        // OpenRouter: use ANTHROPIC_AUTH_TOKEN for proxy authentication
        if (projectedConfig.apiKey) {
          process.env.ANTHROPIC_AUTH_TOKEN = projectedConfig.apiKey;
        }
        if (projectedConfig.baseUrl) {
          process.env.ANTHROPIC_BASE_URL = projectedConfig.baseUrl;
        }
        // ANTHROPIC_API_KEY must be empty to prevent SDK from using it
        process.env.ANTHROPIC_API_KEY = '';
      }

      if (projectedConfig.model) {
        process.env.CLAUDE_MODEL = projectedConfig.model;
        process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = projectedConfig.model;
      }
    }

    // Only set CLAUDE_CODE_PATH if the configured path actually exists
    // This allows auto-detection to work when the configured path is invalid
    if (projectedConfig.claudeCodePath) {
      if (fs.existsSync(projectedConfig.claudeCodePath)) {
        process.env.CLAUDE_CODE_PATH = projectedConfig.claudeCodePath;
        log('[Config] Using configured Claude Code path:', projectedConfig.claudeCodePath);
      } else {
        log('[Config] Configured Claude Code path not found, will use auto-detection:', projectedConfig.claudeCodePath);
        // Don't set the env var, let auto-detection find it
      }
    }

    if (projectedConfig.defaultWorkdir) {
      process.env.COWORK_WORKDIR = projectedConfig.defaultWorkdir;
    }

    log('[Config] Applied env vars for provider:', projectedConfig.provider, {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '✓ Set' : '(empty/unset)',
      ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN ? '✓ Set' : '(empty/unset)',
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '(default)',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? '✓ Set' : '(empty/unset)',
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || '(default)',
      OPENAI_MODEL: process.env.OPENAI_MODEL || '(not set)',
      OPENAI_API_MODE: process.env.OPENAI_API_MODE || '(default)',
      OPENAI_ACCOUNT_ID: process.env.OPENAI_ACCOUNT_ID || '(not set)',
      OPENAI_CODEX_OAUTH: process.env.OPENAI_CODEX_OAUTH || '(not set)',
    });
  }

  /**
   * Reset config to defaults
   */
  reset(): void {
    this.store.clear();
    this.ensureNormalized();
  }

  /**
   * Get the store file path (for debugging)
   */
  getPath(): string {
    return this.store.path;
  }
}

// Singleton instance
export const configStore = new ConfigStore();
