import { channel } from 'node:diagnostics_channel';

export const channels = {
  
  httpRequest: channel('fca:http:request'),
  httpResponse: channel('fca:http:response'),

  
  mqttPublish: channel('fca:mqtt:publish'),
  mqttReceive: channel('fca:mqtt:receive'),

  
  loginAttempt: channel('fca:auth:login'),
  loginSuccess: channel('fca:auth:login:success'),
  loginFail: channel('fca:auth:login:fail'),

  
  rateLimitHit: channel('fca:ratelimit'),
  circuitChange: channel('fca:circuit'),

  
  error: channel('fca:error'),
};

export function publish(ch, data) {
  if (ch.hasSubscribers) {
    ch.publish(data);
  }
}

export function emitHttpRequest({ url, method, threadID, ctx }) {
  publish(channels.httpRequest, { url, method, threadID, timestamp: Date.now(), ctx });
}

export function emitHttpResponse({ url, method, status, durationMs, threadID }) {
  publish(channels.httpResponse, {
    url,
    method,
    status,
    durationMs,
    threadID,
    timestamp: Date.now(),
  });
}

export function emitMqttPublish({ topic, requestId, size }) {
  publish(channels.mqttPublish, { topic, requestId, size, timestamp: Date.now() });
}

export function emitMqttReceive({ topic, size }) {
  publish(channels.mqttReceive, { topic, size, timestamp: Date.now() });
}

export function emitError({ error, context }) {
  publish(channels.error, {
    error,
    code: error?.code ?? 'UNKNOWN',
    message: error?.message ?? String(error),
    context,
    timestamp: Date.now(),
  });
}

export function emitRateLimit({ threadID, waitMs }) {
  publish(channels.rateLimitHit, { threadID, waitMs, timestamp: Date.now() });
}

export function emitCircuitChange({ state, prevState, failures }) {
  publish(channels.circuitChange, { state, prevState, failures, timestamp: Date.now() });
}

export default {
  channels,
  publish,
  emitHttpRequest,
  emitHttpResponse,
  emitMqttPublish,
  emitMqttReceive,
  emitError,
  emitRateLimit,
  emitCircuitChange,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-observability-channels',
  meta: { category: 'observability', path: 'lib/observability/channels.js' },
  setup(_ctx) {
    // provides: channels, publish, emitHttpRequest, emitHttpResponse, emitMqttPublish, emitMqttReceive, emitError, emitRateLimit
  },
};
