import { setClientProxy } from './client.js';

export function setProxy(proxyUrl) {
  setClientProxy(proxyUrl ?? null);
}

export default { setProxy };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-proxy',
  meta: { category: 'utils', path: 'lib/utils/request/proxy.js' },
  setup(_ctx) {
    // provides: setProxy
  },
};
