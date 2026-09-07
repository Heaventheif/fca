import { EventEmitter } from 'node:events';
import { nextPoisson } from '../utils/human-timing.js';
import logger from '../func/logger.js';

const DEFAULT_INTERVAL_MS = 4 * 60 * 60 * 1_000; 

export class SessionRotationManager extends EventEmitter {
  
  constructor(api, ctx, opts = {}) {
    super();
    this._api = api;
    this._ctx = ctx;
    this._intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
    this._minMs = opts.minIntervalMs ?? 60 * 60 * 1_000;
    this._refreshToken = opts.refreshToken !== false;
    this._fg = opts.fingerprintGenerator ?? null;
    this._cb = opts.circuitBreaker ?? null;
    this._timer = null;
    this._rotations = 0;
    this._lastRotation = null;
    this._running = false;
  }

  start() {
    if (this._running) return this;
    this._running = true;
    this._schedule();
    logger(
      `[SessionRotation] ▶️ تدوير الجلسة كل ~${Math.round(this._intervalMs / 3_600_000)}h (Poisson jitter)`,
      'info'
    );
    return this;
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    logger('[SessionRotation] ⏹️ تم إيقاف تدوير الجلسة', 'info');
    return this;
  }

  async rotateNow() {
    return this._doRotate(true);
  }

  getStats() {
    return {
      rotations: this._rotations,
      lastRotation: this._lastRotation,
      running: this._running,
    };
  }

  _schedule() {
    if (!this._running) return;
    const delay = nextPoisson(this._intervalMs, this._minMs, this._intervalMs * 2);
    this._timer = setTimeout(() => this._doRotate(false).finally(() => this._schedule()), delay);
    this._timer.unref?.();
  }

  async _doRotate(manual = false) {
    try {
      
      if (this._cb && !this._cb.canAttempt()) {
        logger('[SessionRotation] ⏭️ تجاوز التدوير — CircuitBreaker مفتوح', 'warn');
        this.emit('rotationSkipped', { reason: 'circuit_open' });
        return;
      }

      const oldSesId = this._ctx._fingerprint?.sessionId ?? null;

      
      let newFp = null;
      if (this._fg) {
        newFp = this._fg.rotate();
        this._fg.applyToCtx(this._ctx, newFp);
        logger(`[SessionRotation] 🔄 بصمة جديدة: ${newFp.userAgent.slice(0, 50)}...`, 'info');
      }

      
      if (this._refreshToken && this._api?.refreshFbDtsg) {
        await this._api.refreshFbDtsg();
      }

      this._rotations++;
      this._lastRotation = new Date().toISOString();

      logger(
        `[SessionRotation] ✅ تدوير #${this._rotations} (${manual ? 'يدوي' : 'تلقائي'})`,
        'info'
      );
      this.emit('rotated', {
        rotationNum: this._rotations,
        oldSesId,
        newSesId: newFp?.sessionId ?? null,
        manual,
      });

      this._cb?.recordSuccess();
    } catch (e) {
      logger(`[SessionRotation] ❌ فشل التدوير: ${e?.message}`, 'error');
      this.emit('rotationFailed', { error: e });
      this._cb?.recordFailure();
    }
  }
}

export function createSessionRotationManager(api, ctx, opts) {
  return new SessionRotationManager(api, ctx, opts);
}

export default SessionRotationManager;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-session-rotation',
  meta: { category: 'safety', path: 'lib/safety/session-rotation.js' },
  setup(_ctx) {
    // provides: SessionRotationManager, createSessionRotationManager
  },
};
