/**
 * LRUCache — طبقة تخزين مؤقت في الذاكرة بدون تبعيات خارجية
 *
 * خوارزمية: doubly-linked list + Map → O(1) get/set/delete
 * يدعم TTL و max size وcallback onEvict
 */
class LRUNode {
  constructor(key, value, expiresAt) {
    this.key       = key;
    this.value     = value;
    this.expiresAt = expiresAt; // ms timestamp or null
    this.prev      = null;
    this.next      = null;
  }
}

export class LRUCache {
  /**
   * @param {object} opts
   * @param {number}   opts.max       - max entries (default: 500)
   * @param {number}   [opts.ttl]     - default TTL in ms (null = no expiry)
   * @param {function} [opts.onEvict] - (key, value) called on eviction
   */
  constructor(opts = {}) {
    this._max     = opts.max     ?? 500;
    this._ttl     = opts.ttl     ?? null;
    this._onEvict = opts.onEvict ?? null;
    this._map     = new Map();     // key → LRUNode
    this._head    = new LRUNode(null, null, null); // sentinel head (MRU side)
    this._tail    = new LRUNode(null, null, null); // sentinel tail (LRU side)
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._hits    = 0;
    this._misses  = 0;
  }

  // ─── doubly-linked list helpers ───────────────────────────────────────────
  _detach(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }
  _insertAfterHead(node) {
    node.prev       = this._head;
    node.next       = this._head.next;
    this._head.next.prev = node;
    this._head.next = node;
  }
  _evictLRU() {
    const node = this._tail.prev;
    if (node === this._head) return; // empty
    this._detach(node);
    this._map.delete(node.key);
    if (this._onEvict) this._onEvict(node.key, node.value);
  }

  // ─── public API ───────────────────────────────────────────────────────────
  get(key) {
    const node = this._map.get(key);
    if (!node) { this._misses++; return undefined; }
    if (node.expiresAt !== null && Date.now() > node.expiresAt) {
      this._detach(node);
      this._map.delete(key);
      this._misses++;
      return undefined;
    }
    // move to MRU
    this._detach(node);
    this._insertAfterHead(node);
    this._hits++;
    return node.value;
  }

  set(key, value, ttlMs) {
    const existingNode = this._map.get(key);
    const expiresAt    = (ttlMs ?? this._ttl) ? Date.now() + (ttlMs ?? this._ttl) : null;

    if (existingNode) {
      existingNode.value     = value;
      existingNode.expiresAt = expiresAt;
      this._detach(existingNode);
      this._insertAfterHead(existingNode);
      return this;
    }

    if (this._map.size >= this._max) this._evictLRU();

    const node = new LRUNode(key, value, expiresAt);
    this._map.set(key, node);
    this._insertAfterHead(node);
    return this;
  }

  delete(key) {
    const node = this._map.get(key);
    if (!node) return false;
    this._detach(node);
    this._map.delete(key);
    return true;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  clear() {
    this._map.clear();
    this._head.next = this._tail;
    this._tail.prev = this._head;
    this._hits = this._misses = 0;
  }

  get size()     { return this._map.size; }
  get hitRate()  { const t = this._hits + this._misses; return t ? this._hits / t : 0; }
  get stats()    { return { size: this.size, hits: this._hits, misses: this._misses, hitRate: this.hitRate }; }

  // Remove all expired entries (useful to call periodically)
  prune() {
    const now = Date.now();
    let count = 0;
    for (const [key, node] of this._map) {
      if (node.expiresAt !== null && now > node.expiresAt) {
        this._detach(node);
        this._map.delete(key);
        count++;
      }
    }
    return count;
  }
}

/**
 * Thread/User cache singletons used by the FCA client.
 * Can be imported separately or accessed via api.cache.*
 */
export function createFcaCaches(opts = {}) {
  return {
    threads: new LRUCache({ max: opts.maxThreads ?? 500, ttl: opts.threadTtl ?? 10 * 60 * 1000 }),
    users:   new LRUCache({ max: opts.maxUsers   ?? 1000, ttl: opts.userTtl  ?? 30 * 60 * 1000 }),
    groups:  new LRUCache({ max: opts.maxGroups  ?? 200,  ttl: opts.groupTtl ?? 15 * 60 * 1000 }),
  };
}

export default LRUCache;
