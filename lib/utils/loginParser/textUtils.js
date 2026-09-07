var l = Object.defineProperty;
var n = (e, r) => l(e, 'name', { value: r, configurable: !0 });
function s(e) {
  if (e == null) return '';
  let r = String(e);
  return (
    (r = r.replace(/^[\uFEFF\xEF\xBB\xBF]+/, '')),
    (r = r.replace(/^\)\]\}',?\s*/, '')),
    (r = r.replace(/^\s*for\s*\(;;\);\s*/i, '')),
    r
  );
}
n(s, 'cleanXssi');
function i(e) {
  const r = s(String(e || '')),
    t = r.split(/\}\r?\n\s*\{/);
  return t.length === 1 ? r : `[${t.join('},{')}]`;
}
n(i, 'makeParsable');
var o = { cleanXssi: s, makeParsable: i };
export { s as cleanXssi, o as default, i as makeParsable };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-login-parser-text-utils',
  meta: { category: 'utils', path: 'lib/utils/loginParser/textUtils.js' },
  setup(_ctx) {
    // provides: cleanXssi, makeParsable
  },
};
