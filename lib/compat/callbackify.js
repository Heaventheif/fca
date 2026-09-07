var o = Object.defineProperty;
var t = (e, n) => o(e, 'name', { value: n, configurable: !0 });
function r(e) {
  return typeof e == 'function' ? e : () => {};
}
t(r, 'ensureNodeCallback');
var f = { ensureNodeCallback: r };
export { f as default, r as ensureNodeCallback };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-compat-callbackify',
  meta: { category: 'compat', path: 'lib/compat/callbackify.js' },
  setup(_ctx) {
    // provides: ensureNodeCallback
  },
};
