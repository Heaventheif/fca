import fs from 'node:fs';
import path from 'node:path';
import logger from '../func/logger.js';
import { nextLogNormal, circadianWeight, createSessionSeed } from '../utils/human-timing.js';

export class StealthMode {
  constructor(opts = {}) {
    this._seed = createSessionSeed();

    
    this._baseMaxRPM = opts.maxRequestsPerMinute ?? 15;
    this._baseDailyLim = opts.dailyRequestLimit ?? 1_200;
    this._utcOffset = opts.utcOffsetHours ?? this._seed.utcOffsetHours;

    
    
    
    
    
    
    
    this._statePath = opts.statePath ? path.resolve(opts.statePath) : null;

    const restored = this._loadState();

    if (restored && restored.day === this._today()) {
      this._maxRPM = restored.maxRPM;
      this._dailyLim = restored.dailyLim;
      this._dailyCount = restored.dailyCount;
      this._lastDayRefresh = restored.day;
    } else {
      
      this._refreshDailyLimits();
      this._lastDayRefresh = this._today();
    }

    
    this._history = []; 
    this._burstBuffer = []; 
    this._pausing = false;
    this._pauseEndAt = 0;

    this.minPauseMs = (opts.minPauseMinutes ?? 1) * 60_000;
    this.maxPauseMs = (opts.maxPauseMinutes ?? 5) * 60_000;
  }

  _loadState() {
    if (!this._statePath) return null;
    try {
      if (!fs.existsSync(this._statePath)) return null;
      return JSON.parse(fs.readFileSync(this._statePath, 'utf8'));
    } catch {
      return null; 
    }
  }

  _saveState() {
    if (!this._statePath) return;
    try {
      const dir = path.dirname(this._statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        this._statePath,
        JSON.stringify({
          day: this._lastDayRefresh,
          maxRPM: this._maxRPM,
          dailyLim: this._dailyLim,
          dailyCount: this._dailyCount,
        }),
        { encoding: 'utf8', mode: 0o600 }
      );
    } catch {
      
    }
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  
  _refreshDailyLimits() {
    const factor = 0.85 + Math.random() * 0.3; 
    this._maxRPM = Math.round(this._baseMaxRPM * factor * this._seed.offsetFactor);
    this._dailyLim = Math.round(this._baseDailyLim * factor);
    this._dailyCount = 0;
    this._saveState();
  }

  _checkDayRollover() {
    const today = this._today();
    if (today !== this._lastDayRefresh) {
      this._refreshDailyLimits();
      this._lastDayRefresh = today;
      this._saveState();
    }
  }

  
  canProceed() {
    this._checkDayRollover();

    const now = Date.now();

    
    if (this._pausing && now < this._pauseEndAt) {
      return { canProceed: false, reason: 'paused', waitMs: this._pauseEndAt - now };
    }
    if (this._pausing) this._pausing = false;

    
    this._history = this._history.filter((t) => now - t < 60_000);
    this._burstBuffer = this._burstBuffer.filter((t) => now - t < 5_000);

    
    if (this._dailyCount >= this._dailyLim) {
      return { canProceed: false, reason: 'daily_limit', waitMs: this._msUntilMidnight() };
    }

    
    if (this._history.length >= this._maxRPM) {
      const waitMs = 60_000 - (now - this._history[0]);
      return { canProceed: false, reason: 'rate_limit', waitMs: Math.max(0, waitMs) };
    }

    
    if (this._burstBuffer.length >= 4) {
      const burstWait = nextLogNormal(3_000, 0.5); 
      return { canProceed: false, reason: 'burst_protection', waitMs: burstWait };
    }

    
    
    
    const w = circadianWeight(this._utcOffset);
    const pauseProb = 0.03 + (1 - w) * 0.12; 

    if (Math.random() < pauseProb) {
      
      const median = (this.minPauseMs + this.maxPauseMs) / 2;
      const pauseMs = Math.max(
        this.minPauseMs,
        Math.min(this.maxPauseMs, nextLogNormal(median, 0.5))
      );
      this._pausing = true;
      this._pauseEndAt = now + pauseMs;
      return { canProceed: false, reason: 'human_pause', waitMs: pauseMs };
    }

    return { canProceed: true };
  }

  
  recordRequest() {
    const now = Date.now();
    this._history.push(now);
    this._burstBuffer.push(now);
    this._dailyCount++;
    this._saveState();
  }

  
  async waitIfNeeded(maxWaitMs = 30_000) {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const { canProceed, reason, waitMs } = this.canProceed();
      if (canProceed) return { ok: true };

      const remaining = maxWaitMs - (Date.now() - start);
      if (typeof waitMs === 'number' && waitMs > remaining) {
        
        
        
        logger(
          `StealthMode: waitIfNeeded timed out (reason=${reason}, needs ${waitMs}ms, budget ${maxWaitMs}ms)`,
          'warn'
        );
        return { ok: false, reason, waitMs };
      }
      await _sleep(Math.min(waitMs ?? 500, 2_000));
    }
    return { ok: false, reason: 'timeout', waitMs: maxWaitMs };
  }

  getStats() {
    this._checkDayRollover();
    return {
      requestsThisMinute: this._history.filter((t) => Date.now() - t < 60_000).length,
      maxPerMinute: this._maxRPM,
      dailyCount: this._dailyCount,
      dailyLimit: this._dailyLim,
      isPaused: this._pausing,
      circadianWeight: circadianWeight(this._utcOffset).toFixed(2),
    };
  }

  _msUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return midnight - now;
  }
}

export function createStealthMode(opts) {
  return new StealthMode(opts);
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default { StealthMode, createStealthMode };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-stealth-mode',
  meta: { category: 'safety', path: 'lib/safety/StealthMode.js' },
  setup(_ctx) {
    // provides: StealthMode, createStealthMode
  },
};
