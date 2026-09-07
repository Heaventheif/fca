import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import _sgLog from '../../func/logAdapter.js';

const DEFAULT_INTERVAL = 3 * 60 * 1000; 
const DEFAULT_DEBOUNCE = 30_000; 
const DEFAULT_SHRINK = 0.2; 

export default function advancedSessionGuardFactory(defaultFuncs, api, ctx) {
  return function advancedSessionGuard(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('advancedSessionGuard: filePath is required.');
    }

    const absPath = resolvePath(filePath);
    const bakPath = absPath + '.bak';
    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL;
    const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE;
    const shrinkThresh = options.shrinkThreshold ?? DEFAULT_SHRINK;
    const onSave = options.onSave ?? null;
    const onError = options.onError ?? ((e) => _sgLog.error('[SessionGuard] ' + String(e)));

    let debounceTimer = null;
    let intervalRef = null;
    let destroyed = false;

    function safeWrite() {
      if (destroyed) return;
      try {
        const appState = api.getAppState?.();
        if (!appState || !Array.isArray(appState) || appState.length === 0) {
          onError(new Error('[SessionGuard] getAppState returned empty — skipping.'));
          return;
        }

        const newData = JSON.stringify(appState, null, 2);

        
        if (existsSync(absPath)) {
          const existingSize = statSync(absPath).size;
          const newSize = Buffer.byteLength(newData, 'utf8');
          const shrinkRatio = 1 - newSize / existingSize;

          if (shrinkRatio > shrinkThresh) {
            onError(
              new Error(
                `[SessionGuard] Corruption guard triggered: new state is ${(shrinkRatio * 100).toFixed(1)}% smaller. Skipping save.`
              )
            );
            return;
          }
          
          copyFileSync(absPath, bakPath);
        }

        writeFileSync(absPath, newData, 'utf8');
        if (typeof onSave === 'function') onSave(absPath, appState.length);
      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }

    function debouncedSave() {
      if (destroyed) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(safeWrite, debounceMs);
    }

    const originalSend = api.sendMessage?.bind(api);
    if (typeof originalSend === 'function') {
      api.sendMessage = async function patchedSend(...args) {
        const result = await originalSend(...args);
        debouncedSave();
        return result;
      };
    }

    // Randomized periodic save: base intervalMs ±35% jitter
    function _schedSave() {
      const jitter = (Math.random() * 0.7 - 0.35) * intervalMs;
      intervalRef = setTimeout(() => {
        safeWrite();
        if (!destroyed) _schedSave();
      }, Math.max(30_000, Math.round(intervalMs + jitter)));
      if (intervalRef.unref) intervalRef.unref();
    }
    _schedSave();

    // Randomized initial save: 3–8s after startup
    setTimeout(safeWrite, 3000 + Math.random() * 5000).unref?.();

    api.restoreSessionBackup = function restoreSessionBackup(targetPath = absPath) {
      const src = resolvePath(targetPath) + '.bak';
      const dst = resolvePath(targetPath);
      if (!existsSync(src)) throw new Error(`[SessionGuard] No backup found at ${src}`);
      copyFileSync(src, dst);
      return { restored: true, from: src, to: dst };
    };

    api.readSessionBackup = function readSessionBackup(targetPath = absPath) {
      const src = resolvePath(targetPath) + '.bak';
      if (!existsSync(src)) return null;
      return JSON.parse(readFileSync(src, 'utf8'));
    };

    const stop = function stop() {
      destroyed = true;
      clearTimeout(intervalRef);
      clearTimeout(debounceTimer);
    };

    return { stop, save: safeWrite, paths: { main: absPath, backup: bakPath } };
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-action-advanced-session-guard',
  meta: { category: 'external-api-action', path: 'lib/external-apis/action/advancedSessionGuard.js' },
  setup(_ctx) {
    // provides: advancedSessionGuardFactory
  },
};
