import * as ls_requests_1 from '../../../transport/realtime/ls-requests.js';

export function createSendTypingIndicatorV2Command(deps) {
  const { ctx, logError } = deps;

  let _counter = 0;

  
  return async function sendTypingIndicatorV2(isTyping, threadID, callback) {
    const cb = typeof callback === 'function' ? callback : () => {};

    if (!ctx.mqttClient) {
      const err = new Error('sendTypingIndicatorV2: MQTT not connected');
      cb(err);
      throw err;
    }

    ctx.wsReqNumber = (ctx.wsReqNumber ?? 0) + 1;
    const requestId = ctx.wsReqNumber;

    const isGroup = String(threadID).length >= 16;

    const content = {
      app_id: '2220391788200892',
      payload: JSON.stringify({
        label: '3',
        payload: JSON.stringify({
          thread_key: String(threadID),
          is_group_thread: isGroup ? 1 : 0,
          is_typing: isTyping ? 1 : 0,
          attribution: 0,
        }),
        version: '5849951561777440',
      }),
      request_id: ++_counter,
      type: 4,
    };

    try {
      await new Promise((resolve, reject) => {
        ctx.mqttClient.publish('/ls_req', JSON.stringify(content), { qos: 1 }, (err) =>
          err ? reject(err) : resolve()
        );
      });
      cb(null, { isTyping, threadID });
    } catch (err) {
      logError?.('sendTypingIndicatorV2', err);
      cb(err);
      throw err;
    }

    
    return async function stopTyping() {
      const stopContent = {
        ...content,
        payload: JSON.stringify({
          label: '3',
          payload: JSON.stringify({
            thread_key: String(threadID),
            is_group_thread: isGroup ? 1 : 0,
            is_typing: 0,
            attribution: 0,
          }),
          version: '5849951561777440',
        }),
        request_id: ++_counter,
      };
      await new Promise((resolve, reject) => {
        ctx.mqttClient?.publish('/ls_req', JSON.stringify(stopContent), { qos: 1 }, (err) =>
          err ? reject(err) : resolve()
        );
      });
    };
  };
}

export default { createSendTypingIndicatorV2Command };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-send-typing-indicator-v2',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/send-typing-indicator-v2.js' },
  setup(_ctx) {
    // provides: createSendTypingIndicatorV2Command
  },
};
