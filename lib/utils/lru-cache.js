/**
 * lru-cache.js — ذاكرة تخزين مؤقت بسياسة LRU (Least Recently Used)
 * مع دعم اختياري لمدة انتهاء الصلاحية (TTL).
 */

// ── عقدة القائمة المرتبطة ─────────────────────────────────────

class LRUNode {
  /**
   * @param {*}        key
   * @param {*}        value
   * @param {number|null} expiresAt - timestamp أو null إذا لا ينتهي
   */
  constructor(key, value, expiresAt) {
    this.key       = key;
    this.value     = value;
    this.expiresAt = expiresAt;
    this.prev      = null;
    this.next      = null;
  }
}

// ── الكاش الرئيسي ─────────────────────────────────────────────

/**
 * ذاكرة تخزين مؤقت بسياسة LRU مع TTL اختياري.
 *
 * @example
 * const cache = new LRUCache({ max: 100, ttl: 60_000 });
 * cache.set('key', value);
 * cache.get('key'); // value أو undefined
 */
export class LRUCache {
  /**
   * @param {object} [opts]
   * @param {number}   [opts.max=500]      - الحد الأقصى للمدخلات
   * @param {number}   [opts.ttl]          - مدة الصلاحية بالمللي ثانية (null = لا تنتهي)
   * @param {Function} [opts.onEvict]      - callback عند طرد مدخلة: (key, value) => void
   */
  constructor(opts = {}) {
    this._max     = opts.max     ?? 500;
    this._ttl     = opts.ttl     ?? null;
    this._onEvict = opts.onEvict ?? null;

    // خريطة بحث O(1)
    this._map  = new Map();

    // قائمة مرتبطة ثنائية: head ← أحدث | قديم → tail
    this._head = new LRUNode(null, null, null); // حارس بداية
    this._tail = new LRUNode(null, null, null); // حارس نهاية
    this._head.next = this._tail;
    this._tail.prev = this._head;

    this._hits   = 0;
    this._misses = 0;
  }

  // ── العمليات الأساسية ──────────────────────────────────────────

  /**
   * استرجع قيمة المفتاح؛ تُرجع undefined عند الغياب أو انتهاء الصلاحية.
   * @param {*} key
   */
  get(key) {
    const node = this._map.get(key);

    if (!node) {
      this._misses++;
      return undefined;
    }

    if (this._isExpired(node)) {
      this._evictNode(node);
      this._misses++;
      return undefined;
    }

    // انقل إلى الأمام (الأحدث استخداماً)
    this._moveToFront(node);
    this._hits++;
    return node.value;
  }

  /**
   * خزِّن قيمة للمفتاح؛ يمكن تجاوز TTL الافتراضي بـ ttlMs.
   * @param {*}      key
   * @param {*}      value
   * @param {number} [ttlMs] - TTL مخصص لهذه المدخلة فقط
   * @returns {this}
   */
  set(key, value, ttlMs) {
    const expiresAt = this._computeExpiry(ttlMs);
    const existing  = this._map.get(key);

    if (existing) {
      existing.value     = value;
      existing.expiresAt = expiresAt;
      this._moveToFront(existing);
      return this;
    }

    if (this._map.size >= this._max) this._evictLRU();

    const node = new LRUNode(key, value, expiresAt);
    this._map.set(key, node);
    this._insertAfterHead(node);
    return this;
  }

  /**
   * احذف مفتاحاً.
   * @param {*} key
   * @returns {boolean} true إذا كان موجوداً
   */
  delete(key) {
    const node = this._map.get(key);
    if (!node) return false;
    this._evictNode(node);
    return true;
  }

  /**
   * هل المفتاح موجود وغير منتهٍ؟
   * @param {*} key
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /** أفرغ الكاش بالكامل */
  clear() {
    this._map.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._hits = this._misses = 0;
  }

  /**
   * احذف جميع المدخلات المنتهية الصلاحية.
   * @returns {number} عدد المدخلات المحذوفة
   */
  prune() {
    const now = Date.now();
    let count = 0;
    for (const [, node] of this._map) {
      if (node.expiresAt !== null && now > node.expiresAt) {
        this._evictNode(node);
        count++;
      }
    }
    return count;
  }

  // ── خصائص إحصائية ─────────────────────────────────────────────

  get size()    { return this._map.size; }
  get hitRate() {
    const total = this._hits + this._misses;
    return total ? this._hits / total : 0;
  }
  get stats()   {
    return { size: this.size, hits: this._hits, misses: this._misses, hitRate: this.hitRate };
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /** @param {LRUNode} node */
  _isExpired(node) {
    return node.expiresAt !== null && Date.now() > node.expiresAt;
  }

  /** @param {number|undefined} ttlMs */
  _computeExpiry(ttlMs) {
    const effective = ttlMs ?? this._ttl;
    return effective ? Date.now() + effective : null;
  }

  /** @param {LRUNode} node */
  _detach(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  /** @param {LRUNode} node */
  _insertAfterHead(node) {
    node.prev         = this._head;
    node.next         = this._head.next;
    this._head.next.prev = node;
    this._head.next   = node;
  }

  /** @param {LRUNode} node */
  _moveToFront(node) {
    this._detach(node);
    this._insertAfterHead(node);
  }

  /** احذف المدخلة الأقدم استخداماً (من الذيل) */
  _evictLRU() {
    const node = this._tail.prev;
    if (node === this._head) return;
    this._evictNode(node);
  }

  /** @param {LRUNode} node */
  _evictNode(node) {
    this._detach(node);
    this._map.delete(node.key);
    if (this._onEvict) this._onEvict(node.key, node.value);
  }
}

// ── مصنع كاشات جاهزة ──────────────────────────────────────────

/**
 * أنشئ مجموعة كاشات جاهزة للمحادثات والمستخدمين والمجموعات.
 * @param {object} [opts]
 * @param {number} [opts.maxThreads=500]
 * @param {number} [opts.threadTtl]       - مللي ثانية (افتراضي: 10 دقائق)
 * @param {number} [opts.maxUsers=1000]
 * @param {number} [opts.userTtl]         - مللي ثانية (افتراضي: 30 دقيقة)
 * @param {number} [opts.maxGroups=200]
 * @param {number} [opts.groupTtl]        - مللي ثانية (افتراضي: 15 دقيقة)
 */
export function createFcaCaches(opts = {}) {
  return {
    threads: new LRUCache({ max: opts.maxThreads ?? 500,  ttl: opts.threadTtl ?? 10 * 60_000 }),
    users:   new LRUCache({ max: opts.maxUsers   ?? 1000, ttl: opts.userTtl   ?? 30 * 60_000 }),
    groups:  new LRUCache({ max: opts.maxGroups  ?? 200,  ttl: opts.groupTtl  ?? 15 * 60_000 }),
  };
}

export default LRUCache;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-lru-cache',
  meta: { category: 'utils', path: 'lib/utils/lru-cache.js' },
  setup(_ctx) {
    // provides: LRUCache, createFcaCaches
  },
};
