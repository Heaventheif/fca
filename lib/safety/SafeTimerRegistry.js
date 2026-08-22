/**
 * SafeTimerRegistry.js — Memory-safe timer management
 *
 * Fixes the unbounded _timerRegistry growth in FacebookSafety.js.
 * 
 * Root cause: The original code stores every new timer handle in a Set.
 * Recursive schedulers call _registerTimer each time they fire, adding a new
 * handle but never removing the already-fired one. Over days of runtime the
 * Set accumulates millions of stale handles.
 *
 * Fix: Wrap each named slot with replace-semantics. Only one timer per slot
 * exists at a time. Anonymous timers use a ring-buffer bounded at MAX_ANONYMOUS.
 */

const MAX_ANONYMOUS = 64; // ring-buffer cap for unnamed one-shot timers

export class SafeTimerRegistry {
  constructor() {
    this._named = new Map();     // name → handle
    this._anon = [];             // ring buffer for unnamed handles
    this._anonHead = 0;
    this._destroyed = false;
  }

  /**
   * Register or replace a named timer slot.
   * The previous handle in that slot (if any) is cleared automatically.
   * @param {string}   name   Logical slot name (e.g. 'heartbeat', 'refresh')
   * @param {*}        handle Return value of setTimeout/setInterval
   * @param {'timeout'|'interval'} [kind='timeout']
   */
  set(name, handle, kind = 'timeout') {
    if (this._destroyed) { this._clear(handle, kind); return; }
    const prev = this._named.get(name);
    if (prev) this._clear(prev.handle, prev.kind);
    this._named.set(name, { handle, kind });
  }

  /**
   * Register an anonymous one-shot timer (no replace-semantics needed).
   * Uses a ring-buffer to bound memory: oldest entry is evicted when full.
   */
  add(handle) {
    if (this._destroyed) { clearTimeout(handle); return; }
    const evicted = this._anon[this._anonHead];
    if (evicted != null) clearTimeout(evicted); // evict oldest (no-op if already fired)
    this._anon[this._anonHead] = handle;
    this._anonHead = (this._anonHead + 1) % MAX_ANONYMOUS;
  }

  /** Clear a specific named slot without destroying the registry. */
  clear(name) {
    const entry = this._named.get(name);
    if (!entry) return;
    this._clear(entry.handle, entry.kind);
    this._named.delete(name);
  }

  /** Destroy all timers and mark the registry as dead. */
  destroy() {
    this._destroyed = true;
    for (const { handle, kind } of this._named.values()) this._clear(handle, kind);
    this._named.clear();
    for (const h of this._anon) { if (h != null) clearTimeout(h); }
    this._anon.length = 0;
  }

  _clear(handle, kind) {
    try {
      if (kind === 'interval') clearInterval(handle);
      else clearTimeout(handle);
    } catch { /* handle already cleared */ }
  }
}
