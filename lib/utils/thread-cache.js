const DEFAULT_TTL = 5 * 60 * 1000; 
const DEFAULT_MAX_SIZE = 500;

export class ThreadCache {
  
  constructor(api, options = {}) {
    this._api = api;
    this._ttl = options.ttlMs ?? DEFAULT_TTL;
    this._max = options.maxSize ?? DEFAULT_MAX_SIZE;
    this._autoInvalidate = options.invalidateOnEvent !== false;

    
    this._threads = new Map();
    
    this._users = new Map();

    this._hits = 0;
    this._misses = 0;
  }

  
  getThreadInfo(threadID) {
    return this._get(
      this._threads,
      String(threadID),
      () =>
        new Promise((res, rej) =>
          this._api.getThreadInfo(threadID, (err, v) => (err ? rej(err) : res(v)))
        )
    );
  }

  
  getUserInfo(userID) {
    const key = Array.isArray(userID) ? userID.sort().join(',') : String(userID);
    return this._get(
      this._users,
      key,
      () =>
        new Promise((res, rej) =>
          this._api.getUserInfo(userID, (err, v) => (err ? rej(err) : res(v)))
        )
    );
  }

  
  invalidateThread(threadID) {
    this._threads.delete(String(threadID));
  }

  
  invalidateUser(userID) {
    this._users.delete(String(userID));
  }

  
  clear() {
    this._threads.clear();
    this._users.clear();
    this._hits = this._misses = 0;
  }

  
  stats() {
    const total = this._hits + this._misses;
    return {
      threads: this._threads.size,
      users: this._users.size,
      hits: this._hits,
      misses: this._misses,
      hitRate: total ? Math.round((this._hits / total) * 100) : 0,
    };
  }

  
  static attach(api, options = {}) {
    const cache = new ThreadCache(api, options);
    const origThread = api.getThreadInfo?.bind(api);
    const origUser = api.getUserInfo?.bind(api);

    if (origThread) {
      api.getThreadInfo = (threadID, callback) => {
        cache
          .getThreadInfo(threadID)
          .then((v) => callback?.(null, v))
          .catch((e) => callback?.(e));
      };
    }

    if (origUser) {
      api.getUserInfo = (userID, callback) => {
        cache
          .getUserInfo(userID)
          .then((v) => callback?.(null, v))
          .catch((e) => callback?.(e));
      };
    }

    
    if (options.invalidateOnEvent !== false && typeof api.listenMqtt === 'function') {
      const origListen = api.listenMqtt.bind(api);
      api.listenMqtt = (cb) =>
        origListen((err, event) => {
          if (!err && event?.type === 'event' && event?.threadID) {
            cache.invalidateThread(event.threadID);
          }
          cb?.(err, event);
        });
    }

    return cache;
  }

  async _get(store, key, fetcher) {
    const now = Date.now();
    const item = store.get(key);

    if (item && now - item.ts < this._ttl) {
      this._hits++;
      return item.value;
    }

    this._misses++;
    const value = await fetcher();

    
    if (store.size >= this._max) {
      const oldest = store.keys().next().value;
      store.delete(oldest);
    }

    store.set(key, { value, ts: now });
    return value;
  }
}

export function createThreadCache(api, options) {
  return new ThreadCache(api, options);
}

export default { ThreadCache, createThreadCache };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-thread-cache',
  meta: { category: 'utils', path: 'lib/utils/thread-cache.js' },
  setup(_ctx) {
    // provides: ThreadCache, createThreadCache
  },
};
