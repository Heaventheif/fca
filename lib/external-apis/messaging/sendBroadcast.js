/**
 * sendBroadcast — إرسال رسالة لعدة threads مع rate limiting وtracking دقيق
 *
 * Options:
 *   delay    {number}   ms بين كل batch (default: 1200)
 *   parallel {number}   max concurrent sends (default: 3)
 *   onEach   {function} callback(err, result, threadID) بعد كل إرسال
 *   stopOnFirstError {boolean} يوقف عند أول فشل (default: false)
 */
export default function sendBroadcastFactory(defaultFuncs, api, ctx) {
  return async function sendBroadcast(msg, threadIDs, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    options = options || {};

    const delay    = typeof options.delay    === 'number' ? options.delay    : 1200;
    const parallel = typeof options.parallel === 'number' ? options.parallel : 3;
    const onEach   = typeof options.onEach   === 'function' ? options.onEach : null;
    const stopOnFirstError = !!options.stopOnFirstError;

    if (!Array.isArray(threadIDs) || threadIDs.length === 0) {
      const err = new Error('sendBroadcast: threadIDs must be a non-empty array.');
      if (typeof callback === 'function') return callback(err);
      return Promise.reject(err);
    }

    const sent   = [];
    const failed = [];
    const ids    = threadIDs.slice();

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const sendOne = async id => {
      try {
        const info = await api.sendMessage(msg, String(id));
        sent.push(String(id));
        if (onEach) onEach(null, info, id);
      } catch (e) {
        failed.push({ id: String(id), error: e?.message ?? String(e) });
        if (onEach) onEach(e, null, id);
        if (stopOnFirstError) throw e;
      }
    };

    const promise = (async () => {
      for (let i = 0; i < ids.length; i += parallel) {
        const batch = ids.slice(i, i + parallel);
        await Promise.all(batch.map((id, idx) => sleep(idx * delay).then(() => sendOne(id))));
        if (i + parallel < ids.length) await sleep(delay);
      }
      return { sent, failed, total: ids.length };
    })();

    if (typeof callback === 'function') {
      promise.then(r => callback(null, r)).catch(e => callback(e));
    }
    return promise;
  };
}
