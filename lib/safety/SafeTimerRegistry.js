const MAX_ANONYMOUS = 64; 

export class SafeTimerRegistry {
  constructor() {
    this._named = new Map(); 
    this._anon = []; 
    this._anonHead = 0;
    this._destroyed = false;
  }

  
  set(name, handle, kind = 'timeout') {
    if (this._destroyed) {
      this._clear(handle, kind);
      return;
    }
    const prev = this._named.get(name);
    if (prev) this._clear(prev.handle, prev.kind);
    this._named.set(name, { handle, kind });
  }

  
  add(handle) {
    if (this._destroyed) {
      clearTimeout(handle);
      return;
    }
    const evicted = this._anon[this._anonHead];
    if (evicted != null) clearTimeout(evicted); 
    this._anon[this._anonHead] = handle;
    this._anonHead = (this._anonHead + 1) % MAX_ANONYMOUS;
  }

  
  clear(name) {
    const entry = this._named.get(name);
    if (!entry) return;
    this._clear(entry.handle, entry.kind);
    this._named.delete(name);
  }

  
  destroy() {
    this._destroyed = true;
    for (const { handle, kind } of this._named.values()) this._clear(handle, kind);
    this._named.clear();
    for (const h of this._anon) {
      if (h != null) clearTimeout(h);
    }
    this._anon.length = 0;
  }

  _clear(handle, kind) {
    try {
      if (kind === 'interval') clearInterval(handle);
      else clearTimeout(handle);
    } catch {
      
    }
  }
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-safe-timer-registry',
  meta: { category: 'safety', path: 'lib/safety/SafeTimerRegistry.js' },
  setup(_ctx) {
    // provides: SafeTimerRegistry
  },
};
