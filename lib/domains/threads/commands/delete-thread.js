var d = Object.defineProperty;
var c = (r, t) => d(r, 'name', { value: t, configurable: !0 });
import * as u from '../../../compat/legacy-promise.js';
import * as f from '../../../transport/http/threads.js';
function h(r) {
  const { defaultFuncs: t, ctx: n, logError: i } = r;
  return c(function (a, l) {
    const { callback: o, promise: m } = (0, u.createLegacyPromise)(l),
      s = Array.isArray(a) ? a : [a];
    return (
      (0, f.deleteThreadsViaMercury)({ defaultFuncs: t, ctx: n, threadIDs: s })
        .then((e) => {
          if (e?.error) throw e;
          o();
        })
        .catch((e) => {
          (i?.('deleteThread', e), o(e));
        }),
      m
    );
  }, 'deleteThread');
}
c(h, 'createDeleteThreadCommand');
var g = { createDeleteThreadCommand: h };
export { h as createDeleteThreadCommand, g as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-threads-commands-delete-thread',
  meta: { category: 'domain-threads', path: 'lib/domains/threads/commands/delete-thread.js' },
  setup(_ctx) {
    // provides: createDeleteThreadCommand
  },
};
