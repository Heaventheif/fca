/**
 * thread-filter.js — فلترة الأحداث بـ blacklist/whitelist وإضافة listenOnce
 *
 * يتكامل مع api.listenMqtt ويضيف:
 *  1. api.setThreadFilter({ ignore: [], allowOnly: [] })
 *  2. api.listenOnce(eventType?)  → Promise<event>
 *  3. أحداث type==='typing' و type==='read_receipt' يمكن تجاهلها
 */

/**
 * Attach thread filter to api.listenMqtt
 * @param {object} api
 * @param {object} [initialOpts]
 * @param {string[]}  [initialOpts.ignore]      - thread IDs to always ignore
 * @param {string[]}  [initialOpts.allowOnly]   - if set, ONLY these threads fire events
 * @param {string[]}  [initialOpts.muteTypes]   - event types to mute globally
 * @returns {{ setFilter, getFilter, listenOnce }}
 */
export function attachThreadFilter(api, initialOpts = {}) {
  let _ignore    = new Set((initialOpts.ignore    ?? []).map(String));
  let _allowOnly = initialOpts.allowOnly ? new Set(initialOpts.allowOnly.map(String)) : null;
  let _muteTypes = new Set(initialOpts.muteTypes ?? []);

  const _onceListeners = []; // [{ type, resolve }]

  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) throw new Error('attachThreadFilter: api.listenMqtt not found.');

  api.listenMqtt = function filteredListen(callback) {
    return originalListen(function filteredCallback(err, event) {
      if (err) return callback(err, event);
      if (!event) return;

      // ── muted event types ────────────────────────────────────────────────
      if (_muteTypes.has(event.type)) return;

      // ── thread filtering ─────────────────────────────────────────────────
      const tid = String(event.threadID ?? event.thread_fbid ?? '');
      if (tid) {
        if (_ignore.has(tid)) return;
        if (_allowOnly && !_allowOnly.has(tid)) return;
      }

      // ── listenOnce handlers ──────────────────────────────────────────────
      for (let i = _onceListeners.length - 1; i >= 0; i--) {
        const { type, resolve, reject: _rej } = _onceListeners[i];
        if (!type || event.type === type) {
          _onceListeners.splice(i, 1);
          resolve({ ...event });
          return; // consumed — don't propagate to main callback
        }
      }

      return callback(null, event);
    });
  };

  // ── api.setThreadFilter ───────────────────────────────────────────────────
  api.setThreadFilter = function setThreadFilter(opts = {}) {
    if (Array.isArray(opts.ignore))    _ignore    = new Set(opts.ignore.map(String));
    if (Array.isArray(opts.allowOnly)) _allowOnly = new Set(opts.allowOnly.map(String));
    if (opts.allowOnly === null)       _allowOnly = null;
    if (Array.isArray(opts.muteTypes)) _muteTypes = new Set(opts.muteTypes);
  };

  // ── api.getThreadFilter ───────────────────────────────────────────────────
  api.getThreadFilter = function getThreadFilter() {
    return {
      ignore:    [..._ignore],
      allowOnly: _allowOnly ? [..._allowOnly] : null,
      muteTypes: [..._muteTypes],
    };
  };

  /**
   * api.listenOnce(type?, timeoutMs?) → Promise<event>
   * يُحل بأول حدث من النوع المطلوب (أو أي حدث لو type فارغ).
   * @param {string}  [type]      - مثل 'message', 'event', 'message_reply'
   * @param {number}  [timeoutMs] - default: 60000 — يُرفض بعد المهلة
   */
  api.listenOnce = function listenOnce(type, timeoutMs = 60_000) {
    if (typeof type === 'number') { timeoutMs = type; type = null; }
    return new Promise((resolve, reject) => {
      let timer;
      const entry = { type: type ?? null, resolve, reject };
      _onceListeners.push(entry);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = _onceListeners.indexOf(entry);
          if (idx !== -1) _onceListeners.splice(idx, 1);
          reject(new Error(`listenOnce timed out after ${timeoutMs}ms waiting for "${type ?? 'any'}"`));
        }, timeoutMs);
      }

      // Wrap resolve to also clear timer
      entry.resolve = val => { clearTimeout(timer); resolve(val); };
    });
  };

  return {
    setFilter:    api.setThreadFilter,
    getFilter:    api.getThreadFilter,
    listenOnce:   api.listenOnce,
  };
}

export default attachThreadFilter;
