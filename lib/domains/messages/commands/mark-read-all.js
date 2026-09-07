var i = Object.defineProperty;
var t = (a, e) => i(a, 'name', { value: e, configurable: !0 });
import * as s from '../../../compat/legacy-promise.js';
import * as u from '../../../transport/http/mercury.js';
function d(a) {
  const { defaultFuncs: e, ctx: o, logError: l } = a;
  return t(function (m) {
    const { callback: c, promise: n } = (0, s.createLegacyPromise)(m);
    return (
      (0, u.markFolderAsReadViaMercury)({ defaultFuncs: e, ctx: o })
        .then((r) => {
          if (r?.error) throw r;
          c();
        })
        .catch((r) => {
          (l?.('markAsReadAll', r), c(r));
        }),
      n
    );
  }, 'markAsReadAll');
}
t(d, 'createMarkReadAllCommand');
var k = { createMarkReadAllCommand: d };
export { d as createMarkReadAllCommand, k as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-mark-read-all',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/mark-read-all.js' },
  setup(_ctx) {
    // provides: createMarkReadAllCommand
  },
};
