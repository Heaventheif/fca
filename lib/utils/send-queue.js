/**
 * ThreadSendQueue — queue لكل thread يضمن ترتيب الإرسال ويمنع race conditions
 *
 * كل thread لديه queue منفصل. الرسائل تُرسل بالترتيب.
 * إذا فشل الإرسال تُطرح الرسالة ويكمل Queue.
 *
 * Options:
 *   maxQueueSize  {number}  أقصى رسائل بانتظار الإرسال لكل thread (default: 50)
 *   interMsgDelay {number}  ms تأخير إجباري بين رسائل نفس الـ thread (default: 300)
 */
export class ThreadSendQueue {
  constructor(sendFn, opts = {}) {
    if (typeof sendFn !== 'function') throw new Error('ThreadSendQueue: sendFn is required.');
    this._send         = sendFn;
    this._maxQ         = opts.maxQueueSize  ?? 50;
    this._delay        = opts.interMsgDelay ?? 300;
    this._queues       = new Map();  // threadID → { items: [], running: bool }
    this._totalQueued  = 0;
    this._totalSent    = 0;
    this._totalFailed  = 0;
  }

  // ─── public: enqueue a message ───────────────────────────────────────────
  enqueue(msg, threadID, replyToID) {
    const tid = String(threadID);
    if (!this._queues.has(tid)) this._queues.set(tid, { items: [], running: false });
    const q = this._queues.get(tid);

    if (q.items.length >= this._maxQ) {
      return Promise.reject(
        new Error(`ThreadSendQueue: queue for thread ${tid} is full (max ${this._maxQ}).`)
      );
    }

    return new Promise((resolve, reject) => {
      q.items.push({ msg, replyToID: replyToID ?? null, resolve, reject });
      this._totalQueued++;
      if (!q.running) this._flush(tid);
    });
  }

  // ─── internal: flush a thread's queue ────────────────────────────────────
  async _flush(tid) {
    const q = this._queues.get(tid);
    if (!q || q.running) return;
    q.running = true;

    while (q.items.length > 0) {
      const { msg, replyToID, resolve, reject } = q.items.shift();
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
      if (q.items.length > 0) await this._sleep(this._delay);
    }

    q.running = false;
    // GC empty queues to avoid memory leak for high-cardinality thread sets
    if (q.items.length === 0) this._queues.delete(tid);
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ─── public: stats ───────────────────────────────────────────────────────
  get stats() {
    let pending = 0;
    for (const q of this._queues.values()) pending += q.items.length;
    return {
      activeThreads: this._queues.size,
      pending,
      sent:   this._totalSent,
      failed: this._totalFailed,
      queued: this._totalQueued,
    };
  }

  // ─── public: drain — wait until all queues are empty ─────────────────────
  async drain(timeoutMs = 30_000) {
    const start = Date.now();
    while (this._queues.size > 0) {
      if (Date.now() - start > timeoutMs) throw new Error('ThreadSendQueue: drain timed out.');
      await this._sleep(100);
    }
  }

  // ─── public: clear a specific thread's queue ─────────────────────────────
  clearThread(threadID) {
    const q = this._queues.get(String(threadID));
    if (!q) return 0;
    const count = q.items.length;
    for (const item of q.items) item.reject(new Error('ThreadSendQueue: queue cleared.'));
    q.items = [];
    return count;
  }

  // ─── public: wrap an existing api object's sendMessage ───────────────────
  static attachTo(api, opts = {}) {
    const originalSend = api.sendMessage.bind(api);
    const queue = new ThreadSendQueue(originalSend, opts);

    api.sendMessage = function queuedSend(msg, threadID, replyToID, callback) {
      if (typeof replyToID === 'function') { callback = replyToID; replyToID = null; }
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

// ─── FIX-10: drain + priority + pause/resume ─────────────────────────────────
// هذه الدوال مُضافة للملف الأصلي بدون تعديل ما سبق

// نُعيد export الـ class مع الإضافات عبر prototype
Object.assign(ThreadSendQueue.prototype, {

  /**
   * ينتظر حتى تنتهي كل الـ queues النشطة أو حتى انتهاء المهلة
   * مستخدم من graceful-shutdown
   * @param {number} timeoutMs
   */
  drain(timeoutMs = 5000) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        let hasPending = false;
        for (const q of this._queues.values()) {
          if (q.running || q.items.length > 0) { hasPending = true; break; }
        }
        if (!hasPending || Date.now() - start > timeoutMs) return resolve();
        setTimeout(check, 50);
      };
      check();
    });
  },

  /**
   * إيقاف مؤقت لكل الـ queues (لا ترسل رسائل جديدة)
   * مفيد عند اكتشاف checkpoint / block
   */
  pause() { this._paused = true; },

  /**
   * استئناف الإرسال بعد pause
   */
  resume() {
    this._paused = false;
    for (const tid of this._queues.keys()) {
      const q = this._queues.get(tid);
      if (q && !q.running && q.items.length > 0) this._flush(tid);
    }
  },

  /**
   * إرسال ذو أولوية (يُضاف للمقدمة لا للنهاية)
   * مثال: رسائل الإدارة/الأوامر لها أولوية على رسائل البرودكاست
   */
  enqueueUrgent(msg, threadID, replyToID) {
    const tid = String(threadID);
    if (!this._queues.has(tid)) this._queues.set(tid, { items: [], running: false });
    const q = this._queues.get(tid);

    return new Promise((resolve, reject) => {
      q.items.unshift({ msg, replyToID: replyToID ?? null, resolve, reject });
      this._totalQueued++;
      if (!q.running) this._flush(tid);
    });
  },
});

// Override _flush لدعم pause
const _originalFlush = ThreadSendQueue.prototype._flush;
ThreadSendQueue.prototype._flush = async function(tid) {
  const q = this._queues.get(tid);
  if (!q || q.running) return;
  q.running = true;

  while (q.items.length > 0) {
    if (this._paused) {
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    const { msg, replyToID, resolve, reject } = q.items.shift();
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
    if (q.items.length > 0) await this._sleep(this._delay);
  }

  q.running = false;
  if (q.items.length === 0) this._queues.delete(tid);
};
