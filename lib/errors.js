/**
 * errors.js — هرمية أخطاء FCA الموحَّدة.
 *
 * الهرمية:
 *   Error
 *     └─ FcaError                  (أساس كل أخطاء FCA)
 *          ├─ FcaNetworkError       (أخطاء الشبكة العامة)
 *          │    ├─ FcaHttpError     (أخطاء HTTP بكود الحالة)
 *          │    ├─ FcaMqttError     (أخطاء MQTT العامة)
 *          │    │    ├─ FcaMqttTimeoutError
 *          │    │    └─ FcaMqttNotInitializedError
 *          ├─ FcaAuthError          (أخطاء المصادقة)
 *          │    └─ FcaNotLoggedInError
 *          ├─ FcaRateLimitError     (تجاوز معدل الطلبات)
 *          └─ FcaCircuitOpenError   (الدائرة مفتوحة)
 */

// ── أساس ─────────────────────────────────────────────────────────

export class FcaError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {Error}  [opts.cause]    - الخطأ الأصلي (ES2022)
   * @param {string} [opts.code]     - رمز الخطأ
   */
  constructor(message, { cause, code } = {}) {
    super(message, { cause });
    this.name = 'FcaError';
    this.code = code ?? 'FCA_ERROR';
  }
}

// ── شبكة ─────────────────────────────────────────────────────────

export class FcaNetworkError extends FcaError {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {Error}  [opts.cause]
   * @param {string} [opts.code]
   * @param {string} [opts.threadID]
   */
  constructor(message, { cause, code, threadID } = {}) {
    super(message, { cause, code: code ?? 'NETWORK_ERROR' });
    this.name     = 'FcaNetworkError';
    this.threadID = threadID ?? null;
  }
}

export class FcaHttpError extends FcaNetworkError {
  /**
   * @param {number} status  - كود HTTP (مثل 403, 429)
   * @param {string} [url]
   * @param {object} [opts]
   * @param {Error}  [opts.cause]
   */
  constructor(status, url, { cause } = {}) {
    super(`HTTP ${status}${url ? ` — ${url}` : ''}`, {
      cause,
      code: `HTTP_${status}`,
    });
    this.name   = 'FcaHttpError';
    this.status = status;
    this.url    = url ?? null;
  }
}

// ── MQTT ──────────────────────────────────────────────────────────

export class FcaMqttError extends FcaNetworkError {
  constructor(message, { cause, code } = {}) {
    super(message, { cause, code: code ?? 'MQTT_ERROR' });
    this.name = 'FcaMqttError';
  }
}

export class FcaMqttTimeoutError extends FcaMqttError {
  /** @param {number|string} requestId */
  constructor(requestId, { cause } = {}) {
    super(`MQTT ACK timeout for request ${requestId}`, { cause, code: 'MQTT_TIMEOUT' });
    this.name      = 'FcaMqttTimeoutError';
    this.requestId = requestId;
  }
}

export class FcaMqttNotInitializedError extends FcaMqttError {
  constructor({ cause } = {}) {
    super('MQTT client is not initialized', { cause, code: 'MQTT_NOT_INITIALIZED' });
    this.name = 'FcaMqttNotInitializedError';
  }
}

// ── مصادقة ───────────────────────────────────────────────────────

export class FcaAuthError extends FcaError {
  constructor(message, { cause, code } = {}) {
    super(message, { cause, code: code ?? 'AUTH_ERROR' });
    this.name = 'FcaAuthError';
  }
}

export class FcaNotLoggedInError extends FcaAuthError {
  constructor({ cause } = {}) {
    super('Not logged in — session may have expired', { cause, code: 'NOT_LOGGED_IN' });
    this.name = 'FcaNotLoggedInError';
  }
}

// ── حماية ────────────────────────────────────────────────────────

export class FcaRateLimitError extends FcaError {
  /**
   * @param {string} threadID
   * @param {number} waitMs    - مدة الانتظار المقترحة
   * @param {object} [opts]
   * @param {Error}  [opts.cause]
   */
  constructor(threadID, waitMs, { cause } = {}) {
    super(`Rate limit exceeded for thread ${threadID} — retry in ${waitMs}ms`, {
      cause,
      code: 'RATE_LIMIT',
    });
    this.name     = 'FcaRateLimitError';
    this.threadID = threadID;
    this.waitMs   = waitMs;
  }
}

export class FcaCircuitOpenError extends FcaError {
  /**
   * @param {number} retryAfterMs - متى يمكن إعادة المحاولة
   * @param {object} [opts]
   * @param {Error}  [opts.cause]
   */
  constructor(retryAfterMs, { cause } = {}) {
    super(`Circuit is OPEN — retry after ${retryAfterMs}ms`, {
      cause,
      code: 'CIRCUIT_OPEN',
    });
    this.name         = 'FcaCircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ── تصدير موحَّد ──────────────────────────────────────────────────

export default {
  FcaError,
  FcaNetworkError,
  FcaHttpError,
  FcaMqttError,
  FcaMqttTimeoutError,
  FcaMqttNotInitializedError,
  FcaAuthError,
  FcaNotLoggedInError,
  FcaRateLimitError,
  FcaCircuitOpenError,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-errors',
  meta: { category: 'errors.js', path: 'lib/errors.js' },
  setup(_ctx) {
    // provides: FcaError, FcaNetworkError, FcaHttpError, FcaMqttError,
    //           FcaMqttTimeoutError, FcaMqttNotInitializedError,
    //           FcaAuthError, FcaNotLoggedInError, FcaRateLimitError, FcaCircuitOpenError
  },
};
