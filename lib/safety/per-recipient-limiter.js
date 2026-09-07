import { TokenBucket } from './token-bucket.js';
import logger from '../func/logger.js';

const CLEANUP_MS = 10 * 60 * 1_000;

export class PerRecipientLimiter {
  
  constructor(opts = {}) {
    this._delayMs = opts.delayMs ?? 350;
    this._maxConc = opts.maxConcurrent ?? 8;
    this._capacity = opts.capacity ?? 5;
    this._buckets = new Map(); 
    this._inFlight = new Map(); 
    this._lastUsed = new Map(); 
    this._waiters = new Map(); 

    if (opts.enableCleanup !== false) {
      this._scheduleCleanup();
    }
  }

  
  async acquire(recipientId) {
    const id = String(recipientId);

    
    const inFlight = this._inFlight.get(id) ?? 0;
    if (inFlight >= this._maxConc) {
      
      await new Promise((resolve) => {
        if (!this._waiters.has(id)) this._waiters.set(id, []);
        this._waiters.get(id).push(resolve);
      });
    }

    
    const bucket = this._getBucket(id);
    const { allowed, waitMs } = bucket.consume();
    if (!allowed && waitMs > 0) {
      logger(`[PerRecipientLimiter] ⏳ ${id} — انتظار ${waitMs}ms`, 'warn');
      await new Promise((r) => setTimeout(r, waitMs));
    }

    
    const last = this._lastUsed.get(id) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < this._delayMs) {
      await new Promise((r) => setTimeout(r, this._delayMs - elapsed));
    }

    this._lastUsed.set(id, Date.now());
    this._inFlight.set(id, (this._inFlight.get(id) ?? 0) + 1);
  }

  
  release(recipientId) {
    const id = String(recipientId);
    const count = Math.max(0, (this._inFlight.get(id) ?? 1) - 1);
    this._inFlight.set(id, count);

    
    const waiters = this._waiters.get(id);
    if (waiters?.length > 0) {
      const next = waiters.shift();
      next?.();
    }
  }

  
  async run(recipientId, fn) {
    await this.acquire(recipientId);
    try {
      return await fn();
    } finally {
      this.release(recipientId);
    }
  }

  getStats() {
    return {
      tracked: this._buckets.size,
      inFlight: Object.fromEntries([...this._inFlight.entries()].filter(([, v]) => v > 0)),
    };
  }

  _getBucket(id) {
    if (!this._buckets.has(id)) {
      this._buckets.set(
        id,
        new TokenBucket({
          capacity: this._capacity,
          refillRate: this._capacity,
          refillIntervalMs: 60_000,
        })
      );
    }
    return this._buckets.get(id);
  }

  _scheduleCleanup() {
    // Randomized: base CLEANUP_MS ±45% jitter
    const jitter = (Math.random() * 0.9 - 0.45) * CLEANUP_MS;
    this._cleanupTimer = setTimeout(() => {
      this._cleanup();
      this._scheduleCleanup();
    }, Math.max(60_000, Math.round(CLEANUP_MS + jitter)));
    this._cleanupTimer?.unref?.();
  }

  _cleanup() {
    const cutoff = Date.now() - CLEANUP_MS;
    for (const [id, ts] of this._lastUsed) {
      if (ts < cutoff && !(this._inFlight.get(id) > 0)) {
        this._buckets.delete(id);
        this._inFlight.delete(id);
        this._lastUsed.delete(id);
        this._waiters.delete(id);
      }
    }
  }
}

export function createPerRecipientLimiter(opts) {
  return new PerRecipientLimiter(opts);
}

export default PerRecipientLimiter;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-per-recipient-limiter',
  meta: { category: 'safety', path: 'lib/safety/per-recipient-limiter.js' },
  setup(_ctx) {
    // provides: PerRecipientLimiter, createPerRecipientLimiter
  },
};
