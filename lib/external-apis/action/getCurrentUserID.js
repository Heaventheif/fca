var n = Object.defineProperty;
var t = (e, r) => n(e, 'name', { value: r, configurable: !0 });
function s(e, r, u) {
  return t(function () {
    return u.userID;
  }, 'getCurrentUserID');
}
t(s, 'default');
export { s as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-action-get-current-user-id',
  meta: { category: 'external-api-action', path: 'lib/external-apis/action/getCurrentUserID.js' },
  setup(_ctx) {
    // see module exports
  },
};
