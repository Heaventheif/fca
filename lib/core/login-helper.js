import e from './login-helper.impl.js';
const l = { default: e },
  o = l.default;
var p = o;
export { p as default, o as legacy };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-core-login-helper',
  meta: { category: 'core', path: 'lib/core/login-helper.js' },
  setup(_ctx) {
    // provides: legacy
  },
};
