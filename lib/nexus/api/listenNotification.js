var u = Object.defineProperty;
var l = (r, e) => u(r, 'name', { value: e, configurable: !0 });
import a from './listenRealtime.js';
var p = l((r, e, o) => {
  const n = a(r, e, o);
  return () => {
    let t = null;
    return {
      start(s) {
        t = n(s);
      },
      stop() {
        t && (t.stop(), (t = null));
      },
    };
  };
}, 'default');
export { p as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-nexus-api-listen-notification',
  meta: { category: 'nexus', path: 'lib/nexus/api/listenNotification.js' },
  setup(_ctx) {
    // see module exports
  },
};
