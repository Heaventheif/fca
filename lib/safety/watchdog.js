/**
 * watchdog.js — كلب حراسة الجلسة.
 *
 * المهام:
 *  1. مراقبة الصمت (silence) — إعادة الاتصال عند انعدام نبضات القلب
 *  2. تجديد fb_dtsg دورياً — للحفاظ على صلاحية الجلسة
 *
 * التوقيت عشوائي (Poisson / log-normal) لمحاكاة السلوك البشري
 * وتجنب الأنماط الثابتة القابلة للكشف.
 */
import { nextPoisson, nextLogNormal, createSessionSeed } from '../utils/human-timing.js';

/** قيم افتراضية مركزية */
const DEFAULTS = Object.freeze({
  checkIntervalMs:  60_000,     // متوسط فاصل فحص الصمت
  silenceMs:        300_000,    // 5 دقائق قبل اعتبار الجلسة صامتة
  dtsgMedianMs:     43_200_000, // 12 ساعة متوسط تجديد dtsg
  maxDtsgFailures:  3,
  cooldownMinMs:    120_000,    // أقل فترة ترقُّب بعد الصمت
  cooldownMaxMs:    360_000,    // أقصى فترة ترقُّب
  cooldownMeanMs:   180_000,
});

export class Watchdog {
  /**
   * @param {object}    [opts]
   * @param {object}    [opts.ctx]              - سياق الجلسة
   * @param {object}    [opts.api]              - كائن API (للتجديد)
   * @param {Function}  [opts.logger]           - (msg, level) => void
   * @param {Function}  [opts.onSilence]        - (silencedMs) => void
   * @param {number}    [opts.checkIntervalMs]  - متوسط فاصل الفحص بالمللي ثانية
   * @param {number}    [opts.silenceMs]        - عتبة الصمت بالمللي ثانية
   * @param {number}    [opts.dtsgIntervalMs]   - متوسط فاصل تجديد dtsg
   * @param {number}    [opts.maxDtsgFailures]  - أقصى فشل متتالي قبل التحذير
   */
  constructor(opts = {}) {
    this._ctx  = opts.ctx;
    this._api  = opts.api;
    this._log  = opts.logger    ?? (() => {});
    this._onSilence = opts.onSilence ?? (() => {});

    // معامل تشويش عشوائي لجعل التوقيت فريداً لكل جلسة
    this._seed = createSessionSeed();

    this._checkMeanMs     = opts.checkIntervalMs ?? DEFAULTS.checkIntervalMs;
    this._silenceMs       = (opts.silenceMs ?? DEFAULTS.silenceMs) * this._seed.offsetFactor;
    this._dtsgMedianMs    = opts.dtsgIntervalMs  ?? DEFAULTS.dtsgMedianMs;
    this._maxDtsgFailures = opts.maxDtsgFailures ?? DEFAULTS.maxDtsgFailures;

    // حالة داخلية
    this._lastHeartbeat    = Date.now();
    this._checkTimer       = null;
    this._dtsgTimer        = null;
    this._dtsgFailures     = 0;
    this._silenceTriggered = false;
    this._reconnectCooldown = false;
    this._destroyed        = false;
  }

  // ── واجهة عامة ────────────────────────────────────────────────

  /** سجِّل نبضة قلب — يُعاد ضبط عداد الصمت */
  heartbeat() {
    this._lastHeartbeat    = Date.now();
    this._silenceTriggered = false;
  }

  /** ابدأ المراقبة */
  start() {
    if (this._destroyed) return this;
    this._scheduleCheck();
    this._scheduleDtsgRefresh();
    this._log('Watchdog: بدء المراقبة', 'info');
    return this;
  }

  /** أوقف المراقبة وحرِّر المؤقتات */
  stop() {
    this._destroyed = true;
    this._clearTimer('_checkTimer');
    this._clearTimer('_dtsgTimer');
    this._log('Watchdog: توقف', 'info');
  }

  // ── جدولة فحص الصمت ──────────────────────────────────────────

  _scheduleCheck() {
    if (this._destroyed) return;

    // ضاعف الفاصل أثناء التبريد لتخفيف الضغط
    const multiplier = this._reconnectCooldown ? 2 + Math.random() * 2 : 1;
    const wait       = nextPoisson(
      this._checkMeanMs * multiplier,
      15_000,
      this._checkMeanMs * 6
    );

    this._checkTimer = setTimeout(() => {
      this._checkTimer = null;
      this._runSilenceCheck();
      this._scheduleCheck();
    }, wait);

    this._checkTimer?.unref?.();
  }

  _runSilenceCheck() {
    if (this._reconnectCooldown) return; // لا تُطلق أثناء التبريد

    const silencedMs = Date.now() - this._lastHeartbeat;
    if (silencedMs < this._silenceMs || this._silenceTriggered) return;

    this._silenceTriggered = true;
    const mins = Math.round(silencedMs / 60_000);
    this._log(`Watchdog: صمت ${mins} دقيقة — طلب إعادة اتصال`, 'warn');

    try { this._onSilence(silencedMs); } catch { /* لا نسمح لـ callback بتعطيل الحراسة */ }

    // فترة تبريد عشوائية قبل السماح بفحص جديد
    this._reconnectCooldown = true;
    const cooldown = nextPoisson(
      DEFAULTS.cooldownMeanMs,
      DEFAULTS.cooldownMinMs,
      DEFAULTS.cooldownMaxMs
    );
    setTimeout(() => {
      this._reconnectCooldown = false;
      this._silenceTriggered  = false;
    }, cooldown).unref?.();
  }

  // ── جدولة تجديد dtsg ──────────────────────────────────────────

  _scheduleDtsgRefresh() {
    if (this._destroyed) return;

    // توزيع log-normal لتشويش التوقيت
    const wait = nextLogNormal(this._dtsgMedianMs, 0.45);

    this._dtsgTimer = setTimeout(async () => {
      this._dtsgTimer = null;
      await this._runDtsgRefresh();
      this._scheduleDtsgRefresh();
    }, wait);

    this._dtsgTimer?.unref?.();
  }

  async _runDtsgRefresh() {
    if (typeof this._api?.refreshFb_dtsg !== 'function') return;

    try {
      await this._api.refreshFb_dtsg();
      this._dtsgFailures = 0;
      this._log('Watchdog: fb_dtsg جُدِّد', 'info');
    } catch (err) {
      this._dtsgFailures++;
      const msg = err?.message ?? String(err);
      this._log(`Watchdog: فشل fb_dtsg (${this._dtsgFailures}): ${msg}`, 'warn');

      if (this._dtsgFailures >= this._maxDtsgFailures) {
        this._log('Watchdog: الجلسة قد تكون منتهية', 'error');
      }
    }
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /** @param {'_checkTimer'|'_dtsgTimer'} key */
  _clearTimer(key) {
    if (this[key]) {
      clearTimeout(this[key]);
      this[key] = null;
    }
  }
}

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof Watchdog>[0]} opts
 */
export function createWatchdog(opts) {
  return new Watchdog(opts);
}

export default { Watchdog, createWatchdog };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-watchdog',
  meta: { category: 'safety', path: 'lib/safety/watchdog.js' },
  setup(_ctx) {
    // provides: Watchdog, createWatchdog
  },
};
