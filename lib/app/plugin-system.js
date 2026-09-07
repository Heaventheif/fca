import { createEventBus } from '../utils/event-bus.js';
import _logger from '../func/logger.js';
function _pluginLog(name, msg, level) {
  try { _logger(`[Plugin:${name}] ${msg}`, level); } catch { /* ignore */ }
}

export class PluginSystem {
  
  constructor(client, options = {}) {
    this._client = client;
    this._strict = options.strict ?? false;
    this._bus = options.bus ?? createEventBus({ keepHistory: false });

    
    this._plugins = new Map();
  }

  get bus() {
    return this._bus;
  }

  
  async register(plugin) {
    if (!plugin?.name) throw new Error('PluginSystem: plugin.name is required');

    if (this._plugins.has(plugin.name)) {
      if (this._strict) throw new Error(`PluginSystem: plugin "${plugin.name}" already registered`);
      return this; 
    }

    const ctx = this._makeContext(plugin.name);

    
    if (Array.isArray(plugin.middlewares)) {
      for (const mw of plugin.middlewares) this._client.use(mw);
    }

    
    if (plugin.pipes && typeof plugin.pipes === 'object') {
      for (const [event, handler] of Object.entries(plugin.pipes)) {
        this._client.pipe(event, handler);
      }
    }

    
    if (Array.isArray(plugin.commands)) {
      for (const cmd of plugin.commands) {
        this._client.command(cmd.name, cmd.handler, cmd.options ?? {});
      }
    }

    
    if (plugin.events && typeof plugin.events === 'object') {
      for (const [event, handler] of Object.entries(plugin.events)) {
        this._client.on(event, handler);
      }
    }

    
    if (typeof plugin.setup === 'function') {
      await plugin.setup(ctx);
    }

    this._plugins.set(plugin.name, plugin);
    this._bus.emit('plugin:registered', { name: plugin.name });
    return this;
  }

  
  async registerAll(...plugins) {
    for (const p of plugins.flat()) await this.register(p);
    return this;
  }

  
  has(name) {
    return this._plugins.has(name);
  }

  
  list() {
    return [...this._plugins.keys()];
  }

  _makeContext(pluginName) {
    const ns = this._bus.namespace(pluginName);
    return {
      client: this._client,
      api: this._client.api,
      bus: this._bus,
      ns, 
      logger: {
        info:  (msg) => _pluginLog(pluginName, msg, 'info'),
        warn:  (msg) => _pluginLog(pluginName, msg, 'warn'),
        error: (msg) => _pluginLog(pluginName, msg, 'error'),
      },
    };
  }
}

export function createPluginSystem(client, options) {
  return new PluginSystem(client, options);
}

export default { PluginSystem, createPluginSystem };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-plugin-system',
  meta: { category: 'app', path: 'lib/app/plugin-system.js' },
  setup(_ctx) {
    // provides: PluginSystem, createPluginSystem
  },
};
