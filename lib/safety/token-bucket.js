/**
 * token-bucket.js — خوارزمية Token Bucket للتحكم في معدل الطلبات (Rate Limiting).
 *
 * المبدأ: حاوية توكنات تُملأ تدريجياً؛ كل طلب يستهلك توكناً،
 * وعندما تنفد التوكنات يُرفض الطلب أو ينتظر.
 */

/** قيم افتراضية مركزية */
const DEFAULTS = Object.freeze({
  refillIntervalMs: 1_000,
  maxWaitMs:        30_000,
});

export class TokenBucket {
  /**
   * @param {object} opts
   * @param {number} opts.capacity         - الحد الأقصى للتوكنات
   * @param {number} opts.refillRate       - عدد التوكنات المضافة في كل دورة
   * @param {number} [opts.refillIntervalMs=1000] - مدة الدورة بالمللي ثانية
   */
  constructor({ capacity, refillRate, refillIntervalMs = DEFAULTS.refillIntervalMs }) {
    if (capacity   <= 0) throw new RangeError('TokenBucket: capacity must be positive');
    if (refillRate <= 0) throw new RangeError('TokenBucket: refillRate must be positive');

    this.capacity    = capacity;
    this.tokens      = capacity;
    this.rate        = refillRate;
    this.interval    = refillIntervalMs;
    this._lastRefill = Date.now();
  }

  // ── حساب التوكنات ──────────────────────────────────────────────

  /** أعد ملء التوكنات بناءً على الزمن المنقضي */
  _refill() {
    const now          = Date.now();
    const elapsed      = (now - this._lastRefill) / this.interval;
    this.tokens        = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this._lastRefill   = now;
  }

  /**
   * حاول استهلاك `count` توكنات فوراً.
   * @param {number} [count=1]
   * @returns {{ allowed: boolean, waitMs: number, remaining: number }}
   */
  consume(count = 1) {
    this._refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      return { allowed: true, waitMs: 0, remaining: Math.floor(this.tokens) };
    }

    const deficit = count - this.tokens;
    const waitMs  = Math.ceil((deficit / this.rate) * this.interval);
    return { allowed: false, waitMs, remaining: 0 };
  }

  /**
   * انتظر حتى تتوفر `count` توكنات، ثم استهلكها.
   * يرمي Error إذا تجاوز الانتظار `maxWaitMs`.
   *
   * @param {number} [count=1]
   * @param {number} [maxWaitMs=30000]
   * @returns {Promise<void>}
   */
  async waitAndConsume(count = 1, maxWaitMs = DEFAULTS.maxWaitMs) {
    const deadline = Date.now() + maxWaitMs;

    while (true) {
      const { allowed, waitMs } = this.consume(count);
      if (allowed) return;

      if (Date.now() + waitMs > deadline) {
        throw new Error(`TokenBucket: انتهت مهلة الانتظار (${maxWaitMs}ms)`);
      }

      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // ── معلومات ────────────────────────────────────────────────────

  /** الحالة الراهنة للحاوية */
  inspect() {
    this._refill();
    return {
      tokens:   Math.floor(this.tokens),
      capacity: this.capacity,
      rate:     this.rate,
    };
  }

  /** أعد ملء الحاوية بالكامل */
  reset() {
    this.tokens      = this.capacity;
    this._lastRefill = Date.now();
  }
}

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof TokenBucket>[0]} options
 */
export function createTokenBucket(options) {
  return new TokenBucket(options);
}

export default { TokenBucket, createTokenBucket };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-token-bucket',
  meta: { category: 'safety', path: 'lib/safety/token-bucket.js' },
  setup(_ctx) {
    // provides: TokenBucket, createTokenBucket
  },
};
