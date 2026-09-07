import { getThreadColors as e } from '../../threads/queries/get-thread-colors.js';
import { createGetThreadColorsQuery as r } from '../../threads/queries/get-thread-colors.js';
import { getThreadColors as l } from '../../threads/queries/get-thread-colors.js';
import { createGetThreadColorsQuery as C } from '../../threads/queries/get-thread-colors.js';
var a = { getThreadColors: e, createGetThreadColorsQuery: r };
export { C as createGetThreadColorsQuery, a as default, l as getThreadColors };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-queries-get-thread-colors',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/queries/get-thread-colors.js' },
  setup(_ctx) {
    // provides: createGetThreadColorsQuery, getThreadColors
  },
};
