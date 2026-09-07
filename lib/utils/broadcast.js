/**
 * broadcast.js — إرسال رسالة لعدة threads
 *
 * BUG-FIX: كان يستخدم نمط CommonJS (__importDefault) داخل ESM module
 * → SyntaxError عند التشغيل الفعلي
 *
 * إضافات:
 *  - delay يستخدم nextLogNormal (منحاز يميناً) بدل setTimeout ثابت
 *  - onProgress callback لمتابعة التقدم
 *  - maxConcurrent لإرسال متوازٍ محدود
 *  - skipBlocked أكثر دقة في كشف الأخطاء
 */
import logger       from '../func/logger.js';
import { nextLogNormal } from '../utils/human-timing.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {object}   api
 * @param {string[]} threadIDs
 * @param {*}        message
 * @param {object}   [options]
 * @param {number}     options.delayMs        - متوسط التأخير بين الإرساليات (ms)
 * @param {boolean}    options.humanDelay      - استخدام log-normal بدل ثابت (default: true)
 * @param {boolean}    options.skipBlocked     - تخطي الـ threads المحظورة (default: true)
 * @param {number}     options.maxConcurrent   - عدد الإرساليات المتوازية (default: 1)
 * @param {function}   options.onResult        - callback(err, {threadID, ok, res})
 * @param {function}   options.onProgress      - callback({done, total, threadID})
 */
export async function broadcast(api, threadIDs, message, options = {}) {
  if (!api || typeof api.sendMessage !== 'function')
    throw new Error('broadcast: api.sendMessage مطلوب');

  const {
    delayMs      = 1000,
    humanDelay   = true,
    skipBlocked  = true,
    maxConcurrent = 1,
    onResult,
    onProgress,
  } = options;

  const ids     = Array.isArray(threadIDs) ? threadIDs : [threadIDs];
  const results = [];
  let done      = 0;

  // إرسال thread واحد وتسجيل نتيجته
  async function sendOne(id) {
    try {
      const res = await new Promise((res, rej) =>
        api.sendMessage(message, id, (e, r) => e ? rej(e) : res(r))
      );
      const item = { threadID: id, ok: true, res };
      results.push(item);
      onResult?.(null, item);
    } catch (e) {
      const msg = e?.error ?? e?.message ?? String(e);
      const isBlocked = /permission|blocked|not allowed|cannot send|not authorized/i.test(msg);
      logger(`broadcast: فشل ${id}: ${msg}`, 'warn');
      const item = { threadID: id, ok: false, error: e, isBlocked };
      results.push(item);
      onResult?.(e, item);
      if (skipBlocked && isBlocked) return; // لا تُوقف البرودكاست بسبب thread محظور
    } finally {
      done++;
      onProgress?.({ done, total: ids.length, threadID: id });
    }
  }

  // إرسال متسلسل أو متوازٍ محدود
  if (maxConcurrent <= 1) {
    for (const id of ids) {
      await sendOne(id);
      if (ids.indexOf(id) < ids.length - 1 && delayMs > 0) {
        const wait = humanDelay
          ? nextLogNormal(delayMs, 0.4)      // أكثر طبيعية من ثابت
          : delayMs;
        await sleep(Math.max(200, Math.round(wait)));
      }
    }
  } else {
    // إرسال على دفعات (chunks)
    for (let i = 0; i < ids.length; i += maxConcurrent) {
      const chunk = ids.slice(i, i + maxConcurrent);
      await Promise.all(chunk.map(sendOne));
      if (i + maxConcurrent < ids.length && delayMs > 0) {
        const wait = humanDelay ? nextLogNormal(delayMs, 0.4) : delayMs;
        await sleep(Math.max(200, Math.round(wait)));
      }
    }
  }

  return results;
}

export default broadcast;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-broadcast',
  meta: { category: 'utils', path: 'lib/utils/broadcast.js' },
  setup(_ctx) {
    // provides: broadcast
  },
};
