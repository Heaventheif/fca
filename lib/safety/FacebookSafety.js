/**
 * FacebookSafety.js — Session safety, heartbeat, and anti-detection watchdog
 *
 * Audit fixes applied:
 *  - Replaced unbounded _timerRegistry Set with SafeTimerRegistry (fixes memory leak)
 *  - Each named recurring timer (refresh, recycle, heartbeat, poke, breath) now
 *    uses replace-semantics so only ONE handle per slot exists at any time
 *  - Removed _monitorInterval / _heartbeatInterval dual-track (now unified in registry)
 *  - DTSG safety store now uses atomic write (write to .tmp then rename)
 *  - _ghostChecking state flag resets properly after probe timeout
 *  - safetyStorePath permissions: 0o600 (owner-read/write only, was 0o384=0o600 already)
 *  - destroy() is idempotent (multiple calls safe)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { SafeTimerRegistry } from './SafeTimerRegistry.js';

export default class FacebookSafety {
  constructor(opts = {}) {
    this.options = {
      enableSafeHeaders: true,
      enableHumanBehavior: true,
      enableAntiDetection: true,
      enableAutoRefresh: true,
      enableLoginValidation: true,
      enableSafeDelays: true,
      bypassRegionLock: true,
      ultraLowBanMode: true,
      enableUAContinuity: true,
      ...opts,
    };

    this._fixedUA = null;
    this.safeUserAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7838.74 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    ];

    this.regions = ['ASH', 'ATL', 'DFW', 'ORD', 'PHX', 'SJC', 'IAD'];
    this.currentRegion = this.regions[Math.floor(Math.random() * this.regions.length)];

    this.humanDelayPatterns = {
      typing:       { min: 800,  max: 2500 },
      reading:      { min: 1500, max: 5000 },
      thinking:     { min: 1500, max: 6000 },
      browsing:     { min: 1000, max: 3000 },
      messageDelay: { min: 1500, max: 4000 },
    };

    this.sessionMetrics = {
      requestCount: 0,
      errorCount: 0,
      lastActivity: Date.now(),
      riskLevel: 'low',
    };

    // FIX: Use bounded SafeTimerRegistry instead of unbounded Set
    this._timers = new SafeTimerRegistry();

    this._lastEventTs = Date.now();
    this._reconnecting = false;
    this._activeListenerStop = null;
    this._backoff = { attempt: 0, next: 0 };
    this._destroyed = false;
    this._inFlightRefreshId = 0;
    this._probing = false;
    this._lastRefreshTs = 0;
    this._lastRecycleTs = 0;
    this._lastHeavyMaintenanceTs = 0;
    this._refreshing = false;
    this._minSpacingMs = 2700 * 1000;
    this._adaptivePacingWindowMs = 120 * 1000;
    this._postRefreshChecks = [];

    this.safetyStorePath = path.join(process.cwd(), '.fca-safety-store.json');
    this.ctx = null;
    this.api = null;
    this.onSafetyEvent = null;

    this._init();
  }

  _init() {
    if (this.options.enableAutoRefresh) this._setupSafeRefresh();
    this._loadFromSafetyStore();
    this._setupSessionMonitoring();
    this._schedulePeriodicRecycle();
    this._scheduleLightPoke();
    this._scheduleSessionBreath();
  }

  // ── USER AGENT ─────────────────────────────────────────────────────────────

  setFixedUserAgent(ua) {
    if (ua && typeof ua === 'string') this._fixedUA = ua;
  }

  getSafeUserAgent() {
    if (!this.options.enableUAContinuity) return this.safeUserAgents[0];
    if (!this._fixedUA) this._fixedUA = this.safeUserAgents[0];
    return this._fixedUA;
  }

  // ── HEADERS ────────────────────────────────────────────────────────────────

  applySafeHeaders(extra = {}) {
    const headers = {
      'User-Agent': this.getSafeUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Cache-Control': 'max-age=0',
      ...extra,
    };
    const region = (this.ctx && this.ctx.region) || (this.options.bypassRegionLock && this.currentRegion);
    if (region) headers['X-MSGR-Region'] = region;
    return headers;
  }

  // ── DELAYS ─────────────────────────────────────────────────────────────────

  getHumanDelay(type = 'browsing') {
    if (!this.options.enableSafeDelays) return 5000;
    const pat = this.humanDelayPatterns[type] ?? this.humanDelayPatterns.browsing;
    const base = Math.random() * (pat.max - pat.min) + pat.min;
    const noise = Math.random() * 2000;
    const risk = this.sessionMetrics.riskLevel === 'high' ? 2.5
                : this.sessionMetrics.riskLevel === 'medium' ? 1.8 : 1.3;
    return Math.max(3000, Math.floor((base + noise) * risk));
  }

  computeAdaptiveSendDelay() {
    const r = this.sessionMetrics.riskLevel;
    const recentHeavy = Date.now() - this._lastHeavyMaintenanceTs < this._adaptivePacingWindowMs;
    const [lo, hi] = r === 'high'   ? [3500, 6500]
                   : r === 'medium' ? [2000, 4500]
                   : recentHeavy   ? [1500, 3000]
                                   : [1000, 2500];
    return Math.floor(lo + Math.random() * (hi - lo));
  }

  applyAdaptiveSendDelay() {
    return new Promise(resolve => setTimeout(resolve, this.computeAdaptiveSendDelay()));
  }

  // ── VALIDATION ─────────────────────────────────────────────────────────────

  validateLogin(appState) {
    try {
      if (!appState) return { safe: false, reason: 'No appState' };
      const arr = typeof appState === 'string' ? JSON.parse(appState) : appState;
      if (!arr.length) return { safe: false, reason: 'Empty appState' };
      const required = ['c_user', 'xs', 'datr', 'sb'];
      const keys = arr.map(c => c.name ?? c.key);
      const hasEssential = required.some(k => keys.includes(k));
      return hasEssential
        ? { safe: true, reason: 'Validated' }
        : { safe: false, reason: 'Missing essential cookies' };
    } catch (e) {
      return { safe: false, reason: e.message };
    }
  }

  checkErrorSafety(err) {
    const danger = ['checkpoint', 'verification_required', 'account_locked',
      'temporarily_blocked', 'unusual_activity', 'security_check',
      'login_approval', 'account_suspended'];
    const msg = (err?.message ?? String(err)).toLowerCase();
    const found = danger.find(d => msg.includes(d));
    return found
      ? { safe: false, danger: found, recommendation: 'Stop all operations immediately' }
      : { safe: true, danger: null };
  }

  // ── SESSION METRICS ────────────────────────────────────────────────────────

  recordRequest(isError = false) {
    this.sessionMetrics.requestCount++;
    this.sessionMetrics.lastActivity = Date.now();
    if (isError) this.sessionMetrics.errorCount++;
    this._lastEventTs = Date.now();
  }

  recordEvent() { this._lastEventTs = Date.now(); }

  // ── RISK LEVEL ─────────────────────────────────────────────────────────────

  _setupSessionMonitoring() {
    const h = setInterval(() => this._updateRiskLevel(), 60000);
    if (h?.unref) h.unref();
    // FIX: use named slot so re-scheduling replaces old handle
    this._timers.set('riskMonitor', h, 'interval');
  }

  _updateRiskLevel() {
    const rate = this.sessionMetrics.errorCount / Math.max(1, this.sessionMetrics.requestCount);
    const level = rate > 0.3 ? 'high' : rate > 0.1 ? 'medium' : 'low';
    if (level !== this.sessionMetrics.riskLevel) {
      this.sessionMetrics.riskLevel = level;
      this._onRiskLevelChanged(level);
    }
  }

  _onRiskLevelChanged(level) {
    this._minSpacingMs = level === 'high' ? 1800000 : 2700000;
    this._safetyEmit('riskLevelChanged', { risk: level });
  }

  // ── AUTO REFRESH ───────────────────────────────────────────────────────────

  _setupSafeRefresh() {
    const schedule = () => {
      if (this._destroyed) return;
      const r = this.sessionMetrics.riskLevel;
      const [lo, hi] = r === 'high'   ? [7200000, 10800000]
                     : r === 'medium' ? [5400000, 9000000]
                                      : [3000000, 5400000];
      const delay = lo + Math.random() * (hi - lo);
      const h = setTimeout(async () => {
        await this.refreshSafeSession();
        schedule(); // FIX: re-register under same name so old handle is evicted
      }, delay);
      if (h?.unref) h.unref();
      // FIX: named slot — replaces previous handle automatically
      this._timers.set('safeRefresh', h, 'timeout');
    };
    schedule();
  }

  async refreshSafeSession() {
    if (this._refreshing) return;
    if (Date.now() - this._lastRefreshTs < this._minSpacingMs / 2) return;
    this._refreshing = true;
    const id = ++this._inFlightRefreshId;
    try {
      if (!this.api || typeof this.api.refreshFb_dtsg !== 'function') return;
      await this.api.refreshFb_dtsg();
      this._saveToSafetyStore();
      this.sessionMetrics.lastActivity = Date.now();
      this._lastRefreshTs = Date.now();
      this._markHeavyMaintenance();
      this._safetyEmit('safeRefresh', { ok: true });
      await this._ensureMqttAlive();

      // Post-refresh health checks at 1s, 10s, 30s
      for (const ms of [1000, 10000, 30000]) {
        const h = setTimeout(() => {
          if (!this._destroyed && id === this._inFlightRefreshId) this._ensureMqttAlive();
        }, ms);
        if (h?.unref) h.unref();
        this._timers.add(h); // anonymous one-shot — ring-buffer bounded
      }
    } catch (e) {
      this.recordRequest(true);
      this._safetyEmit('safeRefresh', { ok: false, error: e?.message });
      this._backoff.attempt = 0;
      await this._ensureMqttAlive();
    } finally {
      this._refreshing = false;
    }
  }

  // ── MQTT HEALTH ────────────────────────────────────────────────────────────

  async _ensureMqttAlive() {
    if (!this.api || this._destroyed) return;
    try {
      const disconnected = !this.ctx?.mqttClient?.connected;
      const staleMs = Date.now() - this._lastEventTs;
      if (disconnected || staleMs > 480000) {
        await this._reconnectMqttWithBackoff(disconnected ? 'disconnected' : 'hard-stale');
        return;
      }
      // Soft-stale probe: send a ping and give 7s to see if events resume
      if (staleMs > 150000 && !this._probing) {
        this._probing = true;
        const snapshotTs = this._lastEventTs;
        try { this.ctx.mqttClient?.ping?.(); } catch { /* ignore */ }
        const h = setTimeout(() => {
          this._probing = false;
          if (!this._destroyed && this._lastEventTs <= snapshotTs) {
            this._backoff.attempt = 0;
            this._reconnectMqttWithBackoff('soft-stale');
          }
        }, 7000);
        if (h?.unref) h.unref();
        this._timers.add(h);
      }
    } catch { /* safety watchdog must not throw */ }
  }

  async _reconnectMqttWithBackoff(reason) {
    if (this._reconnecting || this._destroyed) return;
    this._reconnecting = true;
    try {
      const now = Date.now();
      if (now < this._backoff.next) return;

      const attempt = ++this._backoff.attempt;
      const base = this.sessionMetrics.riskLevel === 'high' ? 900 : 1500;
      const delay = Math.min(25000, base * Math.pow(1.9, Math.min(attempt, 6))) + Math.random() * 600;
      this._backoff.next = now + delay;

      await new Promise(r => setTimeout(r, delay));

      if (this._activeListenerStop) {
        try { this._activeListenerStop(); } catch { /* ignore */ }
        this._activeListenerStop = null;
      }

      if (this.api && typeof this.api.listenMqtt === 'function' && !this._destroyed) {
        const stop = this.api.listenMqtt((err, msg) => {
          if (!err && msg) this.recordEvent();
        });
        this._activeListenerStop = stop;
        this._markHeavyMaintenance();
        this._safetyEmit('mqttReconnect', { success: true, reason, attempt });
      }

      // Reset backoff counter after 5s if connected
      const h = setTimeout(() => {
        if (this.ctx?.mqttClient?.connected) this._backoff.attempt = 0;
      }, 5000);
      if (h?.unref) h.unref();
      this._timers.add(h);
    } catch (e) {
      this._safetyEmit('mqttReconnect', { success: false, error: e?.message, reason });
    } finally {
      this._reconnecting = false;
    }
  }

  forceReconnect(reason = 'manual') {
    if (this._destroyed) return;
    this._backoff.attempt = 0;
    return this._reconnectMqttWithBackoff(`force-${reason}`);
  }

  // ── PERIODIC TIMERS ────────────────────────────────────────────────────────

  _schedulePeriodicRecycle() {
    if (this._destroyed) return;
    const delay = 21600000 + (Math.random() * 60 - 30) * 60000; // ~6h ± 30min
    const h = setTimeout(() => {
      if (this._destroyed) return;
      if (Date.now() - this._lastRefreshTs < this._minSpacingMs) {
        // Too soon — defer by 20min
        const defer = setTimeout(() => this._schedulePeriodicRecycle(), 1200000 + Math.random() * 600000);
        if (defer?.unref) defer.unref();
        this._timers.set('recycleDeferral', defer);
        return;
      }
      this._lastRecycleTs = Date.now();
      this.forceReconnect('periodic');
      this._schedulePeriodicRecycle(); // re-arm; named slot evicts old handle
    }, delay);
    if (h?.unref) h.unref();
    // FIX: named slot — only ever ONE recycle timer active
    this._timers.set('periodicRecycle', h);
  }

  _scheduleLightPoke() {
    if (this._destroyed) return;
    const delay = 1800000 + (Math.random() * 20 - 10) * 60000; // ~30min ± 10min
    const h = setTimeout(async () => {
      if (this._destroyed) return;
      if (Date.now() - this._lastRefreshTs >= this._minSpacingMs / 2) {
        try {
          if (this.api && typeof this.api.refreshFb_dtsg === 'function') {
            await this.api.refreshFb_dtsg().catch(() => { /* best-effort */ });
            this._lastRefreshTs = Date.now();
            this._safetyEmit('lightPoke', { ts: Date.now() });
          }
        } catch { /* ignore */ }
      }
      this._scheduleLightPoke(); // re-arm; named slot evicts old handle
    }, delay);
    if (h?.unref) h.unref();
    // FIX: named slot
    this._timers.set('lightPoke', h);
  }

  _scheduleSessionBreath() {
    if (this._destroyed) return;
    const delay = 1200000 + Math.random() * 300000; // 20–25min
    const h = setTimeout(() => {
      if (!this._destroyed) {
        this._safetyEmit('sessionBreath', { ts: Date.now() });
        this._scheduleSessionBreath();
      }
    }, delay);
    if (h?.unref) h.unref();
    // FIX: named slot
    this._timers.set('sessionBreath', h);
  }

  // ── MONITORING ─────────────────────────────────────────────────────────────

  startMonitoring(ctx, api) {
    if (!ctx || !api) return;
    this.ctx = ctx;
    this.api = api;

    // Cookie health check every 30s
    const monH = setInterval(() => {
      try {
        const cookies = this.ctx?.jar?.getCookiesSync?.('https://www.facebook.com') ?? [];
        if (!cookies.find(c => c.key === 'c_user')) {
          this._safetyEmit('accountIssue', { type: 'session_expired', message: 'c_user cookie missing' });
        }
      } catch { /* ignore */ }
    }, 30000);
    if (monH?.unref) monH.unref();
    // FIX: named slot (replaces any previous monitor interval)
    this._timers.set('cookieMonitor', monH, 'interval');

    this.recordEvent();
    this._startDynamicHeartbeat();
  }

  _startDynamicHeartbeat() {
    const r = this.sessionMetrics.riskLevel;
    const base = r === 'high' ? 55000 : 80000;
    const interval = base + Math.random() * 20000;

    const h = setInterval(() => {
      if (this._destroyed) return;
      try {
        if (this.ctx?.mqttClient?.connected) this.ctx.mqttClient.ping?.();
      } catch { /* ignore */ }
      const stale = Date.now() - this._lastEventTs;
      const threshold = r === 'high' ? 480000 : 720000;
      if (stale > threshold) {
        this._backoff.attempt = 0;
        this._ensureMqttAlive();
      }
    }, interval);
    if (h?.unref) h.unref();
    // FIX: named slot (replaces previous heartbeat if risk level changed)
    this._timers.set('heartbeat', h, 'interval');
  }

  // ── SAFETY STORE (DTSG persistence) ───────────────────────────────────────

  _saveToSafetyStore() {
    if (!this.ctx?.fb_dtsg) return;
    try {
      const data = JSON.stringify({
        fb_dtsg: this.ctx.fb_dtsg,
        jazoest: this.ctx.jazoest,
        updatedAt: new Date().toISOString(),
      }, null, 2);
      const dir = path.dirname(this.safetyStorePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      // FIX: atomic write — write to temp file then rename (prevents partial reads)
      const tmp = `${this.safetyStorePath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.safetyStorePath);
    } catch { /* non-fatal */ }
  }

  _loadFromSafetyStore() {
    try {
      if (!fs.existsSync(this.safetyStorePath)) return;
      const stored = JSON.parse(fs.readFileSync(this.safetyStorePath, 'utf8'));
      if (stored.fb_dtsg && this.ctx && !this.ctx.fb_dtsg) {
        this.ctx.fb_dtsg = stored.fb_dtsg;
        this.ctx.jazoest = stored.jazoest;
      }
    } catch { /* corrupt or missing — ignore */ }
  }

  // ── UTILITIES ──────────────────────────────────────────────────────────────

  _markHeavyMaintenance() { this._lastHeavyMaintenanceTs = Date.now(); }

  _safetyEmit(event, data) {
    if (typeof this.onSafetyEvent === 'function') {
      try { this.onSafetyEvent(event, data); } catch { /* handler must not crash watchdog */ }
    }
  }

  setSafetyEventHandler(fn) { this.onSafetyEvent = fn; }

  getSafetyRecommendations() {
    const recs = [];
    if (this.sessionMetrics.riskLevel === 'high') {
      recs.push('Reduce request frequency', 'Add longer delays between messages');
    }
    if (this.sessionMetrics.errorCount > 5) {
      recs.push('Check account manually in browser', 'Consider using a fresh appState');
    }
    return recs;
  }

  // FIX: destroy() is now idempotent — safe to call multiple times
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    // Cancel all pending post-refresh checks
    this._postRefreshChecks.forEach(h => clearTimeout(h));
    this._postRefreshChecks = [];

    // Stop active MQTT listener
    if (this._activeListenerStop) {
      try { this._activeListenerStop(); } catch { /* ignore */ }
      this._activeListenerStop = null;
    }

    // Destroy the timer registry — clears ALL named and anonymous timers
    this._timers.destroy();
  }
}
