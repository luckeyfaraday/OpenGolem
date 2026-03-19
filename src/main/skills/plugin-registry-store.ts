import Store from 'electron-store';
import type { InstalledPlugin } from '../../renderer/types';
import { getStableStoreCwd } from '../utils/persisted-store';

interface PluginRegistrySchema {
  plugins: InstalledPlugin[];
}

class PluginRegistryStore {
  private readonly store: Store<PluginRegistrySchema>;

  constructor() {
    const storeOptions: any = {
      name: 'plugin-registry',
      cwd: getStableStoreCwd(),
      defaults: {
        plugins: [],
      },
      clearInvalidConfig: true,
    };

    this.store = new Store<PluginRegistrySchema>(storeOptions);
  }

  list(): InstalledPlugin[] {
    return this.store
      .get('plugins', [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(pluginId: string): InstalledPlugin | undefined {
    return this.store.get('plugins', []).find((plugin) => plugin.pluginId === pluginId);
  }

  save(plugin: InstalledPlugin): InstalledPlugin {
    const plugins = this.store.get('plugins', []);
    const index = plugins.findIndex((item) => item.pluginId === plugin.pluginId);
    if (index >= 0) {
      plugins[index] = plugin;
    } else {
      plugins.push(plugin);
    }
    this.store.set('plugins', plugins);
    return plugin;
  }

  delete(pluginId: string): boolean {
    const plugins = this.store.get('plugins', []);
    const filtered = plugins.filter((item) => item.pluginId !== pluginId);
    if (filtered.length === plugins.length) {
      return false;
    }
    this.store.set('plugins', filtered);
    return true;
  }
}

export const pluginRegistryStore = new PluginRegistryStore();
