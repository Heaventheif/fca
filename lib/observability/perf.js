import _log from '../func/logger.js';
const { performance, PerformanceObserver } = globalThis;
let _observer = null;

export function startPerfObserver(opts = {}) {
  if (_observer) return;
  const slowMs = opts.slowThresholdMs ?? 1000;
  const onSlow = opts.onSlow ?? ((e) => _log(`[Perf] بطيء: ${e.name} → ${e.duration.toFixed(1)}ms`, 'warn'));
  const onEntry = opts.onMeasure ?? null;

  _observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (onEntry) onEntry(entry);
      if (entry.duration > slowMs) onSlow(entry);
    }
  });
  _observer.observe({ entryTypes: ['measure'] });
}

export function stopPerfObserver() {
  if (_observer) {
    _observer.disconnect();
    _observer = null;
  }
}

export function measureMqttPublish(topic, fn) {
  const mark = `mqtt:pub:${topic}:${Date.now()}`;
  performance.mark(`${mark}:start`);
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      try {
        performance.mark(`${mark}:end`);
        performance.measure(`mqtt.publish.${topic}`, `${mark}:start`, `${mark}:end`);
        performance.clearMarks(`${mark}:start`);
        performance.clearMarks(`${mark}:end`);
      } catch {
        
      }
    });
}

export async function measure(name, fn) {
  const s = `${name}:s:${performance.now()}`;
  const e = `${name}:e:${performance.now()}`;
  performance.mark(s);
  try {
    return await fn();
  } finally {
    try {
      performance.mark(e);
      performance.measure(name, s, e);
      performance.clearMarks(s);
      performance.clearMarks(e);
    } catch {
      
    }
  }
}

export default { startPerfObserver, stopPerfObserver, measureMqttPublish, measure };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-observability-perf',
  meta: { category: 'observability', path: 'lib/observability/perf.js' },
  setup(_ctx) {
    // provides: startPerfObserver, stopPerfObserver, measureMqttPublish, measure
  },
};
