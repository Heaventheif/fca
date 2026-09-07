var s = Object.defineProperty;
var f = (o, e) => s(o, 'name', { value: e, configurable: !0 });
function d(o, e) {
  let n, r;
  const c = {
    promise: new Promise((t, i) => {
      ((n = t), (r = i));
    }),
    resolve: n,
    reject: r,
  };
  if (typeof e == 'function')
    try {
      e(c);
    } catch (t) {
      r(t);
    }
  return c;
}
f(d, 'createDeferred');
export { d as createDeferred };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-utils-deferred',
  meta: { category: 'external-api-utils', path: 'lib/external-apis/utils/deferred.js' },
  setup(_ctx) {
    // provides: createDeferred
  },
};
