/**
 * inflight-cache.js — تخزين الطلبات المتطابقة في الهواء (In-Flight Deduplication)
 *
 * المشكلة: عندما يُعالج البوت حدثاً ويستدعي getThreadInfo() في نفس الوقت
 * من معالجَين مختلفَين للـ thread نفسه، يُرسل طلبَين متطابقَين لـ Facebook.
 * هذا يُضاعف الحمل الشبكي ويُسرع الوصول لحد الـ rate limit.
 *
 * الحل: كل طلب pending يُخزَّن بـ key. الطلب الثاني بنفس الـ key ينتظر
 * نتيجة الأول بدل إطلاق طلب جديد. Zero race conditions — Promise مشتركة.
 *
 * الاستخدام:
 *   const cache = new InflightCache();
 *   const result = await cache.dedupe('thread:123', () => fetchThreadInfo('123'));
 *   // إذا كان هناك طلب آخر لـ 'thread:123' جارٍ → تنتظر نتيجته مباشرة
 */

export class InflightCache {
  /**
   * @param {object}  opts
   * @param {number}    opts.maxSize  - أقصى طلبات pending في نفس الوقت (default: 200)
   */
  constructor(opts = {}) {
    this._pending = new Map();   // key → Promise
    this._maxSize = opts.maxSize ?? 200;
    this._hits    = 0;           // عدد الطلبات المُدمجة (توفير شبكة)
    this._total   = 0;
  }

  /**
   * تنفيذ fn أو الانتظار على طلب مماثل جارٍ
   *
   * @param {string}    key  - مفتاح فريد يصف الطلب (مثل: 'thread:123', 'user:456')
   * @param {function}  fn   - الدالة المراد تنفيذها: () => Promise<T>
   * @returns {Promise<T>}
   */
  async dedupe(key, fn) {
    this._total++;

    // يوجد طلب جارٍ بنفس المفتاح → شارك نتيجته
    if (this._pending.has(key)) {
      this._hits++;
      return this._pending.get(key);
    }

    // الـ cache ممتلئ → نفّذ مباشرة بدون deduplication
    if (this._pending.size >= this._maxSize) {
      return fn();
    }

    // طلب جديد → أضفه للـ pending
    const promise = fn().finally(() => {
      this._pending.delete(key);
    });

    this._pending.set(key, promise);
    return promise;
  }

  /**
   * إلغاء طلب pending (نادراً مطلوب لكن مفيد في الاختبارات)
   * @param {string} key
   */
  cancel(key) {
    this._pending.delete(key);
  }

  /** الطلبات الجارية حالياً */
  get pending()  { return this._pending.size; }

  /** نسبة الطلبات المُدمجة (توفير الشبكة) */
  get hitRate()  {
    return this._total ? (this._hits / this._total).toFixed(4) : '0.0000';
  }

  get stats() {
    return {
      pending:  this._pending.size,
      hits:     this._hits,
      total:    this._total,
      saved:    this._hits,      // طلبات HTTP تم توفيرها
      hitRate:  this.hitRate,
    };
  }

  /** مسح كل الطلبات المعلقة (للاختبار فقط) */
  clear() { this._pending.clear(); }
}

/**
 * إنشاء caches جاهزة للاستخدام مع getThreadInfo و getUserInfo
 *
 * Usage بعد login:
 *   import { createFcaInflightCaches, wrapApiWithInflight } from './utils/inflight-cache.js';
 *   const inflight = createFcaInflightCaches();
 *   wrapApiWithInflight(api, inflight);
 */
export function createFcaInflightCaches() {
  return {
    threads:     new InflightCache({ maxSize: 100 }),
    users:       new InflightCache({ maxSize: 200 }),
    threadList:  new InflightCache({ maxSize: 20  }),
  };
}

/**
 * Wrap api methods تلقائياً لتفعيل in-flight deduplication
 *
 * @param {object} api      - FCA api object
 * @param {object} caches   - { threads, users, threadList }
 */
export function wrapApiWithInflight(api, caches) {
  // ── getThreadInfo ──────────────────────────────────────────────────────────
  if (typeof api.getThreadInfo === 'function') {
    const original = api.getThreadInfo.bind(api);
    api.getThreadInfo = function(threadID, callback) {
      const key = `thread:${threadID}`;

      const promise = caches.threads.dedupe(key, () =>
        new Promise((res, rej) =>
          original(threadID, (err, info) => err ? rej(err) : res(info))
        )
      );

      if (typeof callback === 'function') {
        promise.then(r => callback(null, r)).catch(e => callback(e));
        return;
      }
      return promise;
    };
  }

  // ── getUserInfo ────────────────────────────────────────────────────────────
  if (typeof api.getUserInfo === 'function') {
    const original = api.getUserInfo.bind(api);
    api.getUserInfo = function(userIDs, callback) {
      const ids  = Array.isArray(userIDs) ? [...userIDs].sort() : [userIDs];
      const key  = `user:${ids.join(',')}`;

      const promise = caches.users.dedupe(key, () =>
        new Promise((res, rej) =>
          original(userIDs, (err, info) => err ? rej(err) : res(info))
        )
      );

      if (typeof callback === 'function') {
        promise.then(r => callback(null, r)).catch(e => callback(e));
        return;
      }
      return promise;
    };
  }

  api._inflight = caches;
  return caches;
}

export default InflightCache;
