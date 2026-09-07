var o = Object.defineProperty;
var t = (e, r) => o(e, 'name', { value: r, configurable: !0 });
import * as i from './listener.js';
function a(e) {
  return { listen: (0, i.createRealtimeListener)(e) };
}
t(a, 'createRealtimeDomain');
export * from './listener.js';
export * from './middleware.js';
var n = { createRealtimeDomain: a };
export { a as createRealtimeDomain, n as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-realtime-index',
  meta: { category: 'domain-realtime', path: 'lib/domains/realtime/index.js' },
  setup(_ctx) {
    // provides: createRealtimeDomain
  },
};
