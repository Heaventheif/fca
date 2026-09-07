var a = Object.defineProperty;
var r = (i, e) => a(i, 'name', { value: e, configurable: !0 });
function h() {
  return r(function (e, c, d = '1.0') {
    const s = e.codePointAt(0),
      n = `${d}/${c}/${s?.toString(16)}.png`;
    let t = 317426846;
    for (let o = 0; o < n.length; o += 1) t = (t << 5) - t + n.charCodeAt(o);
    return `https://static.xx.fbcdn.net/images/emoji.php/v8/z${(t & 255).toString(16)}/${n}`;
  }, 'getEmojiUrl');
}
r(h, 'createGetEmojiUrlQuery');
var p = { createGetEmojiUrlQuery: h };
export { h as createGetEmojiUrlQuery, p as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-queries-get-emoji-url',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/queries/get-emoji-url.js' },
  setup(_ctx) {
    // provides: createGetEmojiUrlQuery
  },
};
