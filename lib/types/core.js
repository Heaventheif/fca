export const FcaLogLevels = Object.freeze({
  SILENT: 'silent',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
});

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-core',
  meta: { category: 'types', path: 'lib/types/core.js' },
  setup(_ctx) {
    // provides: FcaLogLevels
  },
};
