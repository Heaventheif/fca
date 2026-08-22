/**
 * MessageDedup — منع تكرار أحداث الرسائل عند إعادة الاتصال بـ MQTT
 *
 * يحتفظ بـ Set دوّار لـ messageID الأخيرة.
 * إذا ظهر نفس الـ messageID مرتين → يُسقط الحدث.
 *
 * Options:
 *   maxSize  {number} أقصى عدد IDs في الذاكرة       (default: 300)
 *   ttl      {number} ms — يُنسى الـ ID بعده         (default: 5 دقائق)
 */
export class MessageDedup {
  constructor(opts = {}) {
    this._max      = opts.maxSize ?? 300;
    this._ttl      = opts.ttl     ?? 5 * 60 * 1000;
    this._seen     = new Map();   // messageID → expiry timestamp
    this._dups     = 0;
    this._allowed  = 0;
  }

  /**
   * هل هذه الرسالة مكررة؟
   * @param {string} messageID
   * @returns {boolean} true لو مكررة (يجب إسقاطها)
   */
  isDuplicate(messageID) {
    if (!messageID) return false;
    const id  = String(messageID);
    const now = Date.now();

    const existing = this._seen.get(id);
    if (existing) {
      if (now < existing) {
        this._dups++;
        return true;   // مكررة وحية
      }
      // انتهت صلاحيتها — نعاملها كجديدة
      this._seen.delete(id);
    }

    this._register(id, now);
    this._allowed++;
    return false;
  }

  /** تسجيل ID جديد مع إدارة الحجم */
  _register(id, now) {
    // Evict oldest entries if full
    if (this._seen.size >= this._max) {
      // Remove all expired first
      for (const [k, exp] of this._seen) {
        if (now >= exp) this._seen.delete(k);
      }
      // If still full, remove the oldest-inserted entry (first in Map)
      if (this._seen.size >= this._max) {
        const firstKey = this._seen.keys().next().value;
        this._seen.delete(firstKey);
      }
    }
    this._seen.set(id, now + this._ttl);
  }

  /** حذف كل المنتهية */
  prune() {
    const now = Date.now();
    let count = 0;
    for (const [k, exp] of this._seen) {
      if (now >= exp) { this._seen.delete(k); count++; }
    }
    return count;
  }

  get stats() {
    return {
      tracked:  this._seen.size,
      dups:     this._dups,
      allowed:  this._allowed,
      dupRate:  this._dups + this._allowed
        ? (this._dups / (this._dups + this._allowed)).toFixed(4)
        : '0.0000',
    };
  }

  /** إعادة التهيئة */
  reset() {
    this._seen.clear();
    this._dups = this._allowed = 0;
  }

  /**
   * Wrap a listenMqtt callback: رسائل مكررة تُتجاهل تلقائياً.
   * @param {function} originalCallback - (err, event) =>
   * @returns {function} wrappedCallback
   */
  wrapListener(originalCallback) {
    const self = this;
    return function dedupListener(err, event) {
      if (err) return originalCallback(err, event);
      if (!event) return;

      const id = event.messageID ?? event.mid ?? event.id ?? null;
      // Only dedup 'message' and 'message_reply' types
      if (id && (event.type === 'message' || event.type === 'message_reply')) {
        if (self.isDuplicate(id)) return; // silently drop
      }
      return originalCallback(null, event);
    };
  }
}

/**
 * Attach dedup to api.listenMqtt automatically.
 * @param {object} api
 * @param {object} opts
 * @returns {MessageDedup}
 */
export function attachDedup(api, opts = {}) {
  const dedup       = new MessageDedup(opts);
  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) return dedup;

  api.listenMqtt = function dedupListen(callback) {
    return originalListen(dedup.wrapListener(callback));
  };
  api._dedup = dedup;

  // Periodic prune every 2 minutes
  const pruneInterval = setInterval(() => dedup.prune(), 2 * 60 * 1000);
  pruneInterval.unref?.();

  return dedup;
}

export default MessageDedup;
