export * from './client.js';
export * from './core-modules.js';
export * from './core.js';
export * from './events.js';
export * from './messaging.js';
export * from './threads.js';
export * from './scheduler.js';

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-index',
  meta: { category: 'types', path: 'lib/types/index.js' },
  setup(_ctx) {
    // see module exports
  },
};
