var c = Object.defineProperty;
var n = (u, o) => c(u, 'name', { value: o, configurable: !0 });
import m from 'fs';
import d from 'path';
import r from '../../../lib/func/logger.js';
function A(u, o, t) {
  return n(function (s = {}) {
    const l = s.filePath || d.join(process.cwd(), 'appstate.json'),
      v = s.interval || 600 * 1e3,
      S = s.saveOnLogin !== !1;
    function f() {
      try {
        const e = o.getAppState();
        if (!e || !e.appState || e.appState.length === 0) {
          r('AppState is empty, skipping save', 'warn');
          return;
        }
        const i = JSON.stringify(e, null, 2);
        (m.writeFileSync(l, i, 'utf8'), r(`AppState saved to ${l}`, 'info'));
      } catch (e) {
        r(`Error saving AppState: ${e && e.message ? e.message : String(e)}`, 'error');
      }
    }
    n(f, 'saveAppState');
    let a = null;
    S &&
      (a = setTimeout(() => {
        // Randomized initial save: 1.5–4s after enable
        (f(), (a = null));
      }, 1500 + Math.random() * 2500));

    // Randomized periodic save: base v ±35% jitter
    let p;
    function _schedSave() {
      const jitter = (Math.random() * 0.7 - 0.35) * v;
      p = setTimeout(() => {
        f();
        _schedSave();
      }, Math.max(30_000, Math.round(v + jitter)));
    }
    _schedSave();
    return (
      r(`Auto-save AppState enabled: ${l} (~every ${Math.round(v / 1e3 / 60)} minutes, randomized)`, 'info'),
      t._autoSaveInterval || (t._autoSaveInterval = []),
      t._autoSaveInterval.push(p),
      n(function () {
        (a && (clearTimeout(a), (a = null)), clearTimeout(p));
        const i = t._autoSaveInterval ? t._autoSaveInterval.indexOf(p) : -1;
        (i !== -1 && t._autoSaveInterval.splice(i, 1), r('Auto-save AppState disabled', 'info'));
      }, 'disableAutoSaveAppState')
    );
  }, 'enableAutoSaveAppState');
}
n(A, 'default');
export { A as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-action-enable-auto-save-app-state',
  meta: { category: 'external-api-action', path: 'lib/external-apis/action/enableAutoSaveAppState.js' },
  setup(_ctx) {
    // see module exports
  },
};
