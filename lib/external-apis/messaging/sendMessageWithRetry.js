export default function sendMessageWithRetryFactory(defaultFuncs, api, ctx) {
  return async function sendMessageWithRetry(msg, threadID, options = {}, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    const maxRetries = options.maxRetries ?? 3;
    const baseDelay = options.baseDelay ?? 1500;
    const maxDelay = options.maxDelay ?? 15000;
    const jitter = options.jitter !== false;
    const retryOn =
      typeof options.retryOn === 'function'
        ? options.retryOn
        : (err) => !String(err?.error ?? err?.message ?? '').includes('blocked');

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const withJitter = (ms) => {
      if (!jitter) return ms;
      const factor = 0.75 + Math.random() * 0.5; 
      return Math.min(maxDelay, Math.round(ms * factor));
    };

    const promise = (async () => {
      let lastErr;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await api.sendMessage(msg, threadID);
        } catch (err) {
          lastErr = err;
          const isLast = attempt === maxRetries;
          if (isLast || !retryOn(err)) throw err;
          const delay = withJitter(Math.min(baseDelay * 2 ** attempt, maxDelay));
          await sleep(delay);
        }
      }
      throw lastErr;
    })();

    if (typeof callback === 'function') {
      promise.then((r) => callback(null, r)).catch((e) => callback(e));
    }
    return promise;
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-messaging-send-message-with-retry',
  meta: { category: 'external-api-messaging', path: 'lib/external-apis/messaging/sendMessageWithRetry.js' },
  setup(_ctx) {
    // provides: sendMessageWithRetryFactory
  },
};
