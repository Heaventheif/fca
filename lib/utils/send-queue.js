/**
 * send-queue.js — طابور إرسال مرتب حسب المحادثة (Thread).
 *
 * يضمن إرسال الرسائل بترتيب FIFO داخل كل محادثة،
 * مع إمكانية الإيقاف المؤقت، الأولوية القصوى، والتفريغ عند الإغلاق.
 */

/** قيم افتراضية */
const DEFAULTS = Object.freeze({
  maxQueueSize:  50,
  interMsgDelay: 300,
});

export class ThreadSendQueue {
  /**
   * @param {Function} sendFn - دالة الإرسال: (msg, threadID, replyToID?) => Promise
   * @param {object}   [opts]
   * @param {number}   [opts.maxQueueSize=50]    - أقصى حجم للطابور لكل محادثة
   * @param {number}   [opts.interMsgDelay=300]  - تأخير بالمللي ثانية بين الرسائل
   */
  constructor(sendFn, opts = {}) {
    if (typeof sendFn !== 'function') {
      throw new Error('ThreadSendQueue: sendFn is required.');
    }

    this._send   = sendFn;
    this._maxQ   = opts.maxQueueSize  ?? DEFAULTS.maxQueueSize;
    this._delay  = opts.interMsgDelay ?? DEFAULTS.interMsgDelay;

    /** @type {Map<string, { items: Array, running: boolean }>} */
    this._queues = new Map();
    this._paused = false;

    // إحصائيات تراكمية
    this._totalQueued = 0;
    this._totalSent   = 0;
    this._totalFailed = 0;
  }

  // ── واجهة عامة ────────────────────────────────────────────────

  /**
   * أضف رسالة إلى نهاية طابور المحادثة.
   * @param {*}      msg
   * @param {string} threadID
   * @param {string} [replyToID]
   * @returns {Promise<*>}
   */
  enqueue(msg, threadID, replyToID) {
    return this._addToQueue(msg, threadID, replyToID, /* urgent */ false);
  }

  /**
   * أضف رسالة إلى مقدمة طابور المحادثة (أولوية عالية).
   * @param {*}      msg
   * @param {string} threadID
   * @param {string} [replyToID]
   * @returns {Promise<*>}
   */
  enqueueUrgent(msg, threadID, replyToID) {
    return this._addToQueue(msg, threadID, replyToID, /* urgent */ true);
  }

  /** أوقف الإرسال مؤقتاً (الرسائل تتراكم في الطابور) */
  pause() {
    this._paused = true;
  }

  /** استأنف الإرسال وابدأ بمعالجة الطوابير المتراكمة */
  resume() {
    this._paused = false;
    for (const [tid, queue] of this._queues) {
      if (!queue.running && queue.items.length > 0) this._flush(tid);
    }
  }

  /**
   * انتظر حتى تُرسَل جميع الرسائل المعلقة.
   * @param {number} [timeoutMs=30000]
   */
  async drain(timeoutMs = 30_000) {
    const start = Date.now();
    while (this._queues.size > 0) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('ThreadSendQueue: drain timed out.');
      }
      await this._sleep(100);
    }
  }

  /**
   * احذف جميع الرسائل المعلقة لمحادثة معينة.
   * @param {string} threadID
   * @returns {number} عدد الرسائل المحذوفة
   */
  clearThread(threadID) {
    const queue = this._queues.get(String(threadID));
    if (!queue) return 0;

    const count = queue.items.length;
    for (const item of queue.items) {
      item.reject(new Error('ThreadSendQueue: queue cleared.'));
    }
    queue.items = [];
    return count;
  }

  /** إحصائيات الطوابير الراهنة */
  get stats() {
    let pending = 0;
    for (const q of this._queues.values()) pending += q.items.length;
    return {
      activeThreads: this._queues.size,
      pending,
      sent:          this._totalSent,
      failed:        this._totalFailed,
      queued:        this._totalQueued,
    };
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /**
   * منطق الإضافة المشترك بين enqueue / enqueueUrgent.
   * @param {*}      msg
   * @param {string} threadID
   * @param {string} [replyToID]
   * @param {boolean} urgent
   */
  _addToQueue(msg, threadID, replyToID, urgent) {
    const tid = String(threadID);
    if (!this._queues.has(tid)) {
      this._queues.set(tid, { items: [], running: false });
    }

    const queue = this._queues.get(tid);

    if (!urgent && queue.items.length >= this._maxQ) {
      return Promise.reject(
        new Error(`ThreadSendQueue: queue for thread ${tid} is full (max ${this._maxQ}).`)
      );
    }

    return new Promise((resolve, reject) => {
      const item = { msg, replyToID: replyToID ?? null, resolve, reject };
      urgent ? queue.items.unshift(item) : queue.items.push(item);
      this._totalQueued++;
      if (!queue.running) this._flush(tid);
    });
  }

  /** معالجة طابور محادثة واحدة بشكل تسلسلي */
  async _flush(tid) {
    const queue = this._queues.get(tid);
    if (!queue || queue.running) return;
    queue.running = true;

    while (queue.items.length > 0) {
      // احترم وضع الإيقاف المؤقت
      if (this._paused) {
        await this._sleep(200);
        continue;
      }

      const { msg, replyToID, resolve, reject } = queue.items.shift();
      try {
        const result = replyToID
          ? await this._send(msg, tid, replyToID)
          : await this._send(msg, tid);
        this._totalSent++;
        resolve(result);
      } catch (err) {
        this._totalFailed++;
        reject(err);
      }

      // تأخير بين الرسائل (إذا بقي في الطابور المزيد)
      if (queue.items.length > 0) await this._sleep(this._delay);
    }

    queue.running = false;
    this._queues.delete(tid); // أزل الطابور الفارغ لتوفير الذاكرة
  }

  /** @param {number} ms */
  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ── وصل ثابت ─────────────────────────────────────────────────

  /**
   * أضف طابور إرسال مباشرةً إلى كائن API موجود.
   * @param {object} api  - كائن API يملك sendMessage
   * @param {object} [opts]
   * @returns {ThreadSendQueue}
   */
  static attachTo(api, opts = {}) {
    const originalSend = api.sendMessage.bind(api);
    const queue        = new ThreadSendQueue(originalSend, opts);

    api.sendMessage = function queuedSend(msg, threadID, replyToID, callback) {
      if (typeof replyToID === 'function') {
        callback  = replyToID;
        replyToID = null;
      }
      const promise = queue.enqueue(msg, threadID, replyToID);
      if (typeof callback === 'function') {
        promise.then(r => callback(null, r)).catch(e => callback(e));
      }
      return promise;
    };

    api._sendQueue = queue;
    return queue;
  }
}

export default ThreadSendQueue;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-send-queue',
  meta: { category: 'utils', path: 'lib/utils/send-queue.js' },
  setup(_ctx) {
    // provides: ThreadSendQueue
  },
};
