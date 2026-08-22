/**
 * advancedSessionGuard — حماية الجلسة المتقدمة
 *
 * يوفر:
 *  1. حفظ تلقائي دوري كل intervalMs (default: 3 min)
 *  2. نسخ احتياطي .bak قبل كل كتابة
 *  3. Corruption guard: يرفض حفظ appstate أصغر من الموجود بـ SHRINK_THRESHOLD%
 *  4. Debounce: يحفظ بعد كل sendMessage بـ DEBOUNCE_MS تأخير
 *  5. api.restoreSessionBackup(path) للاسترداد اليدوي من .bak
 *
 * Usage:
 *   api.advancedSessionGuard('./appstate.json', {
 *     intervalMs: 3 * 60 * 1000,
 *     debounceMs: 30_000,
 *     shrinkThreshold: 0.20,
 *   });
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const DEFAULT_INTERVAL   = 3 * 60 * 1000;  // 3 minutes
const DEFAULT_DEBOUNCE   = 30_000;          // 30 seconds
const DEFAULT_SHRINK     = 0.20;            // 20% shrinkage triggers rejection

export default function advancedSessionGuardFactory(defaultFuncs, api, ctx) {
  return function advancedSessionGuard(filePath, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('advancedSessionGuard: filePath is required.');
    }

    const absPath      = resolvePath(filePath);
    const bakPath      = absPath + '.bak';
    const intervalMs   = options.intervalMs      ?? DEFAULT_INTERVAL;
    const debounceMs   = options.debounceMs      ?? DEFAULT_DEBOUNCE;
    const shrinkThresh = options.shrinkThreshold ?? DEFAULT_SHRINK;
    const onSave       = options.onSave          ?? null;
    const onError      = options.onError         ?? (e => console.error('[SessionGuard]', e));

    let debounceTimer = null;
    let intervalRef   = null;
    let destroyed     = false;

    // ─── core save ────────────────────────────────────────────────────────────
    function safeWrite() {
      if (destroyed) return;
      try {
        const appState = api.getAppState?.();
        if (!appState || !Array.isArray(appState) || appState.length === 0) {
          onError(new Error('[SessionGuard] getAppState returned empty — skipping.'));
          return;
        }

        const newData = JSON.stringify(appState, null, 2);

        // Corruption guard: compare against existing file
        if (existsSync(absPath)) {
          const existingSize = statSync(absPath).size;
          const newSize      = Buffer.byteLength(newData, 'utf8');
          const shrinkRatio  = 1 - newSize / existingSize;

          if (shrinkRatio > shrinkThresh) {
            onError(new Error(
              `[SessionGuard] Corruption guard triggered: new state is ${(shrinkRatio * 100).toFixed(1)}% smaller. Skipping save.`
            ));
            return;
          }
          // Backup before overwrite
          copyFileSync(absPath, bakPath);
        }

        writeFileSync(absPath, newData, 'utf8');
        if (typeof onSave === 'function') onSave(absPath, appState.length);

      } catch (e) {
        onError(e instanceof Error ? e : new Error(String(e)));
      }
    }

    // ─── debounced save (called after sendMessage) ────────────────────────────
    function debouncedSave() {
      if (destroyed) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(safeWrite, debounceMs);
    }

    // ─── patch sendMessage to trigger debounced save ──────────────────────────
    const originalSend = api.sendMessage?.bind(api);
    if (typeof originalSend === 'function') {
      api.sendMessage = async function patchedSend(...args) {
        const result = await originalSend(...args);
        debouncedSave();
        return result;
      };
    }

    // ─── periodic save ────────────────────────────────────────────────────────
    intervalRef = setInterval(safeWrite, intervalMs);
    if (intervalRef.unref) intervalRef.unref();

    // ─── immediate first save ─────────────────────────────────────────────────
    setTimeout(safeWrite, 5000).unref?.();

    // ─── restoreSessionBackup utility ─────────────────────────────────────────
    api.restoreSessionBackup = function restoreSessionBackup(targetPath = absPath) {
      const src = resolvePath(targetPath) + '.bak';
      const dst = resolvePath(targetPath);
      if (!existsSync(src)) throw new Error(`[SessionGuard] No backup found at ${src}`);
      copyFileSync(src, dst);
      return { restored: true, from: src, to: dst };
    };

    // ─── readBackup utility ───────────────────────────────────────────────────
    api.readSessionBackup = function readSessionBackup(targetPath = absPath) {
      const src = resolvePath(targetPath) + '.bak';
      if (!existsSync(src)) return null;
      return JSON.parse(readFileSync(src, 'utf8'));
    };

    // ─── teardown ─────────────────────────────────────────────────────────────
    const stop = function stop() {
      destroyed = true;
      clearInterval(intervalRef);
      clearTimeout(debounceTimer);
    };

    return { stop, save: safeWrite, paths: { main: absPath, backup: bakPath } };
  };
}
