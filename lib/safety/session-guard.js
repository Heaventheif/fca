/**
 * session-guard.js — حارس الجلسة مع تشفير النسخ الاحتياطية.
 *
 * المهام:
 *  - حفظ fb_dtsg واسترجاعه مشفَّراً من القرص
 *  - مراقبة خمول الجلسة وإطلاق حدث stale
 */
import fs          from 'node:fs';
import path        from 'node:path';
import logger      from '../func/logger.js';
import { canWriteBackup, encryptBackupString, decryptBackupString } from './backup-crypto.js';
import { nextPoisson } from '../utils/human-timing.js';

/** مدة الخمول الافتراضية قبل اعتبار الجلسة منتهية (5 دقائق) */
const DEFAULT_IDLE_MS    = 5 * 60_000;
const DEFAULT_STORE_PATH = path.join(process.cwd(), '.session-store.json');

export class SessionGuard {
  /**
   * @param {object}  [opts]
   * @param {boolean} [opts.enabled=true]
   * @param {string}  [opts.storePath]       - مسار ملف التخزين
   * @param {number}  [opts.watchdogIdleMs=300000]   - مهلة الخمول
   * @param {number}  [opts.watchdogIntervalMs=60000] - فاصل الفحص
   */
  constructor(opts = {}) {
    const storePath    = opts.storePath ?? DEFAULT_STORE_PATH;
    const resolvedPath = path.resolve(storePath);
    const cwd          = path.resolve(process.cwd());

    // منع مسارات خارج مجلد العمل
    if (!resolvedPath.startsWith(cwd + path.sep) && resolvedPath !== cwd) {
      throw new Error(`SessionGuard: storePath outside working directory: ${resolvedPath}`);
    }

    this.options = {
      enabled:            opts.enabled          !== false,
      storePath:          resolvedPath,
      watchdogIdleMs:     opts.watchdogIdleMs   ?? DEFAULT_IDLE_MS,
      watchdogIntervalMs: opts.watchdogIntervalMs ?? 60_000,
    };

    this._ctx           = null;
    this._lastActivity  = Date.now();
    this._watchdogTimer = null;
    this._onStale       = null;
  }

  // ── واجهة عامة ────────────────────────────────────────────────

  /**
   * اربط الحارس بسياق الجلسة وابدأ المراقبة.
   * @param {object}   ctx
   * @param {object}   [opts]
   * @param {Function} [opts.onStale]
   */
  attach(ctx, { onStale } = {}) {
    this._ctx    = ctx;
    if (typeof onStale === 'function') this._onStale = onStale;

    this._load();
    if (this.options.enabled) this._startWatchdog();

    return this;
  }

  /** سجِّل نشاطاً — يُعيد ضبط عداد الخمول */
  heartbeat() {
    this._lastActivity = Date.now();
  }

  /** مدة الخمول بالمللي ثانية */
  get idleMs() {
    return Date.now() - this._lastActivity;
  }

  /** احفظ الـ tokens مشفَّرة على القرص */
  save() {
    if (!this._ctx?.fb_dtsg) return;
    if (!canWriteBackup(logger)) return;

    try {
      const payload = JSON.stringify({
        fb_dtsg:  this._ctx.fb_dtsg,
        jazoest:  this._ctx.jazoest ?? '',
        savedAt:  new Date().toISOString(),
      });

      const dir = path.dirname(this.options.storePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

      fs.writeFileSync(this.options.storePath, encryptBackupString(payload), {
        encoding: 'utf8',
        mode:     0o600,
      });
    } catch { /* فشل صامت */ }
  }

  /** أوقف مؤقت المراقبة */
  stop() {
    if (this._watchdogTimer) {
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /** استرجع tokens محفوظة وطبِّقها على السياق إن لم تكن موجودة */
  _load() {
    try {
      if (!fs.existsSync(this.options.storePath)) return;

      const raw       = fs.readFileSync(this.options.storePath, 'utf8');
      const plaintext = decryptBackupString(raw, logger);
      if (plaintext == null) return;

      const saved = JSON.parse(plaintext);
      const ctx   = this._ctx;

      if (saved.fb_dtsg && ctx && (!ctx.fb_dtsg || ctx.fb_dtsg === 'undefined')) {
        ctx.fb_dtsg = saved.fb_dtsg;
        if (saved.jazoest) ctx.jazoest = saved.jazoest;
        logger('SessionGuard: recovered tokens from store', 'info');
      }
    } catch { /* فشل صامت */ }
  }

  /** ابدأ المراقبة الدورية بتوقيت عشوائي */
  _startWatchdog() {
    this.stop();

    const tick = () => {
      const idle = this.idleMs;

      if (idle > this.options.watchdogIdleMs) {
        logger(`SessionGuard: session idle for ${Math.round(idle / 1000)}s — emitting stale`, 'warn');
        try { this._onStale?.(this._ctx); } catch { /* لا نوقف المراقبة */ }

        // تأجيل المرور القادم لتجنب الإطلاق المتكرر
        this._lastActivity = Date.now() - this.options.watchdogIdleMs + this.options.watchdogIntervalMs * 3;
      }

      const delay = nextPoisson(
        this.options.watchdogIntervalMs,
        1_000,
        this.options.watchdogIntervalMs * 3
      );
      this._watchdogTimer = setTimeout(tick, delay);
      this._watchdogTimer.unref?.();
    };

    const initialDelay = nextPoisson(
      this.options.watchdogIntervalMs,
      1_000,
      this.options.watchdogIntervalMs * 3
    );
    this._watchdogTimer = setTimeout(tick, initialDelay);
    this._watchdogTimer.unref?.();
  }
}

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof SessionGuard>[0]} opts
 */
export function createSessionGuard(opts) {
  return new SessionGuard(opts);
}

export default { SessionGuard, createSessionGuard };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-session-guard',
  meta: { category: 'safety', path: 'lib/safety/session-guard.js' },
  setup(_ctx) {
    // provides: SessionGuard, createSessionGuard
  },
};
