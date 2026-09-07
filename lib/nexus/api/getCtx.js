var f = Object.defineProperty;
var s = (e, t) => f(e, 'name', { value: t, configurable: !0 });
var o = s(
  (e, t, a) =>
    (r = {}) => {
      if (r && r.allowSensitive === !0) return a;
      const { jar: n, fb_dtsg: i, jazoest: l, ...u } = a || {};
      return { ...u };
    },
  'default'
);
export { o as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-nexus-api-get-ctx',
  meta: { category: 'nexus', path: 'lib/nexus/api/getCtx.js' },
  setup(_ctx) {
    // see module exports
  },
};
