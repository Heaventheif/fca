export class MessageDedup {
  constructor(opts = {}) {
    this._max = opts.maxSize ?? 300;
    this._ttl = opts.ttl ?? 5 * 60 * 1000;
    this._seen = new Map(); 
    this._dups = 0;
    this._allowed = 0;
  }

  
  isDuplicate(messageID) {
    if (!messageID) return false;
    const id = String(messageID);
    const now = Date.now();

    const existing = this._seen.get(id);
    if (existing) {
      if (now < existing) {
        this._dups++;
        return true; 
      }
      
      this._seen.delete(id);
    }

    this._register(id, now);
    this._allowed++;
    return false;
  }

  
  _register(id, now) {
    
    if (this._seen.size >= this._max) {
      
      for (const [k, exp] of this._seen) {
        if (now >= exp) this._seen.delete(k);
      }
      
      if (this._seen.size >= this._max) {
        const firstKey = this._seen.keys().next().value;
        this._seen.delete(firstKey);
      }
    }
    this._seen.set(id, now + this._ttl);
  }

  
  prune() {
    const now = Date.now();
    let count = 0;
    for (const [k, exp] of this._seen) {
      if (now >= exp) {
        this._seen.delete(k);
        count++;
      }
    }
    return count;
  }

  get stats() {
    return {
      tracked: this._seen.size,
      dups: this._dups,
      allowed: this._allowed,
      dupRate:
        this._dups + this._allowed
          ? (this._dups / (this._dups + this._allowed)).toFixed(4)
          : '0.0000',
    };
  }

  
  reset() {
    this._seen.clear();
    this._dups = this._allowed = 0;
  }

  
  wrapListener(originalCallback) {
    const self = this;
    return function dedupListener(err, event) {
      if (err) return originalCallback(err, event);
      if (!event) return;

      const id = event.messageID ?? event.mid ?? event.id ?? null;
      
      if (id && (event.type === 'message' || event.type === 'message_reply')) {
        if (self.isDuplicate(id)) return; 
      }
      return originalCallback(null, event);
    };
  }
}

export function attachDedup(api, opts = {}) {
  const dedup = new MessageDedup(opts);
  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) return dedup;

  api.listenMqtt = function dedupListen(callback) {
    return originalListen(dedup.wrapListener(callback));
  };
  api._dedup = dedup;

  
  // Randomized prune: base 2min ± 50% jitter to avoid fixed fingerprint
  function schedulePrune() {
    const base = 2 * 60 * 1000;
    const jitter = (Math.random() * base) - (base / 2); // ±50%
    const delay = Math.max(30_000, Math.round(base + jitter));
    const t = setTimeout(() => {
      dedup.prune();
      schedulePrune();
    }, delay);
    t.unref?.();
  }
  schedulePrune();

  return dedup;
}

export default MessageDedup;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-message-dedup',
  meta: { category: 'utils', path: 'lib/utils/message-dedup.js' },
  setup(_ctx) {
    // provides: MessageDedup, attachDedup
  },
};
