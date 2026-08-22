/**
 * EventReplayBuffer — حفظ الأحداث أثناء انقطاع MQTT وإعادة بثها عند الاتصال
 *
 * كيف يعمل:
 *  1. يراقب حالة mqtt (connected/disconnected عبر ctx.mqttClient events)
 *  2. عند الانقطاع → يبدأ التخزين المؤقت
 *  3. عند إعادة الاتصال → يُعيد بث الأحداث المخزنة للـ callback
 *
 * Options:
 *   maxBuffer {number} أقصى أحداث تُحفظ    (default: 200)
 *   replayDelay {number} ms تأخير بين replays (default: 50)
 *   bufferTypes {string[]} أنواع الأحداث المحفوظة (default: ['message','message_reply'])
 */
export class EventReplayBuffer {
  constructor(opts = {}) {
    this._maxBuffer   = opts.maxBuffer   ?? 200;
    this._replayDelay = opts.replayDelay ?? 50;
    this._bufferTypes = new Set(opts.bufferTypes ?? ['message', 'message_reply', 'event']);
    this._buffer      = [];
    this._offline     = false;
    this._callback    = null;
    this._totalReplayed = 0;
    this._totalBuffered = 0;
    this._mqttClient    = null;
    this._cleanupFns    = [];
  }

  /**
   * Attach to an mqttClient and a listener callback.
   * @param {object}   mqttClient - ctx.mqttClient
   * @param {function} callback   - original event callback (err, event) =>
   * @returns {function} wrappedCallback to pass to listenMqtt instead
   */
  attach(mqttClient, callback) {
    this._mqttClient = mqttClient;
    this._callback   = callback;

    const onOffline = () => { this._offline = true; };
    const onConnect = () => {
      if (!this._offline) return;
      this._offline = false;
      this._replay();
    };

    mqttClient.on('offline',     onOffline);
    mqttClient.on('connect',     onConnect);
    mqttClient.on('reconnect',   onConnect);

    this._cleanupFns.push(
      () => mqttClient.removeListener('offline',   onOffline),
      () => mqttClient.removeListener('connect',   onConnect),
      () => mqttClient.removeListener('reconnect', onConnect),
    );

    // Return the wrapped callback
    const self = this;
    return function replayBufferListener(err, event) {
      if (err) return callback(err, event);
      if (!event) return;

      if (self._offline && self._bufferTypes.has(event.type)) {
        // Buffer it
        if (self._buffer.length >= self._maxBuffer) self._buffer.shift(); // drop oldest
        self._buffer.push({ ...event, _buffered: true, _bufferedAt: Date.now() });
        self._totalBuffered++;
        return; // Don't call callback yet
      }

      return callback(null, event);
    };
  }

  /** Replay all buffered events to the original callback */
  async _replay() {
    if (this._buffer.length === 0) return;
    const events = this._buffer.splice(0, this._buffer.length); // drain buffer atomically

    for (const event of events) {
      try {
        this._callback(null, event);
        this._totalReplayed++;
      } catch {
        // ignore callback errors during replay
      }
      if (this._replayDelay > 0) await this._sleep(this._replayDelay);
    }
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** Force-replay buffer immediately (e.g. when reconnect event not fired) */
  async flushBuffer() {
    this._offline = false;
    await this._replay();
  }

  /** Discard all buffered events */
  clearBuffer() {
    const count = this._buffer.length;
    this._buffer = [];
    return count;
  }

  destroy() {
    for (const fn of this._cleanupFns) { try { fn(); } catch {} }
    this._cleanupFns = [];
    this._buffer     = [];
  }

  get stats() {
    return {
      offline:        this._offline,
      buffered:       this._buffer.length,
      totalBuffered:  this._totalBuffered,
      totalReplayed:  this._totalReplayed,
    };
  }
}

/**
 * Convenience: attach EventReplayBuffer to api + ctx automatically.
 * Call after login, before listenMqtt.
 *
 * Usage:
 *   const buf = attachReplayBuffer(api, ctx);
 *   api.listenMqtt((err, event) => { ... }); // ← automatically buffered
 */
export function attachReplayBuffer(api, ctx, opts = {}) {
  const buffer      = new EventReplayBuffer(opts);
  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) return buffer;

  api.listenMqtt = function replayListen(callback) {
    const client = ctx.mqttClient;
    if (!client) {
      // MQTT not connected yet — wrap and retry after first connect
      const wrapped = buffer.attach({ on: () => {}, removeListener: () => {} }, callback);
      return originalListen(wrapped);
    }
    const wrapped = buffer.attach(client, callback);
    return originalListen(wrapped);
  };

  api._replayBuffer = buffer;
  return buffer;
}

export default EventReplayBuffer;
