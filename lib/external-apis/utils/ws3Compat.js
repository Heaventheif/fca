var i = Object.defineProperty;
var n = (r, o) => i(r, 'name', { value: o, configurable: !0 });
import { parseAndCheckLogin as f } from '../../../lib/utils/client.js';
import { generateOfflineThreadingID as g, getGUID as c } from '../../../lib/utils/format/index.js';
import t from '../../../lib/func/logger.js';
function m(r) {
  t(r, 'info');
}
n(m, 'log');
function p(r) {
  t(r, 'warn');
}
n(p, 'warn');
function a(r, o) {
  const e = o ? `${r}: ${o}` : String(r);
  t(e, 'error');
}
n(a, 'error');
export {
  a as error,
  g as generateOfflineThreadingID,
  c as getGUID,
  m as log,
  f as parseAndCheckLogin,
  p as warn,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-utils-ws3-compat',
  meta: { category: 'external-api-utils', path: 'lib/external-apis/utils/ws3Compat.js' },
  setup(_ctx) {
    // provides: error, generateOfflineThreadingID, getGUID, log, parseAndCheckLogin, warn
  },
};
