var n = Object.defineProperty;
var s = (o, t) => n(o, 'name', { value: t, configurable: !0 });
import * as c from '../../utils/client.js';
const r = 'https://www.facebook.com/ajax/messaging/attachments/sharedphotos.php';
async function p(o) {
  const { defaultFuncs: t, ctx: e, form: a } = o;
  return t.post(r, e.jar, a).then((0, c.parseAndCheckLogin)(e, t));
}
s(p, 'postSharedPhotosRequest');
var f = { postSharedPhotosRequest: p };
export { f as default, p as postSharedPhotosRequest };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-transport-http-shared-photos',
  meta: { category: 'transport', path: 'lib/transport/http/shared-photos.js' },
  setup(_ctx) {
    // provides: postSharedPhotosRequest
  },
};
