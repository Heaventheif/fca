/**
 * SingleSessionGuard.js — حارس الجلسة الفردية.
 *
 * يضمن عدم تشغيل أكثر من عملية FCA واحدة في نفس الوقت
 * باستخدام ملف قفل (lock file) على القرص.
 */
import fs   from 'node:fs';
import path from 'node:path';

export class SingleSessionGuard {
  /**
   * @param {object} [opts]
   * @param {string} [opts.lockPath]       - مسار ملف القفل (افتراضي: .fca-session.lock)
   * @param {number} [opts.staleAfterMs=60000] - مدة اعتبار القفل منتهياً
   */
  constructor(opts = {}) {
    const lockPath    = opts.lockPath || path.join(process.cwd(), '.fca-session.lock');
    const resolved    = path.resolve(lockPath);
    const cwd         = path.resolve(process.cwd());

    if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
      throw new Error(`SingleSessionGuard: lockPath outside working directory: ${resolved}`);
    }

    this.lockPath     = resolved;
    this.staleAfterMs = opts.staleAfterMs || 60_000;
    this._pid         = process.pid;
    this._interval    = null;
    this._stopped     = false;
  }

  // ── واجهة عامة ────────────────────────────────────────────────

  /**
   * احصل على القفل. تُرجع true عند النجاح، false إذا كانت جلسة أخرى نشطة.
   * @returns {boolean}
   */
  acquire() {
    try {
      // تحقق من قفل موجود
      if (fs.existsSync(this.lockPath)) {
        const existing = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
        const isRecent = Date.now() - (existing.ts || 0) < this.staleAfterMs;

        if (isRecent) {
          try {
            process.kill(existing.pid, 0); // هل العملية لا تزال حية؟
            return false; // جلسة أخرى نشطة
          } catch { /* العملية ميتة — القفل قديم */ }
        }
      }

      // سجِّل القفل باسمنا
      this._writeLock();
      this._scheduleHeartbeat();
      process.once('exit', () => this.release());
      return true;
    } catch {
      return false;
    }
  }

  /** أفلت القفل وأوقف النبضات */
  release() {
    this._stopped = true;

    if (this._interval) {
      clearTimeout(this._interval);
      this._interval = null;
    }

    try {
      if (!fs.existsSync(this.lockPath)) return;
      const existing = JSON.parse(fs.readFileSync(this.lockPath, 'utf8'));
      if (existing.pid === this._pid) fs.unlinkSync(this.lockPath);
    } catch { /* فشل صامت */ }
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /** اكتب ملف القفل */
  _writeLock() {
    fs.writeFileSync(
      this.lockPath,
      JSON.stringify({ pid: this._pid, ts: Date.now() }),
      { encoding: 'utf8', mode: 0o600 }
    );
  }

  /** حساب فاصل النبضة (ثلث مدة الانتهاء، بحد 1ث إلى 30ث) */
  _heartbeatInterval() {
    return Math.max(1_000, Math.min(30_000, Math.floor(this.staleAfterMs / 3)));
  }

  /** جدوِّل النبضة القادمة مع جيتر ±25% لتجنب الكتابة بنمط ثابت */
  _scheduleHeartbeat() {
    if (this._stopped) return;

    const base   = this._heartbeatInterval();
    const jitter = (Math.random() * 0.5 - 0.25) * base;
    const delay  = Math.max(500, Math.round(base + jitter));

    this._interval = setTimeout(() => {
      try { this._writeLock(); } catch { /* تجاهل */ }
      this._scheduleHeartbeat();
    }, delay);
  }
}

export default SingleSessionGuard;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-single-session-guard',
  meta: { category: 'safety', path: 'lib/safety/SingleSessionGuard.js' },
  setup(_ctx) {
    // provides: SingleSessionGuard (default)
  },
};
