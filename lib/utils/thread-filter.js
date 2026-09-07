export function attachThreadFilter(api, initialOpts = {}) {
  let _ignore = new Set((initialOpts.ignore ?? []).map(String));
  let _allowOnly = initialOpts.allowOnly ? new Set(initialOpts.allowOnly.map(String)) : null;
  let _muteTypes = new Set(initialOpts.muteTypes ?? []);

  const _onceListeners = []; 

  // FIX #10: تحذير إذا استُدعي attachThreadFilter بعد connectE2EE
  // connectE2EE تستبدل api.listenMqtt بـ listenE2EE وتحفظ الأصل في _listenMqttRaw.
  // استدعاء attachThreadFilter بعدها يلف listenE2EE لا MQTT الأصلي، مما يُفقد
  // E2EE events من نطاق الفلتر. الحل: استدعِ attachThreadFilter قبل connectE2EE.
  if (api._listenMqttRaw) {
    console.warn(
      `[attachThreadFilter] WARNING: Called after connectE2EE().\n  E2EE messages will bypass the thread filter.\n  To apply filtering to all messages, call attachThreadFilter() BEFORE connectE2EE().`
    );
  }

  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) throw new Error('attachThreadFilter: api.listenMqtt not found.');

  // حفظ المرجع الأصلي حتى يتمكن connectE2EE لاحقاً من اكتشافه
  if (!api._listenMqttRaw) {
    api._listenMqttRaw = originalListen;
  }

  api.listenMqtt = function filteredListen(callback) {
    return originalListen(function filteredCallback(err, event) {
      if (err) return callback(err, event);
      if (!event) return;

      if (_muteTypes.has(event.type)) return;

      const tid = String(event.threadID ?? event.thread_fbid ?? '');
      if (tid) {
        if (_ignore.has(tid)) return;
        if (_allowOnly && !_allowOnly.has(tid)) return;
      }

      for (let i = _onceListeners.length - 1; i >= 0; i--) {
        const { type, resolve, reject: _rej } = _onceListeners[i];
        if (!type || event.type === type) {
          _onceListeners.splice(i, 1);
          resolve({ ...event });
          return; 
        }
      }

      return callback(null, event);
    });
  };

  api.setThreadFilter = function setThreadFilter(opts = {}) {
    if (Array.isArray(opts.ignore)) _ignore = new Set(opts.ignore.map(String));
    if (Array.isArray(opts.allowOnly)) _allowOnly = new Set(opts.allowOnly.map(String));
    if (opts.allowOnly === null) _allowOnly = null;
    if (Array.isArray(opts.muteTypes)) _muteTypes = new Set(opts.muteTypes);
  };

  api.getThreadFilter = function getThreadFilter() {
    return {
      ignore: [..._ignore],
      allowOnly: _allowOnly ? [..._allowOnly] : null,
      muteTypes: [..._muteTypes],
    };
  };

  
  api.listenOnce = function listenOnce(type, timeoutMs = 60_000) {
    if (typeof type === 'number') {
      timeoutMs = type;
      type = null;
    }
    return new Promise((resolve, reject) => {
      let timer;
      const entry = { type: type ?? null, resolve, reject };
      _onceListeners.push(entry);

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          const idx = _onceListeners.indexOf(entry);
          if (idx !== -1) _onceListeners.splice(idx, 1);
          reject(
            new Error(`listenOnce timed out after ${timeoutMs}ms waiting for "${type ?? 'any'}"`)
          );
        }, timeoutMs);
      }

      
      entry.resolve = (val) => {
        clearTimeout(timer);
        resolve(val);
      };
    });
  };

  return {
    setFilter: api.setThreadFilter,
    getFilter: api.getThreadFilter,
    listenOnce: api.listenOnce,
  };
}

export default attachThreadFilter;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-thread-filter',
  meta: { category: 'utils', path: 'lib/utils/thread-filter.js' },
  setup(_ctx) {
    // provides: attachThreadFilter
  },
};
