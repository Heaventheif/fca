const e = [
  '/ls_req',
  '/ls_resp',
  '/legacy_web',
  '/webrtc',
  '/rtc_multi',
  '/onevc',
  '/br_sr',
  '/sr_res',
  '/t_ms',
  '/thread_typing',
  '/orca_typing_notifications',
  '/notify_disconnect',
  '/orca_presence',
  '/inbox',
  '/mercury',
  '/messaging_events',
  '/orca_message_notifications',
  '/pp',
  '/webrtc_response',
];
var s = { topics: e };
export { s as default, e as topics };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-transport-realtime-topics',
  meta: { category: 'transport', path: 'lib/transport/realtime/topics.js' },
  setup(_ctx) {
    // provides: topics
  },
};
