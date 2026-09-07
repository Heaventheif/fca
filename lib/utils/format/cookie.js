var n = Object.defineProperty;
var e = (o, t) => n(o, 'name', { value: t, configurable: !0 });
function $(o, t) {
  return `${o[0]}=${o[1]}; Path=${o[3]}; Domain=${t}.com`;
}
e($, 'formatCookie');
var i = { formatCookie: $ };
export { i as default, $ as formatCookie };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-format-cookie',
  meta: { category: 'utils', path: 'lib/utils/format/cookie.js' },
  setup(_ctx) {
    // provides: formatCookie
  },
};
