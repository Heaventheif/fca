import crypto from 'node:crypto';

function _gaussian() {
  let u, v;
  do {
    u = Math.random();
  } while (u === 0);
  v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function nextPoisson(meanMs, minMs = 0, maxMs = Infinity) {
  
  let u;
  do {
    u = Math.random();
  } while (u === 0 || u === 1);
  const raw = -meanMs * Math.log(1 - u);
  return Math.max(minMs, Math.min(maxMs, Math.round(raw)));
}

export function nextLogNormal(medianMs, sigmaFactor = 0.4) {
  const mu = Math.log(medianMs);
  const sigma = sigmaFactor;
  return Math.max(100, Math.round(Math.exp(mu + sigma * _gaussian())));
}

export function circadianWeight(utcOffsetHours = 0) {
  const localHour = (((new Date().getUTCHours() + utcOffsetHours) % 24) + 24) % 24;
  
  const morning = 0.5 + 0.5 * Math.cos((Math.PI * (localHour - 10)) / 8);
  const evening = 0.5 + 0.5 * Math.cos((Math.PI * (localHour - 20)) / 6);
  const weight = Math.max(0.05, Math.min(1, (morning + evening) / 2));
  return weight;
}

export function nextCircadianPoisson(baseMeanMs, utcOffsetHours = 0) {
  const w = circadianWeight(utcOffsetHours);
  const adjustedMs = baseMeanMs / Math.max(0.1, w); 
  return nextPoisson(adjustedMs, baseMeanMs * 0.2, baseMeanMs * 8);
}

export function createSessionSeed() {
  const buf = crypto.randomBytes(8);
  return {
    
    offsetFactor: 0.75 + (buf.readUInt16BE(0) / 65535) * 0.5,
    
    driftMs: (buf.readInt16BE(2) / 32767) * 15 * 60_000,
    
    utcOffsetHours: (buf.readUInt8(4) % 24) - 12,
    
    mqttKeepalive: 40 + (buf.readUInt8(5) % 36), 
    
    pingIntervalBase: 25_000 + (buf.readUInt8(6) % 30) * 1_000,
  };
}

export class ActivityAwareScheduler {
  
  constructor(opts = {}) {
    this._seed = opts.seed ?? createSessionSeed();
    this._baseMean = opts.baseMeanMs ?? 3_600_000;
    this._min = opts.minMs ?? this._baseMean * 0.15;
    this._max = opts.maxMs ?? this._baseMean * 6;
    this._lastEvent = Date.now();
    this._actionCount = 0; 
  }

  
  heartbeat() {
    this._lastEvent = Date.now();
    this._actionCount++;
  }

  
  nextDelay() {
    const silenceSec = (Date.now() - this._lastEvent) / 1000;
    const recentActive = silenceSec < 120; 

    
    const activityMult = recentActive
      ? 1.5 + Math.random() * 2.5 
      : 1.0;

    const meanMs = this._baseMean * this._seed.offsetFactor * activityMult;

    const raw = nextCircadianPoisson(meanMs, this._seed.utcOffsetHours);
    return Math.max(this._min, Math.min(this._max, raw + this._seed.driftMs));
  }

  
  resetActionCount() {
    this._actionCount = 0;
  }
}

export class AdaptivePinger {
  constructor(pingFn, seed) {
    this._ping = pingFn;
    this._seed = seed ?? createSessionSeed();
    this._lastIn = Date.now(); 
    this._lastPing = Date.now();
    this._timer = null;
    this._stopped = false;
    this._base = seed?.pingIntervalBase ?? 30_000;
  }

  
  onIncoming() {
    this._lastIn = Date.now();
  }

  start() {
    this._stopped = false;
    this._schedule();
    return this;
  }

  stop() {
    this._stopped = true;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  _schedule() {
    if (this._stopped) return;

    const silenceMs = Date.now() - this._lastIn;

    
    
    
    const urgency = Math.min(3, silenceMs / this._base);
    const meanMs = this._base / Math.max(0.3, urgency);

    const wait = nextPoisson(meanMs, 8_000, this._base * 4);

    this._timer = setTimeout(() => {
      this._timer = null;
      if (!this._stopped) {
        try {
          this._ping();
        } catch {
          
        }
        this._lastPing = Date.now();
      }
      this._schedule();
    }, wait);
    if (this._timer?.unref) this._timer.unref();
  }
}

export default {
  nextPoisson,
  nextLogNormal,
  circadianWeight,
  nextCircadianPoisson,
  createSessionSeed,
  ActivityAwareScheduler,
  AdaptivePinger,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-human-timing',
  meta: { category: 'utils', path: 'lib/utils/human-timing.js' },
  setup(_ctx) {
    // provides: nextPoisson, nextLogNormal, circadianWeight, nextCircadianPoisson, createSessionSeed, ActivityAwareScheduler, AdaptivePinger
  },
};
