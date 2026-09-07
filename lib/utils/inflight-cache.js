export class InflightCache {
  
  constructor(opts = {}) {
    this._pending = new Map(); 
    this._maxSize = opts.maxSize ?? 200;
    this._hits = 0; 
    this._total = 0;
  }

  
  async dedupe(key, fn) {
    this._total++;

    
    if (this._pending.has(key)) {
      this._hits++;
      return this._pending.get(key);
    }

    
    if (this._pending.size >= this._maxSize) {
      return fn();
    }

    
    const promise = fn().finally(() => {
      this._pending.delete(key);
    });

    this._pending.set(key, promise);
    return promise;
  }

  
  cancel(key) {
    this._pending.delete(key);
  }

  
  get pending() {
    return this._pending.size;
  }

  
  get hitRate() {
    return this._total ? (this._hits / this._total).toFixed(4) : '0.0000';
  }

  get stats() {
    return {
      pending: this._pending.size,
      hits: this._hits,
      total: this._total,
      saved: this._hits, 
      hitRate: this.hitRate,
    };
  }

  
  clear() {
    this._pending.clear();
  }
}

export function createFcaInflightCaches() {
  return {
    threads: new InflightCache({ maxSize: 100 }),
    users: new InflightCache({ maxSize: 200 }),
    threadList: new InflightCache({ maxSize: 20 }),
  };
}

export function wrapApiWithInflight(api, caches) {
  if (typeof api.getThreadInfo === 'function') {
    const original = api.getThreadInfo.bind(api);
    api.getThreadInfo = function (threadID, callback) {
      const key = `thread:${threadID}`;

      const promise = caches.threads.dedupe(
        key,
        () =>
          new Promise((res, rej) => original(threadID, (err, info) => (err ? rej(err) : res(info))))
      );

      if (typeof callback === 'function') {
        promise.then((r) => callback(null, r)).catch((e) => callback(e));
        return;
      }
      return promise;
    };
  }

  if (typeof api.getUserInfo === 'function') {
    const original = api.getUserInfo.bind(api);
    api.getUserInfo = function (userIDs, callback) {
      const ids = Array.isArray(userIDs) ? [...userIDs].sort() : [userIDs];
      const key = `user:${ids.join(',')}`;

      const promise = caches.users.dedupe(
        key,
        () =>
          new Promise((res, rej) => original(userIDs, (err, info) => (err ? rej(err) : res(info))))
      );

      if (typeof callback === 'function') {
        promise.then((r) => callback(null, r)).catch((e) => callback(e));
        return;
      }
      return promise;
    };
  }

  api._inflight = caches;
  return caches;
}

export default InflightCache;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-inflight-cache',
  meta: { category: 'utils', path: 'lib/utils/inflight-cache.js' },
  setup(_ctx) {
    // provides: InflightCache, createFcaInflightCaches, wrapApiWithInflight
  },
};
