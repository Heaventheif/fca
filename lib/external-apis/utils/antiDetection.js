function gaussianRandom(mean = 0, stdDev = 1) {
  let u1, u2;
  do {
    u1 = Math.random();
  } while (u1 === 0); 
  u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

export function randomDelay(min = 50, max = 200) {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; 
  const raw = gaussianRandom(mean, stdDev);
  const clamped = Math.max(min, Math.min(max, Math.round(raw)));
  return new Promise((resolve) => setTimeout(resolve, clamped));
}

export function calculateBurstJitter(burstSize = 1) {
  const burstPause = burstSize > 3 ? 8000 + Math.random() * 15000 : 2000 + Math.random() * 5000;
  return Math.round(burstPause);
}

export function calculateTypingTime(text) {
  if (!text) return 0;
  let total = 0;
  for (const char of String(text)) {
    
    const base = gaussianRandom(110, 20);
    const isPause = /[\s.,!?;:]/.test(char);
    total += Math.max(40, base) + (isPause ? gaussianRandom(200, 60) : 0);
  }
  
  return Math.min(Math.round(total), 12000);
}

export function calculateReadingTime(text) {
  if (!text) return 1000;
  const wordCount = text.trim().split(/\s+/).length;
  const wpm = gaussianRandom(220, 40); 
  const readMs = (wordCount / Math.max(1, wpm)) * 60000;
  
  const reactionTime = gaussianRandom(800, 200);
  return Math.min(Math.round(readMs + reactionTime), 8000);
}

export class RateLimiter {
  
  constructor(limit = 20, intervalMs = 60000) {
    this.limit = limit;
    this.interval = intervalMs;
    this.timestamps = [];
    this._consecutiveNearLimit = 0; 
  }

  
  canSendMessage() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.interval);
    const nearLimit = this.timestamps.length >= this.limit * 0.8;
    if (nearLimit) this._consecutiveNearLimit++;
    else this._consecutiveNearLimit = Math.max(0, this._consecutiveNearLimit - 1);
    return this.timestamps.length < this.limit;
  }

  recordMessage() {
    this.timestamps.push(Date.now());
  }

  
  getSuggestedDelay() {
    const base =
      this.timestamps.length > this.limit * 0.8
        ? 2000 + Math.random() * 3000
        : 500 + Math.random() * 500;
    const multiplier = Math.pow(1.5, Math.min(this._consecutiveNearLimit, 5));
    return Math.round(base * multiplier);
  }
}

const USER_AGENT_POOL = [
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.101 Safari/537.36',
  
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7312.56 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7465.89 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7635.102 Safari/537.36',
  
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7741.82 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7838.74 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7891.93 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
  
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7891.93 Safari/537.36 Edg/151.0.3892.61',
  
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
  
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
];

export function getRandomUserAgent() {
  return USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
}

export class BehaviorTracker {
  constructor() {
    this._lastMessages = new Map();
    // Randomized cleanup: base 5min ± 40% jitter to avoid predictable scheduling
    this._scheduleCleanup();
  }

  _scheduleCleanup() {
    const base = 5 * 60 * 1000;
    const jitter = (Math.random() * 0.8 - 0.4) * base; // ±40%
    const delay = Math.round(base + jitter);
    this._cleanupTimer = setTimeout(() => {
      this.cleanup();
      this._scheduleCleanup();
    }, delay);
    if (this._cleanupTimer?.unref) this._cleanupTimer.unref();
  }

  
  looksLikeSpam(threadID, message) {
    const entry = this._lastMessages.get(threadID);
    if (!entry) return false;
    const age = Date.now() - entry.time;
    
    if (entry.message === message && age < 10000) return true;
    
    if (entry.count >= 5 && age < 30000) return true;
    return false;
  }

  recordMessage(threadID, message) {
    const existing = this._lastMessages.get(threadID);
    this._lastMessages.set(threadID, {
      message,
      time: Date.now(),
      count: existing && Date.now() - existing.time < 30000 ? existing.count + 1 : 1,
    });
  }

  cleanup() {
    const cutoff = Date.now() - 3600000; 
    for (const [k, v] of this._lastMessages.entries()) {
      if (v.time < cutoff) this._lastMessages.delete(k);
    }
  }

  destroy() {
    clearTimeout(this._cleanupTimer);
    this._cleanupTimer = null;
    this._lastMessages.clear();
  }
}

export class ActivityScheduler {
  
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? false;
    this.sleepStart = opts.sleepStart ?? 0; 
    this.sleepEnd = opts.sleepEnd ?? 6; 
    this.timezoneOffset = opts.timezoneOffset ?? new Date().getTimezoneOffset() * -1;
  }

  
  isSleepTime() {
    if (!this.enabled) return false;
    const utcHour = new Date().getUTCHours();
    const localHour = (utcHour + Math.floor(this.timezoneOffset / 60) + 24) % 24;
    if (this.sleepStart < this.sleepEnd) {
      return localHour >= this.sleepStart && localHour < this.sleepEnd;
    }
    
    return localHour >= this.sleepStart || localHour < this.sleepEnd;
  }

  
  getTimeMultiplier() {
    return this.isSleepTime() ? 2.5 : 1;
  }

  
  getContextualDelay(baseMs) {
    const mult = this.getTimeMultiplier();
    const jitter = gaussianRandom(1.0, 0.15); 
    return Math.max(500, Math.round(baseMs * mult * Math.max(0.5, jitter)));
  }
}

export default {
  randomDelay,
  calculateBurstJitter,
  calculateTypingTime,
  calculateReadingTime,
  RateLimiter,
  getRandomUserAgent,
  BehaviorTracker,
  ActivityScheduler,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-utils-anti-detection',
  meta: { category: 'external-api-utils', path: 'lib/external-apis/utils/antiDetection.js' },
  setup(_ctx) {
    // provides: randomDelay, calculateBurstJitter, calculateTypingTime, calculateReadingTime, RateLimiter, getRandomUserAgent, BehaviorTracker, ActivityScheduler
  },
};
