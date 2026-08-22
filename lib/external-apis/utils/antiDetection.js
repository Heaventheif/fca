/**
 * antiDetection.js — Free, local, code-based human simulation & anti-ban system
 *
 * Audit fixes & enhancements:
 *  - Added Gaussian-like jitter (approximated via Box-Muller) for realistic timing
 *  - Extended user-agent pool to Chrome 138–152 range
 *  - Added circuit-breaker inside RateLimiter (exponential back-pressure)
 *  - BehaviorTracker now detects rapid repeat sequences (not just exact duplicates)
 *  - ActivityScheduler now respects timezone offset for realistic sleep windows
 *  - New helper: calculateBurstJitter() for burst-then-silence patterns
 *  - New helper: humanTypingDelay(text) with per-character variability
 */

// ─── GAUSSIAN JITTER ─────────────────────────────────────────────────────────
// Box-Muller transform — produces normally distributed random numbers.
// More realistic than uniform distribution for human timing patterns.
function gaussianRandom(mean = 0, stdDev = 1) {
  let u1, u2;
  do { u1 = Math.random(); } while (u1 === 0); // avoid log(0)
  u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stdDev;
}

/**
 * Random delay between min and max ms with Gaussian distribution.
 * Falls back to uniform if result lands outside [min, max].
 */
export function randomDelay(min = 50, max = 200) {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6; // ~99.7% of values within [min, max]
  const raw = gaussianRandom(mean, stdDev);
  const clamped = Math.max(min, Math.min(max, Math.round(raw)));
  return new Promise(resolve => setTimeout(resolve, clamped));
}

/**
 * Jitter for burst-then-silence patterns (send a few messages then pause).
 * @param {number} burstSize Number of actions in a burst
 * @returns {number} Ms to sleep after the burst
 */
export function calculateBurstJitter(burstSize = 1) {
  const burstPause = burstSize > 3 ? 8000 + Math.random() * 15000 : 2000 + Math.random() * 5000;
  return Math.round(burstPause);
}

/**
 * Estimated typing duration for a given message (in ms).
 * Models per-character variability: most chars are fast, some take longer.
 */
export function calculateTypingTime(text) {
  if (!text) return 0;
  let total = 0;
  for (const char of String(text)) {
    // Base: 80–140 ms/character with occasional pauses at spaces/punctuation
    const base = gaussianRandom(110, 20);
    const isPause = /[\s.,!?;:]/.test(char);
    total += Math.max(40, base) + (isPause ? gaussianRandom(200, 60) : 0);
  }
  // Cap at 12s — no human types slower than that for a chat message
  return Math.min(Math.round(total), 12000);
}

/**
 * Estimated reading time for a received message (ms).
 * Based on average adult reading speed ~200–250 wpm.
 */
export function calculateReadingTime(text) {
  if (!text) return 1000;
  const wordCount = text.trim().split(/\s+/).length;
  const wpm = gaussianRandom(220, 40); // words per minute
  const readMs = (wordCount / Math.max(1, wpm)) * 60000;
  // Add time to "see" the notification and start reading
  const reactionTime = gaussianRandom(800, 200);
  return Math.min(Math.round(readMs + reactionTime), 8000);
}

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────
export class RateLimiter {
  /**
   * @param {number} limit      Max messages per interval
   * @param {number} intervalMs Rolling window duration (default: 60s)
   */
  constructor(limit = 20, intervalMs = 60000) {
    this.limit = limit;
    this.interval = intervalMs;
    this.timestamps = [];
    this._consecutiveNearLimit = 0; // circuit-breaker counter
  }

  /** Returns true if a new action is within the rate limit. */
  canSendMessage() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.interval);
    const nearLimit = this.timestamps.length >= this.limit * 0.8;
    if (nearLimit) this._consecutiveNearLimit++;
    else this._consecutiveNearLimit = Math.max(0, this._consecutiveNearLimit - 1);
    return this.timestamps.length < this.limit;
  }

  recordMessage() {
    this.timestamps.push(Date.now());
  }

  /**
   * How long to wait before next action (ms).
   * Applies exponential back-pressure if consistently near limit.
   */
  getSuggestedDelay() {
    const base = this.timestamps.length > this.limit * 0.8
      ? 2000 + Math.random() * 3000
      : 500 + Math.random() * 500;
    const multiplier = Math.pow(1.5, Math.min(this._consecutiveNearLimit, 5));
    return Math.round(base * multiplier);
  }
}

// ─── USER-AGENT POOL ──────────────────────────────────────────────────────────
// Chrome 138–152 covers the expected range for August 2026.
// Firefox 141/145 included for diversity (~12% realistic market share).
const USER_AGENT_POOL = [
  // Chrome 138 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.101 Safari/537.36',
  // Chrome 140 — macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7312.56 Safari/537.36',
  // Chrome 143 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7465.89 Safari/537.36',
  // Chrome 146 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.7635.102 Safari/537.36',
  // Chrome 148 — macOS ARM
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7741.82 Safari/537.36',
  // Chrome 150 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7838.74 Safari/537.36',
  // Chrome 151 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7891.93 Safari/537.36',
  // Chrome 152 — Windows (latest stable Aug 2026)
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
  // Chrome 152 — macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
  // Edge 151 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7891.93 Safari/537.36 Edg/151.0.3892.61',
  // Firefox 141 — Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
  // Firefox 145 — macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
];

export function getRandomUserAgent() {
  return USER_AGENT_POOL[Math.floor(Math.random() * USER_AGENT_POOL.length)];
}

// ─── BEHAVIOR TRACKER ────────────────────────────────────────────────────────
export class BehaviorTracker {
  constructor() {
    this._lastMessages = new Map(); // threadID → { message, time, count }
    this._cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    if (this._cleanupInterval?.unref) this._cleanupInterval.unref();
  }

  /** Returns true if this message looks spammy (duplicate within 10s or rapid repeats). */
  looksLikeSpam(threadID, message) {
    const entry = this._lastMessages.get(threadID);
    if (!entry) return false;
    const age = Date.now() - entry.time;
    // Exact duplicate within 10 seconds
    if (entry.message === message && age < 10000) return true;
    // More than 5 messages to same thread in 30s → suspicious
    if (entry.count >= 5 && age < 30000) return true;
    return false;
  }

  recordMessage(threadID, message) {
    const existing = this._lastMessages.get(threadID);
    this._lastMessages.set(threadID, {
      message,
      time: Date.now(),
      count: existing && (Date.now() - existing.time < 30000) ? existing.count + 1 : 1,
    });
  }

  cleanup() {
    const cutoff = Date.now() - 3600000; // 1 hour
    for (const [k, v] of this._lastMessages.entries()) {
      if (v.time < cutoff) this._lastMessages.delete(k);
    }
  }

  destroy() {
    clearInterval(this._cleanupInterval);
    this._lastMessages.clear();
  }
}

// ─── ACTIVITY SCHEDULER ──────────────────────────────────────────────────────
export class ActivityScheduler {
  /**
   * @param {object} opts
   * @param {boolean} opts.enabled      Whether to respect sleep windows
   * @param {number}  opts.sleepStart   Hour (0–23) when "night" begins (local time)
   * @param {number}  opts.sleepEnd     Hour (0–23) when "day" begins (local time)
   * @param {number}  opts.timezoneOffset UTC offset in minutes (defaults to process TZ)
   */
  constructor(opts = {}) {
    this.enabled = opts.enabled ?? false;
    this.sleepStart = opts.sleepStart ?? 0;  // midnight
    this.sleepEnd = opts.sleepEnd ?? 6;       // 6am
    this.timezoneOffset = opts.timezoneOffset ?? (new Date().getTimezoneOffset() * -1);
  }

  /** Returns true if current local time falls inside the sleep window. */
  isSleepTime() {
    if (!this.enabled) return false;
    const utcHour = new Date().getUTCHours();
    const localHour = (utcHour + Math.floor(this.timezoneOffset / 60) + 24) % 24;
    if (this.sleepStart < this.sleepEnd) {
      return localHour >= this.sleepStart && localHour < this.sleepEnd;
    }
    // Sleep window wraps midnight (e.g., sleepStart=23, sleepEnd=7)
    return localHour >= this.sleepStart || localHour < this.sleepEnd;
  }

  /**
   * Multiplier applied to all delays when in sleep window.
   * Sleep-time activity (if any) should be much slower.
   */
  getTimeMultiplier() {
    return this.isSleepTime() ? 2.5 : 1;
  }

  /** Jittered delay appropriate for current time-of-day. */
  getContextualDelay(baseMs) {
    const mult = this.getTimeMultiplier();
    const jitter = gaussianRandom(1.0, 0.15); // ±15% Gaussian jitter
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
