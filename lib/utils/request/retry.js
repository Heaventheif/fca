/**
 * retry.js — إعادة المحاولة مع exponential backoff
 *
 * FIX-05: parseRetryAfter — كان parseInt("Wed, 21 Oct...") = NaN يُسقط الـ header
 *          الآن يدعم:
 *            - عدد صحيح (ثواني):  "120"
 *            - HTTP-date format:   "Wed, 21 Oct 2026 07:28:00 GMT"
 *            - Epoch ms > 1e10:    نادر لكن بعض CDNs تُرسله
 */

import * as http from './client.js';

// ─── FIX-05: تحليل Retry-After الصحيح ────────────────────────────────────────
function parseRetryAfter(raw) {
  if (!raw) return 0;
  const str = String(raw).trim();

  // حالة 1: عدد صحيح (ثواني) — الأكثر شيوعاً
  const asInt = Number(str);
  if (Number.isFinite(asInt) && asInt > 0) {
    // إذا كان كبيراً جداً → على الأرجح epoch ms
    if (asInt > 1e10) return Math.max(0, Math.ceil((asInt - Date.now()) / 1000));
    if (asInt < 86400) return asInt; // ثواني معقولة (أقل من يوم)
  }

  // حالة 2: HTTP-date string
  const asDate = new Date(str);
  if (!isNaN(asDate.getTime())) {
    return Math.max(0, Math.ceil((asDate.getTime() - Date.now()) / 1000));
  }

  return 0;
}

/**
 * تنفيذ طلب مع إعادة المحاولة وexponential backoff
 *
 * @param {function}  fn         - الدالة المراد تكرارها: () => Promise
 * @param {number}    maxRetries - عدد المحاولات الكلية (default: 3)
 * @param {number}    baseDelay  - ms التأخير الأساسي (default: 1000)
 * @param {object}    ctx        - context للـ event emitter (اختياري)
 */
export async function requestWithRetry(fn, maxRetries = 3, baseDelay = 1000, ctx) {
  let lastErr;

  const emit = (event, data) => {
    try {
      if (ctx?._emitter?.emit) ctx._emitter.emit(event, data);
    } catch { /* لا يجب أن يُوقف emit خطأ الطلب */ }
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // ── FIX-05: header injection يُوقف فوراً (لا retry) ──────────────────
      if (err?.code === 'ERR_INVALID_CHAR' ||
          err?.message?.includes('Invalid character in header')) {
        const e = new Error('Invalid header content — request aborted to prevent crash.');
        e.code = 'ERR_INVALID_CHAR';
        e.originalError = err;
        return Promise.reject(e);
      }

      const status   = err?.response?.status ?? err?.statusCode ?? 0;
      const url      = err?.config?.url ?? '';
      const method   = String(err?.config?.method ?? '').toUpperCase();
      const errCode  = err?.code ?? '';
      const errMsg   = err?.message ?? String(err ?? '');

      // ── 429 Rate Limit: احترام Retry-After ────────────────────────────────
      if (status === 429) {
        emit('rateLimit', { status, url, method, attempt });

        const retryAfterRaw =
          err?.response?.headers?.['retry-after'] ??
          err?.response?.headers?.['x-ratelimit-reset-after'] ??
          err?.response?.headers?.['x-ratelimit-reset'];       // بعض APIs تُرسل هذا

        // FIX-05: parseRetryAfter بدل parseInt مباشرة
        const waitSec = parseRetryAfter(retryAfterRaw);

        if (waitSec > 0 && waitSec < 300) {        // أقصى انتظار: 5 دقائق
          await http.delay(waitSec * 1000 + Math.random() * 500);
          continue;
        }
        // إذا لم يكن هناك Retry-After → انتظر exponential كالمعتاد
      }

      // ── 4xx (غير 429): لا retry ────────────────────────────────────────────
      if (status >= 400 && status < 500 && status !== 429) return Promise.reject(err);

      // ── آخر محاولة ────────────────────────────────────────────────────────
      if (attempt === maxRetries - 1) return Promise.reject(err);

      // ── أخطاء الشبكة ──────────────────────────────────────────────────────
      const isNetwork =
        !status &&
        (errCode === 'UND_ERR_CONNECT_TIMEOUT' ||
         errCode === 'ETIMEDOUT'   ||
         errCode === 'ECONNRESET'  ||
         errCode === 'ECONNREFUSED'||
         errCode === 'ENOTFOUND'   ||
         /timeout|connect timeout|network error|fetch failed/i.test(errMsg));

      if (isNetwork) emit('networkError', { code: errCode, message: errMsg, url, method });

      // ── Exponential backoff + jitter ──────────────────────────────────────
      const jitter = Math.floor(Math.random() * 800);
      const wait   = Math.min(baseDelay * Math.pow(2, attempt) + jitter, 30_000);
      await http.delay(wait);
    }
  }

  return Promise.reject(lastErr ?? new Error('Request failed after retries'));
}

export default { requestWithRetry };
