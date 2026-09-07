export const FCA_VERSION = '5.1.0-esm+fixed+patched';

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-core-modules',
  meta: { category: 'types', path: 'lib/types/core-modules.js' },
  setup(_ctx) {
    // provides: FCA_VERSION
  },
};
