var n = Object.defineProperty;
var t = (e, r) => n(e, 'name', { value: r, configurable: !0 });
function u(e) {
  const { ctx: r } = e;
  return t(function () {
    return r.userID;
  }, 'getCurrentUserID');
}
t(u, 'createGetCurrentUserIdCommand');
var s = { createGetCurrentUserIdCommand: u };
export { u as createGetCurrentUserIdCommand, s as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-account-commands-get-current-user-id',
  meta: { category: 'domain-account', path: 'lib/domains/account/commands/get-current-user-id.js' },
  setup(_ctx) {
    // provides: createGetCurrentUserIdCommand
  },
};
