import * as session_1 from './session.js';
export function resolveMarkAsReadTransport(ctx) {
  if ((0, session_1.getPageID)(ctx)) {
    return 'page-http';
  }
  if ((0, session_1.hasMqttClient)(ctx)) {
    return 'mqtt';
  }
  throw new Error('You can only use this function after you start listening.');
}
export function assertMqttCapability(ctx) {
  if (!(0, session_1.hasMqttClient)(ctx)) {
    throw new Error('MQTT client is not initialized');
  }
}
export function resolveThreadMutationTransport(ctx) {
  return (0, session_1.hasMqttClient)(ctx) ? 'mqtt' : 'http';
}
export const resolveThreadEmojiTransport = resolveThreadMutationTransport;
export default {
  resolveMarkAsReadTransport,
  assertMqttCapability,
  resolveThreadMutationTransport,
  resolveThreadEmojiTransport,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-session-capability-resolver',
  meta: { category: 'session', path: 'lib/session/capability-resolver.js' },
  setup(_ctx) {
    // provides: resolveMarkAsReadTransport, assertMqttCapability, resolveThreadMutationTransport, resolveThreadEmojiTransport
  },
};
