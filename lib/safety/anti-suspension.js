import { EventEmitter } from 'node:events';
import logger from '../func/logger.js';

const WARNING_PHRASES = [
  
  { re: /temporarily restricted/i, level: 1 },
  { re: /action blocked/i, level: 1 },
  { re: /you can't use this feature right now/i, level: 1 },
  { re: /this action isn'?t available/i, level: 1 },
  { re: /you'?re doing this too often/i, level: 1 },
  { re: /try again later/i, level: 1 },
  { re: /something went wrong/i, level: 1 },
  { re: /request limit/i, level: 1 },
  { re: /rate.?limit/i, level: 1 },
  { re: /too many requests/i, level: 1 },
  // مستوى 2 — تحذير متوسط
  { re: /your account has been restricted/i, level: 2 },
  { re: /spam.{0,20}behavior/i, level: 2 },
  { re: /automated behavior/i, level: 2 },
  { re: /violat.{0,15}our policies/i, level: 2 },
  { re: /suspicious.{0,20}activity/i, level: 2 },
  { re: /account.{0,20}review/i, level: 2 },
  { re: /we noticed unusual activity/i, level: 2 },
  { re: /security check/i, level: 2 },
  { re: /XCheckpointFBScraping/i, level: 2 },
  { re: /601051028565049/, level: 2 },
  // مستوى 3 — خطر مرتفع
  { re: /account.*disabled/i, level: 3 },
  { re: /account.*suspended/i, level: 3 },
  { re: /account.*deactivated/i, level: 3 },
  { re: /violat.{0,15}community standards/i, level: 3 },
  { re: /1501092823525282/, level: 3 },
  { re: /828281030927956/, level: 3 },
  { re: /checkpoint.{0,30}required/i, level: 3 },
  { re: /verify your identity/i, level: 3 },
  { re: /confirm.*you'?re not a robot/i, level: 3 },
  { re: /not logged in/i, level: 3 },
  { re: /session.*expired/i, level: 3 },
  { re: /you have been logged out/i, level: 3 },
];

const BASE_DELAYS = { 1: 3_000, 2: 15_000, 3: 60_000 };

export class AntiSuspension extends EventEmitter {
  
  constructor(opts = {}) {
    super();
    this._maxL3 = opts.maxLevel3 ?? 3;
    this._decay = opts.decayAfterMs ?? 120_000;
    this._autoGate = opts.autoGate !== false;

    this._counts = { 1: 0, 2: 0, 3: 0 }; 
    this._lastDetect = 0;
    this._paused = false;
    this._pauseUntil = 0;
    this._stopped = false;
  }

  
  inspect(responseText) {
    if (!responseText || this._stopped) return;
    const text = typeof responseText === 'string' ? responseText : JSON.stringify(responseText);

    
    if (Date.now() - this._lastDetect > this._decay) {
      this._counts = { 1: 0, 2: 0, 3: 0 };
    }

    let maxLevel = 0;
    let matchedPhrase = null;

    for (const { re, level } of WARNING_PHRASES) {
      if (re.test(text)) {
        this._counts[level]++;
        if (level > maxLevel) {
          maxLevel = level;
          matchedPhrase = re.source;
        }
      }
    }

    if (maxLevel === 0) return;

    this._lastDetect = Date.now();
    const delay = BASE_DELAYS[maxLevel] * Math.min(this._counts[maxLevel], 5);

    logger(
      `[AntiSuspension] 🚨 مستوى ${maxLevel} — "${matchedPhrase}" — تأخير ${delay}ms`,
      maxLevel >= 2 ? 'error' : 'warn'
    );

    this.emit('warning', { phrase: matchedPhrase, level: maxLevel, delayMs: delay });

    if (maxLevel === 3 && this._counts[3] >= this._maxL3) {
      this._stopped = true;
      logger('[AntiSuspension] ⛔ تم إيقاف الإرسال — تجاوز حد المستوى الحرج', 'error');
      this.emit('suspended', { counts: { ...this._counts } });
      return;
    }

    this._pauseUntil = Date.now() + delay;
    this._paused = true;
  }

  
  async gate() {
    if (this._stopped) throw new Error('[AntiSuspension] الإرسال موقوف — الحساب في خطر.');
    if (!this._paused) return;
    const wait = this._pauseUntil - Date.now();
    if (wait <= 0) {
      this._paused = false;
      return;
    }
    logger(`[AntiSuspension] ⏳ انتظار ${Math.round(wait / 1000)}s قبل الإرسال...`, 'warn');
    await new Promise((r) => setTimeout(r, wait));
    this._paused = false;
  }

  
  isSafe() {
    return !this._stopped && !this._paused;
  }

  
  isStopped() {
    return this._stopped;
  }

  
  reset() {
    this._counts = { 1: 0, 2: 0, 3: 0 };
    this._paused = false;
    this._pauseUntil = 0;
    this._stopped = false;
    this._lastDetect = 0;
    logger('[AntiSuspension] ♻️ تم إعادة ضبط نظام الحماية', 'info');
  }

  getStats() {
    return {
      counts: { ...this._counts },
      paused: this._paused,
      pauseUntil: this._pauseUntil,
      stopped: this._stopped,
      lastDetect: this._lastDetect,
    };
  }
}

export default AntiSuspension;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-anti-suspension',
  meta: { category: 'safety', path: 'lib/safety/anti-suspension.js' },
  setup(_ctx) {
    // provides: AntiSuspension
  },
};
