import { parseAndCheckLogin as e } from './parseAndCheckLogin.js';
import { cleanXssi as a } from './textUtils.js';
import { makeParsable as r } from './textUtils.js';
import { parseAndCheckLogin as i } from './parseAndCheckLogin.js';
import { cleanXssi as c } from './textUtils.js';
import { makeParsable as t } from './textUtils.js';
var m = { parseAndCheckLogin: e, cleanXssi: a, makeParsable: r };
export { c as cleanXssi, m as default, t as makeParsable, i as parseAndCheckLogin };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-login-parser-index',
  meta: { category: 'utils', path: 'lib/utils/loginParser/index.js' },
  setup(_ctx) {
    // provides: cleanXssi, makeParsable, parseAndCheckLogin
  },
};
