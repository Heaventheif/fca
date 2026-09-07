import { emitMqttPublish } from '../../observability/channels.js';

export async function publishLsRequestWithAck(params) {
  const {
    client,
    content,
    requestId,
    topic = '/ls_req',
    responseTopic = '/ls_resp',
    timeoutMs = 15000,
    extract,
    abortSignal = null,
  } = params;

  if (
    !client ||
    typeof client.on !== 'function' ||
    typeof client.publish !== 'function' ||
    typeof client.removeListener !== 'function'
  ) {
    throw new Error('MQTT client is not initialized');
  }

  if (typeof client.setMaxListeners === 'function') {
    client.setMaxListeners(50);
  }

  
  let timeoutSignal;
  try {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
  } catch {
    timeoutSignal = null;
  }

  
  const combinedSignal =
    abortSignal && timeoutSignal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([timeoutSignal, abortSignal])
      : timeoutSignal || abortSignal;

  
  emitMqttPublish({ topic, requestId, size: JSON.stringify(content).length });

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      client.removeListener('message', onMessage);
      if (combinedSignal) combinedSignal.removeEventListener('abort', onAbort);
    };

    const settle = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => {
      const isTimeout = timeoutSignal?.aborted;
      settle(() =>
        reject(
          isTimeout
            ? Object.assign(
                new Error(`MQTT ACK timeout after ${timeoutMs}ms (req: ${requestId})`),
                { code: 'MQTT_TIMEOUT', requestId }
              )
            : Object.assign(new Error('MQTT request aborted'), {
                code: 'MQTT_ABORTED',
                cause: combinedSignal?.reason,
              })
        )
      );
    };

    if (combinedSignal) {
      if (combinedSignal.aborted) {
        onAbort();
        return;
      }
      combinedSignal.addEventListener('abort', onAbort, { once: true });
    }

    const onMessage = (incomingTopic, rawMessage) => {
      if (incomingTopic !== responseTopic) return;
      let parsed;
      try {
        parsed = JSON.parse(rawMessage.toString());
        if (typeof parsed.payload === 'string') parsed.payload = JSON.parse(parsed.payload);
      } catch {
        return;
      }

      if (parsed.request_id !== requestId) return;

      settle(() => {
        try {
          resolve(extract(parsed));
        } catch (err) {
          reject(err);
        }
      });
    };

    client.on('message', onMessage);

    client.publish(topic, JSON.stringify(content), { qos: 1, retain: false }, (err) => {
      if (err)
        settle(() =>
          reject(
            Object.assign(new Error('MQTT publish failed'), {
              code: 'MQTT_PUBLISH_ERROR',
              cause: err,
            })
          )
        );
    });
  });
}

export default { publishLsRequestWithAck };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-transport-realtime-ls-requests',
  meta: { category: 'transport', path: 'lib/transport/realtime/ls-requests.js' },
  setup(_ctx) {
    // provides: publishLsRequestWithAck
  },
};
