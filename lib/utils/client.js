import * as e from './loginParser/index.js';
import { getAppState as o } from './cookies.js';
import { saveCookies as t } from './cookies.js';
import { getAppState as n } from './cookies.js';
import { saveCookies as f } from './cookies.js';
const r = e,
  p = r.parseAndCheckLogin;
var i = { getAppState: o, saveCookies: t, parseAndCheckLogin: p };
export { i as default, n as getAppState, p as parseAndCheckLogin, f as saveCookies };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-client',
  meta: { category: 'utils', path: 'lib/utils/client.js' },
  setup(_ctx) {
    // provides: getAppState, parseAndCheckLogin, saveCookies
  },
};
