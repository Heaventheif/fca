/**
 * retry.js — منطق إعادة المحاولة مع back-off أسي وجيتر.
 *
 * السلوك:
 *  - 429 → انتظر Retry-After إذا كان معقولاً، ثم أعد المحاولة
 *  - 4xx (غير 429) → افشل فوراً (لا إعادة محاولة)
 *  - أخطاء الشبكة → أعد المحاولة مع back-off
 *  - ERR_INVALID_CHAR → افشل فوراً (منع الانهيار)
 */
import * as http from './client.js';

// ── ثوابت ─────────────────────────────────────────────────────────

/** أكواد شبكة تستوجب إعادة المحاولة */
const RETRYABLE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
]);

/** نمط رسائل الشبكة القابلة لإعادة المحاولة */
const NETWORK_MSG_PATTERN = /timeout|connect timeout|network error|fetch failed/i;

/** أقصى تأخير بين المحاولات */
const MAX_BACKOFF_MS = 30_000;

/** الحد الأعلى المعقول لـ Retry-After (5 دقائق) */
const MAX_RETRY_AFTER_SEC = 300;

// ── تحليل Retry-After ─────────────────────────────────────────────

/**
 * حوِّل قيمة رأس Retry-After إلى ثوانٍ.
 * تدعم: رقم (ثواني أو Unix timestamp) أو تاريخ HTTP.
 * @param {string|number|undefined} raw
 * @returns {number} ثواني الانتظار (0 إذا لم يُعرف)
 */
function parseRetryAfter(raw) {
  if (!raw) return 0;

  const str    = String(raw).trim();
  const asInt  = Number(str);

  if (Number.isFinite(asInt) && asInt > 0) {
    // Unix timestamp (ms أو s)؟
    if (asInt > 1e10) return Math.max(0, Math.ceil((asInt - Date.now()) / 1000));
    return asInt; // ثواني مباشرة
  }

  // تاريخ HTTP
  const asDate = new Date(str);
  if (!isNaN(asDate.getTime())) {
    return Math.max(0, Math.ceil((asDate.getTime() - Date.now()) / 1000));
  }

  return 0;
}

// ── منطق تصنيف الخطأ ─────────────────────────────────────────────

/**
 * هل الخطأ ناتج عن المشكلة الشبكية؟
 * @param {Error} err
 * @param {number} status
 */
function isNetworkError(err, status) {
  const code = err?.code ?? '';
  const msg  = err?.message ?? String(err ?? '');
  return !status && (RETRYABLE_CODES.has(code) || NETWORK_MSG_PATTERN.test(msg));
}

// ── حساب التأخير ─────────────────────────────────────────────────

/**
 * احسب تأخير back-off أسي مع جيتر.
 * @param {number} attempt    - رقم المحاولة (يبدأ من 0)
 * @param {number} baseDelay  - التأخير الأساسي بالمللي ثانية
 */
function calcBackoff(attempt, baseDelay) {
  const jitter = Math.floor(Math.random() * 800);
  return Math.min(baseDelay * Math.pow(2, attempt) + jitter, MAX_BACKOFF_MS);
}

// ── الدالة الرئيسية ───────────────────────────────────────────────

/**
 * نفِّذ دالة مع إعادة المحاولة عند الفشل.
 *
 * @param {() => Promise<*>} fn           - الدالة المراد تنفيذها
 * @param {number}  [maxRetries=3]        - أقصى عدد محاولات
 * @param {number}  [baseDelay=1000]      - التأخير الأساسي بالمللي ثانية
 * @param {object}  [ctx]                 - سياق FCA (للأحداث)
 * @returns {Promise<*>}
 */
export async function requestWithRetry(fn, maxRetries = 3, baseDelay = 1_000, ctx) {
  let lastErr;

  /**
   * أصدر حدثاً تشخيصياً إذا كان المُصدِر متاحاً.
   * @param {string} event
   * @param {object} data
   */
  const emit = (event, data) => {
    try { ctx?._emitter?.emit?.(event, data); } catch { /* تجاهل */ }
  };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();

    } catch (err) {
      lastErr = err;

      // ── حرف غير مسموح به في الرأس → فشل فوري (لا إعادة محاولة) ──
      if (err?.code === 'ERR_INVALID_CHAR' || err?.message?.includes('Invalid character in header')) {
        const safeErr = new Error('Invalid header content — request aborted to prevent crash.');
        safeErr.code          = 'ERR_INVALID_CHAR';
        safeErr.originalError = err;
        return Promise.reject(safeErr);
      }

      const status  = err?.response?.status ?? err?.statusCode ?? 0;
      const url     = err?.config?.url      ?? '';
      const method  = String(err?.config?.method ?? '').toUpperCase();

      // ── 429 Too Many Requests ──
      if (status === 429) {
        emit('rateLimit', { status, url, method, attempt });

        const retryAfterRaw =
          err?.response?.headers?.['retry-after']                ??
          err?.response?.headers?.['x-ratelimit-reset-after']    ??
          err?.response?.headers?.['x-ratelimit-reset'];

        const waitSec = parseRetryAfter(retryAfterRaw);
        if (waitSec > 0 && waitSec < MAX_RETRY_AFTER_SEC) {
          await http.delay(waitSec * 1_000 + Math.random() * 500);
          continue;
        }
        // Retry-After غير معقول → اتبع منطق back-off العادي
      }

      // ── 4xx (غير 429) → لا تُعيد المحاولة ──
      if (status >= 400 && status < 500 && status !== 429) {
        return Promise.reject(err);
      }

      // ── آخر محاولة ──
      if (attempt === maxRetries - 1) return Promise.reject(err);

      // ── خطأ شبكي → سجِّل وانتظر ──
      if (isNetworkError(err, status)) {
        const errCode = err?.code    ?? '';
        const errMsg  = err?.message ?? String(err ?? '');
        emit('networkError', { code: errCode, message: errMsg, url, method });
      }

      await http.delay(calcBackoff(attempt, baseDelay));
    }
  }

  return Promise.reject(lastErr ?? new Error('Request failed after retries'));
}

export default { requestWithRetry };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-retry',
  meta: { category: 'utils', path: 'lib/utils/request/retry.js' },
  setup(_ctx) {
    // provides: requestWithRetry
  },
};
