import { FcaCircuitOpenError } from '../errors.js';

/**
 * @typedef {'CLOSED' | 'OPEN' | 'HALF_OPEN'} CircuitState
 */

/** حالات دائرة القاطع الثلاث */
const STATE = /** @type {const} */ ({
  CLOSED:    'CLOSED',
  OPEN:      'OPEN',
  HALF_OPEN: 'HALF_OPEN',
});

/**
 * Circuit Breaker — يحمي النظام من تكرار الاستدعاءات الفاشلة.
 *
 * حالات الدائرة:
 *  - CLOSED   → طبيعي، يسمح بالاستدعاء
 *  - OPEN     → مغلق بسبب أخطاء متكررة، يرفض الاستدعاء
 *  - HALF_OPEN → اختبار واحد مسموح بعد انتهاء مهلة الانتظار
 */
export class CircuitBreaker {
  /** @type {CircuitState} */
  #state = STATE.CLOSED;
  #failures   = 0;
  #lastFail   = 0;
  #threshold;
  #timeout;
  #onStateChange;

  /**
   * @param {object} [opts]
   * @param {number} [opts.failureThreshold=5]  - عدد الأخطاء قبل الفتح
   * @param {number} [opts.threshold]            - اسم بديل لـ failureThreshold
   * @param {number} [opts.recoveryTimeMs=60000] - مدة الانتظار قبل نصف الفتح
   * @param {number} [opts.timeoutMs]            - اسم بديل لـ recoveryTimeMs
   * @param {Function} [opts.onStateChange]      - callback عند تغيير الحالة
   */
  constructor({ threshold, failureThreshold, timeoutMs, recoveryTimeMs, onStateChange } = {}) {
    this.#threshold      = failureThreshold ?? threshold ?? 5;
    this.#timeout        = recoveryTimeMs   ?? timeoutMs ?? 60_000;
    this.#onStateChange  = onStateChange    ?? null;
  }

  // ── خصائص عامة ────────────────────────────────────────────────
  get state()    { return this.#state; }
  get failures() { return this.#failures; }
  get isOpen()   { return this.#state === STATE.OPEN; }
  get isClosed() { return this.#state === STATE.CLOSED; }

  /**
   * هل يمكن تنفيذ الاستدعاء الآن؟
   * يرمي FcaCircuitOpenError إذا كانت الدائرة مفتوحة ولم تنتهِ المهلة.
   * @returns {true}
   */
  canAttempt() {
    if (this.#state === STATE.CLOSED || this.#state === STATE.HALF_OPEN) return true;

    // OPEN — تحقق من انتهاء المهلة
    const elapsed = Date.now() - this.#lastFail;
    if (elapsed >= this.#timeout) {
      this.#transition(STATE.HALF_OPEN);
      return true;
    }

    throw new FcaCircuitOpenError(this.#timeout - elapsed);
  }

  /**
   * نفِّذ دالة مع حماية دائرة القاطع.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async call(fn) {
    this.canAttempt();
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }

  /** سجِّل نجاح — أعد إغلاق الدائرة وصفِّر عداد الأخطاء */
  recordSuccess() {
    if (this.#state !== STATE.CLOSED) this.#transition(STATE.CLOSED);
    this.#failures = 0;
  }

  /** سجِّل خطأ — افتح الدائرة عند تجاوز العتبة */
  recordFailure() {
    this.#failures++;
    this.#lastFail = Date.now();
    if (this.#state === STATE.HALF_OPEN || this.#failures >= this.#threshold) {
      this.#transition(STATE.OPEN);
    }
  }

  /** إحصائيات الحالة الراهنة */
  stats() {
    return {
      state:           this.#state,
      failures:        this.#failures,
      threshold:       this.#threshold,
      timeoutMs:       this.#timeout,
      msUntilHalfOpen: this.#state === STATE.OPEN
        ? Math.max(0, this.#timeout - (Date.now() - this.#lastFail))
        : 0,
    };
  }

  /** أعد ضبط الدائرة إلى حالة CLOSED */
  reset() {
    this.#failures = 0;
    this.#lastFail = 0;
    this.#transition(STATE.CLOSED);
  }

  // ── داخلي ─────────────────────────────────────────────────────
  /** @param {CircuitState} newState */
  #transition(newState) {
    const prev = this.#state;
    this.#state = newState;
    if (prev !== newState && this.#onStateChange) {
      try { this.#onStateChange(newState, prev); } catch { /* لا نسمح للـ callback بتعطيل الدائرة */ }
    }
  }
}

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof CircuitBreaker>[0]} options
 */
export function createCircuitBreaker(options) {
  return new CircuitBreaker(options);
}

export default { CircuitBreaker, createCircuitBreaker };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-circuit-breaker',
  meta: { category: 'safety', path: 'lib/safety/circuit-breaker.js' },
  setup(_ctx) {
    // provides: CircuitBreaker, createCircuitBreaker
  },
};
