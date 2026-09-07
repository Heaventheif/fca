/**
 * rate-limiter-per-thread.js — محدِّد معدل الطلبات لكل محادثة (Thread).
 *
 * يستخدم خوارزمية Token Bucket داخلياً مع تنظيف دوري للمحادثات الخاملة.
 */
import { TokenBucket }   from './token-bucket.js';
import { emitRateLimit } from '../observability/channels.js';

/** قيم افتراضية */
const DEFAULTS = Object.freeze({
  maxPerMinute:    20,
  windowMs:        60_000,
  cleanupIntervalMs: 5 * 60_000,
});

export class PerThreadRateLimiter {
  /**
   * @param {object} [opts]
   * @param {number}  [opts.defaultMaxPerMinute=20] - الحد الافتراضي لكل محادثة
   * @param {number}  [opts.windowMs=60000]         - نافذة القياس بالمللي ثانية
   * @param {boolean} [opts.enableCleanup=true]     - تفعيل التنظيف الدوري
   */
  constructor(opts = {}) {
    this._defaultMax     = opts.defaultMaxPerMinute ?? DEFAULTS.maxPerMinute;
    this._windowMs       = opts.windowMs            ?? DEFAULTS.windowMs;
    this._enableCleanup  = opts.enableCleanup       !== false;

    /** @type {Map<string, TokenBucket>} */
    this._buckets      = new Map();

    /** @type {Map<string, number>} حدود مخصصة لمحادثات بعينها */
    this._customLimits = new Map();

    /** @type {Map<string, number>} آخر وقت استخدام لكل محادثة */
    this._lastUsed     = new Map();

    if (this._enableCleanup) this._scheduleCleanup();
  }

  // ── واجهة عامة ────────────────────────────────────────────────

  /**
   * اضبط حدًّا مخصصاً لمحادثة معينة.
   * @param {string} threadID
   * @param {object} [opts]
   * @param {number} [opts.maxPerMinute]
   */
  setThreadLimit(threadID, opts = {}) {
    const key = String(threadID);
    this._customLimits.set(key, opts.maxPerMinute ?? this._defaultMax);
    this._buckets.delete(key); // أعد إنشاء الـ bucket في المرة القادمة
  }

  /**
   * تحقق فوراً هل يُسمح بطلب لهذه المحادثة.
   * @param {string} threadID
   * @returns {{ allowed: boolean, waitMs: number, remaining: number }}
   */
  check(threadID) {
    return this._getOrCreate(String(threadID)).consume(1);
  }

  /**
   * سجِّل استخدام المحادثة (للتنظيف الدوري).
   * @param {string} threadID
   */
  record(threadID) {
    this._lastUsed.set(String(threadID), Date.now());
  }

  /**
   * انتظر حتى يُسمح بطلب، ثم سجِّل الاستخدام.
   * @param {string} threadID
   * @returns {Promise<void>}
   */
  async waitAndRecord(threadID) {
    const key = String(threadID);

    while (true) {
      const { allowed, waitMs } = this.check(key);
      if (allowed) {
        this._lastUsed.set(key, Date.now());
        return;
      }
      emitRateLimit({ threadID, waitMs });
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  /**
   * إحصائيات جميع المحادثات النشطة.
   * @returns {Record<string, { remaining: number, capacity: number, maxPerMinute: number }>}
   */
  stats() {
    const result = {};
    for (const [id, bucket] of this._buckets) {
      const info = bucket.inspect();
      result[id] = {
        remaining:    info.tokens,
        capacity:     info.capacity,
        maxPerMinute: Math.round(info.rate * (60_000 / this._windowMs)),
      };
    }
    return result;
  }

  /** حرِّر جميع الموارد وأوقف التنظيف الدوري */
  destroy() {
    if (this._cleanupTimer) {
      clearTimeout(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    this._buckets.clear();
    this._customLimits.clear();
    this._lastUsed.clear();
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /**
   * أرجع Bucket المحادثة أو أنشئه إذا لم يكن موجوداً.
   * @param {string} key
   */
  _getOrCreate(key) {
    if (!this._buckets.has(key)) {
      const maxPm  = this._customLimits.get(key) ?? this._defaultMax;
      const bucket = new TokenBucket({
        capacity:        maxPm,
        refillRate:      maxPm,
        refillIntervalMs: this._windowMs,
      });
      this._buckets.set(key, bucket);
      this._lastUsed.set(key, Date.now());
    }
    return this._buckets.get(key);
  }

  /** جدوِّل التنظيف الدوري مع تشويش (jitter) لتجنب قفل السرب */
  _scheduleCleanup() {
    const jitter = (Math.random() * 0.8 - 0.4) * DEFAULTS.cleanupIntervalMs;
    const delay  = Math.max(30_000, Math.round(DEFAULTS.cleanupIntervalMs + jitter));

    this._cleanupTimer = setTimeout(() => {
      this._cleanup();
      if (this._enableCleanup) this._scheduleCleanup();
    }, delay);

    this._cleanupTimer?.unref?.();
  }

  /** احذف المحادثات التي لم تُستخدم منذ فترة طويلة */
  _cleanup() {
    const now     = Date.now();
    const maxIdle = this._windowMs * 3;

    for (const [key, lastUsed] of this._lastUsed) {
      if (now - lastUsed > maxIdle) {
        this._buckets.delete(key);
        this._lastUsed.delete(key);
      }
    }
  }
}

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof PerThreadRateLimiter>[0]} options
 */
export function createPerThreadRateLimiter(options) {
  return new PerThreadRateLimiter(options);
}

export default { PerThreadRateLimiter, createPerThreadRateLimiter };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-rate-limiter-per-thread',
  meta: { category: 'safety', path: 'lib/safety/rate-limiter-per-thread.js' },
  setup(_ctx) {
    // provides: PerThreadRateLimiter, createPerThreadRateLimiter
  },
};
