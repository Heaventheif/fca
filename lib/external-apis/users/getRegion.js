var r = Object.defineProperty;
var t = (e, n) => r(e, 'name', { value: n, configurable: !0 });
function i(e, n, u) {
  return t(function () {
    return u?.region;
  }, 'getRegion');
}
t(i, 'default');
export { i as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-users-get-region',
  meta: { category: 'external-api-users', path: 'lib/external-apis/users/getRegion.js' },
  setup(_ctx) {
    // see module exports
  },
};
