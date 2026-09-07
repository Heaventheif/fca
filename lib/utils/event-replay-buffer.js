export class EventReplayBuffer {
  constructor(opts = {}) {
    this._maxBuffer = opts.maxBuffer ?? 200;
    this._replayDelay = opts.replayDelay ?? 50;
    this._bufferTypes = new Set(opts.bufferTypes ?? ['message', 'message_reply', 'event']);
    this._buffer = [];
    this._offline = false;
    this._callback = null;
    this._totalReplayed = 0;
    this._totalBuffered = 0;
    this._mqttClient = null;
    this._cleanupFns = [];
  }

  
  attach(mqttClient, callback) {
    this._mqttClient = mqttClient;
    this._callback = callback;

    const onOffline = () => {
      this._offline = true;
    };
    const onConnect = () => {
      if (!this._offline) return;
      this._offline = false;
      this._replay();
    };

    mqttClient.on('offline', onOffline);
    mqttClient.on('connect', onConnect);
    mqttClient.on('reconnect', onConnect);

    this._cleanupFns.push(
      () => mqttClient.removeListener('offline', onOffline),
      () => mqttClient.removeListener('connect', onConnect),
      () => mqttClient.removeListener('reconnect', onConnect)
    );

    
    const self = this;
    return function replayBufferListener(err, event) {
      if (err) return callback(err, event);
      if (!event) return;

      if (self._offline && self._bufferTypes.has(event.type)) {
        
        if (self._buffer.length >= self._maxBuffer) self._buffer.shift(); 
        self._buffer.push({ ...event, _buffered: true, _bufferedAt: Date.now() });
        self._totalBuffered++;
        return; 
      }

      return callback(null, event);
    };
  }

  
  async _replay() {
    if (this._buffer.length === 0) return;
    const events = this._buffer.splice(0, this._buffer.length); 

    for (const event of events) {
      try {
        this._callback(null, event);
        this._totalReplayed++;
      } catch {
        
      }
      if (this._replayDelay > 0) await this._sleep(this._replayDelay);
    }
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  
  async flushBuffer() {
    this._offline = false;
    await this._replay();
  }

  
  clearBuffer() {
    const count = this._buffer.length;
    this._buffer = [];
    return count;
  }

  destroy() {
    for (const fn of this._cleanupFns) {
      try {
        fn();
      } catch {}
    }
    this._cleanupFns = [];
    this._buffer = [];
  }

  get stats() {
    return {
      offline: this._offline,
      buffered: this._buffer.length,
      totalBuffered: this._totalBuffered,
      totalReplayed: this._totalReplayed,
    };
  }
}

export function attachReplayBuffer(api, ctx, opts = {}) {
  const buffer = new EventReplayBuffer(opts);
  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) return buffer;

  api.listenMqtt = function replayListen(callback) {
    const client = ctx.mqttClient;
    if (!client) {
      
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

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-event-replay-buffer',
  meta: { category: 'utils', path: 'lib/utils/event-replay-buffer.js' },
  setup(_ctx) {
    // provides: EventReplayBuffer, attachReplayBuffer
  },
};
