var c = Object.defineProperty;
var o = (r, i) => c(r, 'name', { value: i, configurable: !0 });
import d from 'path';
import m from 'fs';
const A = { default: d },
  g = { default: m };
function I(r) {
  const { api: i, ctx: e, logger: a } = r;
  return o(function (l = {}) {
    const p = l.filePath || A.default.join(process.cwd(), 'appstate.json'),
      u = l.interval || 600 * 1e3,
      S = l.saveOnLogin !== !1;
    function v() {
      try {
        const t = i.getAppState();
        if (!t || !t.appState || t.appState.length === 0) {
          a?.('AppState is empty, skipping save', 'warn');
          return;
        }
        (g.default.writeFileSync(p, JSON.stringify(t, null, 2), { encoding: 'utf8', mode: 384 }),
          a?.(`AppState saved to ${p}`, 'info'));
      } catch (t) {
        a?.(`Error saving AppState: ${t && t.message ? t.message : String(t)}`, 'error');
      }
    }
    o(v, 'saveAppState');
    let n = null;
    S &&
      (n = setTimeout(() => {
        // Randomized initial save: 1.5–4s after enable
        (v(), (n = null));
      }, 1500 + Math.random() * 2500));

    // Randomized periodic save: base u ±35% jitter
    let s;
    function _schedSave() {
      const jitter = (Math.random() * 0.7 - 0.35) * u;
      s = setTimeout(() => {
        v();
        _schedSave();
      }, Math.max(30_000, Math.round(u + jitter)));
    }
    _schedSave();
    return (
      a?.(`Auto-save AppState enabled: ${p} (~every ${Math.round(u / 1e3 / 60)} minutes, randomized)`, 'info'),
      e._autoSaveInterval || (e._autoSaveInterval = []),
      e._autoSaveInterval.push(s),
      o(function () {
        (n && (clearTimeout(n), (n = null)), clearTimeout(s));
        const f = e._autoSaveInterval ? e._autoSaveInterval.indexOf(s) : -1;
        (f !== -1 && e._autoSaveInterval.splice(f, 1), a?.('Auto-save AppState disabled', 'info'));
      }, 'disableAutoSaveAppState')
    );
  }, 'enableAutoSaveAppState');
}
o(I, 'createEnableAutoSaveAppStateCommand');
var y = { createEnableAutoSaveAppStateCommand: I };
export { I as createEnableAutoSaveAppStateCommand, y as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-account-commands-enable-auto-save-app-state',
  meta: { category: 'domain-account', path: 'lib/domains/account/commands/enable-auto-save-app-state.js' },
  setup(_ctx) {
    // provides: createEnableAutoSaveAppStateCommand
  },
};
