/**
 * sendMessageWithRetry — إرسال تلقائي مع retry وexponential backoff
 *
 * Options:
 *   maxRetries {number}  عدد المحاولات الإجمالية  (default: 3)
 *   baseDelay  {number}  ms أول تأخير             (default: 1500)
 *   maxDelay   {number}  ms أقصى تأخير            (default: 15000)
 *   jitter     {boolean} إضافة ±25% عشوائية       (default: true)
 *   retryOn    {fn}      (err) => bool لتحديد متى نعيد  (default: كل الأخطاء)
 */
export default function sendMessageWithRetryFactory(defaultFuncs, api, ctx) {
  return async function sendMessageWithRetry(msg, threadID, options = {}, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }

    const maxRetries = options.maxRetries ?? 3;
    const baseDelay  = options.baseDelay  ?? 1500;
    const maxDelay   = options.maxDelay   ?? 15000;
    const jitter     = options.jitter     !== false;
    const retryOn    = typeof options.retryOn === 'function'
      ? options.retryOn
      : err => !String(err?.error ?? err?.message ?? '').includes('blocked');

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const withJitter = ms => {
      if (!jitter) return ms;
      const factor = 0.75 + Math.random() * 0.5; // ±25%
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
      promise.then(r => callback(null, r)).catch(e => callback(e));
    }
    return promise;
  };
}
