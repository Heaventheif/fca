import { SafeTimerRegistry } from './SafeTimerRegistry.js';
import {
  nextPoisson,
  nextLogNormal,
  nextCircadianPoisson,
  createSessionSeed,
  ActivityAwareScheduler,
  AdaptivePinger,
} from '../utils/human-timing.js';
import fs from 'fs';
import path from 'path';

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

    
    this._seed = createSessionSeed();

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
      typing: { min: 800, max: 2500 },
      reading: { min: 1500, max: 5000 },
      thinking: { min: 1500, max: 6000 },
      browsing: { min: 1000, max: 3000 },
      messageDelay: { min: 1500, max: 4000 },
    };

    this.sessionMetrics = {
      requestCount: 0,
      errorCount: 0,
      lastActivity: Date.now(),
      riskLevel: 'low',
    };

    this._timers = new SafeTimerRegistry();
    this._scheduler = new ActivityAwareScheduler({
      seed: this._seed,
      baseMeanMs: 3_600_000, 
    });

    this._lastEventTs = Date.now();
    this._reconnecting = false;
    this._activeListenerStop = null;
    this._backoff = { attempt: 0, next: 0 };
    this._destroyed = false;
    this._inFlightRefreshId = 0;
    this._probing = false;
    this._lastRefreshTs = 0;
    this._lastHeavyMaintenanceTs = 0;
    this._refreshing = false;
    this._minSpacingMs = 2_700_000;

    this.safetyStorePath = path.join(process.cwd(), '.fca-safety-store.json');
    this.ctx = null;
    this.api = null;
    this.onSafetyEvent = null;

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    this._onMqttMessage = typeof opts.onMqttMessage === 'function' ? opts.onMqttMessage : null;

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

  setFixedUserAgent(ua) {
    if (ua) this._fixedUA = ua;
  }

  getSafeUserAgent() {
    if (!this.options.enableUAContinuity) return this.safeUserAgents[0];
    if (!this._fixedUA) this._fixedUA = this.safeUserAgents[0];
    return this._fixedUA;
  }

  applySafeHeaders(extra = {}) {
    const h = {
      'User-Agent': this.getSafeUserAgent(),
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      DNT: '1',
      Connection: 'keep-alive',
      'Cache-Control': 'max-age=0',
      ...extra,
    };
    const region = this.ctx?.region || (this.options.bypassRegionLock && this.currentRegion);
    if (region) h['X-MSGR-Region'] = region;
    return h;
  }

  getHumanDelay(type = 'browsing') {
    if (!this.options.enableSafeDelays) return 5_000;
    const pat = this.humanDelayPatterns[type] ?? this.humanDelayPatterns.browsing;
    const risk =
      this.sessionMetrics.riskLevel === 'high'
        ? 2.5
        : this.sessionMetrics.riskLevel === 'medium'
          ? 1.8
          : 1.3;
    
    return Math.max(3_000, nextLogNormal(((pat.min + pat.max) / 2) * risk, 0.35));
  }

  computeAdaptiveSendDelay() {
    const r = this.sessionMetrics.riskLevel;
    const [lo, hi] =
      r === 'high' ? [3_500, 6_500] : r === 'medium' ? [2_000, 4_500] : [1_000, 2_500];
    return nextLogNormal((lo + hi) / 2, 0.3);
  }

  applyAdaptiveSendDelay() {
    return new Promise((r) => setTimeout(r, this.computeAdaptiveSendDelay()));
  }

  validateLogin(appState) {
    try {
      if (!appState) return { safe: false, reason: 'No appState' };
      const arr = typeof appState === 'string' ? JSON.parse(appState) : appState;
      if (!arr.length) return { safe: false, reason: 'Empty appState' };
      const keys = arr.map((c) => c.name ?? c.key);
      const required = ['c_user', 'xs', 'datr', 'sb'];
      return required.some((k) => keys.includes(k))
        ? { safe: true, reason: 'Validated' }
        : { safe: false, reason: 'Missing essential cookies' };
    } catch (e) {
      return { safe: false, reason: e.message };
    }
  }

  checkErrorSafety(err) {
    const danger = [
      'checkpoint',
      'verification_required',
      'account_locked',
      'temporarily_blocked',
      'unusual_activity',
      'security_check',
      'login_approval',
      'account_suspended',
    ];
    const msg = (err?.message ?? String(err)).toLowerCase();
    const found = danger.find((d) => msg.includes(d));
    return found
      ? { safe: false, danger: found, recommendation: 'أوقف كل العمليات فوراً' }
      : { safe: true, danger: null };
  }

  recordRequest(isError = false) {
    this.sessionMetrics.requestCount++;
    this.sessionMetrics.lastActivity = Date.now();
    if (isError) this.sessionMetrics.errorCount++;
    this._lastEventTs = Date.now();
    this._scheduler.heartbeat();
  }

  recordEvent() {
    this._lastEventTs = Date.now();
    this._scheduler.heartbeat();
  }

  _setupSessionMonitoring() {
    const scheduleCheck = () => {
      if (this._destroyed) return;
      
      const wait = nextPoisson(60_000, 20_000, 180_000);
      const h = setTimeout(() => {
        this._updateRiskLevel();
        scheduleCheck();
      }, wait);
      if (h?.unref) h.unref();
      this._timers.set('riskCheck', h);
    };
    scheduleCheck();
  }

  _updateRiskLevel() {
    const rate = this.sessionMetrics.errorCount / Math.max(1, this.sessionMetrics.requestCount);
    const level = rate > 0.3 ? 'high' : rate > 0.1 ? 'medium' : 'low';
    if (level !== this.sessionMetrics.riskLevel) {
      this.sessionMetrics.riskLevel = level;
      this._minSpacingMs = level === 'high' ? 1_800_000 : 2_700_000;
      this._safetyEmit('riskLevelChanged', { risk: level });
    }
  }

  _setupSafeRefresh() {
    const schedule = () => {
      if (this._destroyed) return;
      
      const wait = this._scheduler.nextDelay();
      const h = setTimeout(async () => {
        await this.refreshSafeSession();
        schedule();
      }, wait);
      if (h?.unref) h.unref();
      this._timers.set('safeRefresh', h);
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

      
      for (const meanMs of [1_500, 12_000, 35_000]) {
        const wait = nextPoisson(meanMs, meanMs * 0.5, meanMs * 2.5);
        const h = setTimeout(() => {
          if (!this._destroyed && id === this._inFlightRefreshId) this._ensureMqttAlive();
        }, wait);
        if (h?.unref) h.unref();
        this._timers.add(h);
      }
    } catch (e) {
      this.recordRequest(true);
      this._safetyEmit('safeRefresh', { ok: false, error: e?.message });
      await this._ensureMqttAlive();
    } finally {
      this._refreshing = false;
    }
  }

  async _ensureMqttAlive() {
    if (!this.api || this._destroyed) return;
    try {
      const disconnected = !this.ctx?.mqttClient?.connected;
      const staleMs = Date.now() - this._lastEventTs;
      if (disconnected || staleMs > 480_000)
        return this._reconnectMqttWithBackoff(disconnected ? 'disconnected' : 'hard-stale');

      
      if (staleMs > 150_000 && !this._probing) {
        this._probing = true;
        const snapshotTs = this._lastEventTs;
        try {
          this.ctx.mqttClient?.ping?.();
        } catch {
          
        }
        
        const probeWait = nextPoisson(7_000, 4_000, 15_000);
        const h = setTimeout(() => {
          this._probing = false;
          if (!this._destroyed && this._lastEventTs <= snapshotTs) {
            this._backoff.attempt = 0;
            this._reconnectMqttWithBackoff('soft-stale');
          }
        }, probeWait);
        if (h?.unref) h.unref();
        this._timers.add(h);
      }
    } catch {
      
    }
  }

  async _reconnectMqttWithBackoff(reason) {
    if (this._reconnecting || this._destroyed) return;
    this._reconnecting = true;
    try {
      const now = Date.now();
      if (now < this._backoff.next) return;
      const attempt = ++this._backoff.attempt;
      
      const base = this.sessionMetrics.riskLevel === 'high' ? 900 : 1_500;
      const delay = nextLogNormal(base * Math.pow(1.9, Math.min(attempt, 6)), 0.3);
      this._backoff.next = now + Math.min(delay, 25_000);
      await new Promise((r) => setTimeout(r, Math.min(delay, 25_000)));

      if (this._activeListenerStop) {
        try {
          this._activeListenerStop();
        } catch {
          
        }
        this._activeListenerStop = null;
      }
      if (this.api && typeof this.api.listenMqtt === 'function' && !this._destroyed) {
        const stop = this.api.listenMqtt((err, msg) => {
          if (!err && msg) {
            this.recordEvent();
            
            
            
            if (this._onMqttMessage) {
              try {
                this._onMqttMessage(err, msg);
              } catch {
                
              }
            }
          } else if (err && this._onMqttMessage) {
            try {
              this._onMqttMessage(err, msg);
            } catch {
              
            }
          }
        });
        this._activeListenerStop = stop;
        this._markHeavyMaintenance();
        this._safetyEmit('mqttReconnect', { success: true, reason, attempt });
      }
      const h = setTimeout(
        () => {
          if (this.ctx?.mqttClient?.connected) this._backoff.attempt = 0;
        },
        nextPoisson(5_000, 3_000, 10_000)
      );
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

  _schedulePeriodicRecycle() {
    if (this._destroyed) return;
    
    const wait = nextCircadianPoisson(
      21_600_000 * this._seed.offsetFactor, 
      this._seed.utcOffsetHours
    );
    const h = setTimeout(() => {
      if (this._destroyed) return;
      if (Date.now() - this._lastRefreshTs < this._minSpacingMs) {
        
        const defer = setTimeout(
          () => this._schedulePeriodicRecycle(),
          nextLogNormal(1_500_000, 0.4)
        );
        if (defer?.unref) defer.unref();
        this._timers.set('recycleDeferral', defer);
        return;
      }
      this.forceReconnect('periodic');
      this._schedulePeriodicRecycle();
    }, wait);
    if (h?.unref) h.unref();
    this._timers.set('periodicRecycle', h);
  }

  _scheduleLightPoke() {
    if (this._destroyed) return;
    
    const wait = nextLogNormal(1_800_000 * this._seed.offsetFactor, 0.45);
    const h = setTimeout(async () => {
      if (this._destroyed) return;
      if (Date.now() - this._lastRefreshTs >= this._minSpacingMs / 2) {
        try {
          if (this.api?.refreshFb_dtsg) {
            await this.api.refreshFb_dtsg().catch(() => {});
            this._lastRefreshTs = Date.now();
            this._safetyEmit('lightPoke', { ts: Date.now() });
          }
        } catch {
          
        }
      }
      this._scheduleLightPoke();
    }, wait);
    if (h?.unref) h.unref();
    this._timers.set('lightPoke', h);
  }

  _scheduleSessionBreath() {
    if (this._destroyed) return;
    
    const wait = nextPoisson(1_320_000 * this._seed.offsetFactor, 600_000, 3_600_000);
    const h = setTimeout(() => {
      if (!this._destroyed) {
        this._safetyEmit('sessionBreath', { ts: Date.now() });
        this._scheduleSessionBreath();
      }
    }, wait);
    if (h?.unref) h.unref();
    this._timers.set('sessionBreath', h);
  }

  startMonitoring(ctx, api) {
    if (!ctx || !api) return;
    this.ctx = ctx;
    this.api = api;

    
    const scheduleCookieCheck = () => {
      const wait = nextPoisson(35_000, 15_000, 90_000);
      const h = setTimeout(() => {
        try {
          const cookies = this.ctx?.jar?.getCookiesSync?.('https://www.facebook.com') ?? [];
          if (!cookies.find((c) => c.key === 'c_user'))
            this._safetyEmit('accountIssue', { type: 'session_expired' });
        } catch {
          
        }
        scheduleCookieCheck();
      }, wait);
      if (h?.unref) h.unref();
      this._timers.set('cookieMonitor', h);
    };
    scheduleCookieCheck();

    this.recordEvent();
    this._startAdaptiveHeartbeat(ctx);
  }

  
  _startAdaptiveHeartbeat(ctx) {
    const pinger = new AdaptivePinger(() => {
      try {
        ctx?.mqttClient?.ping?.();
      } catch {
        
      }
    }, this._seed);
    pinger.start();
    
    this._stopPinger = () => pinger.stop();

    
    const scheduleStaleCheck = () => {
      const wait = nextPoisson(90_000, 40_000, 200_000);
      const h = setTimeout(() => {
        if (this._destroyed) return;
        const stale = Date.now() - this._lastEventTs;
        const threshold = this.sessionMetrics.riskLevel === 'high' ? 480_000 : 720_000;
        if (stale > threshold) {
          this._backoff.attempt = 0;
          this._ensureMqttAlive();
        }
        scheduleStaleCheck();
      }, wait);
      if (h?.unref) h.unref();
      this._timers.set('staleCheck', h);
    };
    scheduleStaleCheck();
  }

  _saveToSafetyStore() {
    if (!this.ctx?.fb_dtsg) return;
    try {
      const data = JSON.stringify(
        {
          fb_dtsg: this.ctx.fb_dtsg,
          jazoest: this.ctx.jazoest,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      );
      const dir = path.dirname(this.safetyStorePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.safetyStorePath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, data, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.safetyStorePath);
    } catch {
      
    }
  }

  _loadFromSafetyStore() {
    try {
      if (!fs.existsSync(this.safetyStorePath)) return;
      const stored = JSON.parse(fs.readFileSync(this.safetyStorePath, 'utf8'));
      if (stored.fb_dtsg && this.ctx && !this.ctx.fb_dtsg)
        Object.assign(this.ctx, { fb_dtsg: stored.fb_dtsg, jazoest: stored.jazoest });
    } catch {
      
    }
  }

  _markHeavyMaintenance() {
    this._lastHeavyMaintenanceTs = Date.now();
  }

  _safetyEmit(event, data) {
    if (typeof this.onSafetyEvent === 'function')
      try {
        this.onSafetyEvent(event, data);
      } catch {
        
      }
  }

  setSafetyEventHandler(fn) {
    this.onSafetyEvent = fn;
  }

  getSafetyRecommendations() {
    const recs = [];
    if (this.sessionMetrics.riskLevel === 'high')
      recs.push('قلل تكرار الطلبات', 'أضف تأخيرات أطول بين الرسائل');
    if (this.sessionMetrics.errorCount > 5) recs.push('تحقق من الحساب يدوياً في المتصفح');
    return recs;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._activeListenerStop) {
      try {
        this._activeListenerStop();
      } catch {}
    }
    this._activeListenerStop = null;
    this._stopPinger?.();
    this._timers.destroy();
  }
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-facebook-safety',
  meta: { category: 'safety', path: 'lib/safety/FacebookSafety.js' },
  setup(_ctx) {
    // provides: FacebookSafety
  },
};
