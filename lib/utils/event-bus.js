/**
 * event-bus.js — ناقل أحداث موسَّع مبني على EventEmitter.
 *
 * الميزات الإضافية:
 *  - دعم الفضاءات (namespaces)
 *  - انتظار حدث مع مهلة (wait)
 *  - تاريخ الأحداث (keepHistory)
 *  - فهرسة القنوات النشطة (listChannels)
 */
import { EventEmitter } from 'node:events';

export class EventBus extends EventEmitter {
  /**
   * @param {object}  [opts]
   * @param {number}  [opts.maxListeners=100]  - حد المستمعين قبل التحذير
   * @param {boolean} [opts.keepHistory=false] - احتفظ بآخر N حدث لكل نوع
   * @param {number}  [opts.historyMax=50]     - الحد الأقصى للتاريخ لكل نوع
   */
  constructor(opts = {}) {
    super();
    this.setMaxListeners(opts.maxListeners ?? 100);

    this._history     = opts.keepHistory ? new Map() : null;
    this._historyMax  = opts.historyMax  ?? 50;
    this._namespaces  = new Map();
  }

  // ── إصدار الأحداث (مع تسجيل اختياري) ─────────────────────────

  emit(event, ...args) {
    if (this._history) {
      const list = this._history.get(event) ?? [];
      list.push({ args, ts: Date.now() });
      if (list.length > this._historyMax) list.shift();
      this._history.set(event, list);
    }
    return super.emit(event, ...args);
  }

  // ── الفضاءات ──────────────────────────────────────────────────

  /**
   * أنشئ أو استرجع ناقل فضاء اسمي.
   * جميع الأحداث تُرسَل بصيغة `ns:eventName`.
   *
   * @param {string} ns - اسم الفضاء
   * @returns {{ emit, on, off, once, wait }}
   */
  namespace(ns) {
    if (this._namespaces.has(ns)) return this._namespaces.get(ns);

    const prefix = `${ns}:`;
    const nsBus  = {
      emit:  (event, ...args)    => this.emit(`${prefix}${event}`, ...args),
      on:    (event, handler)    => { this.on   (`${prefix}${event}`, handler); return nsBus; },
      off:   (event, handler)    => { this.off  (`${prefix}${event}`, handler); return nsBus; },
      once:  (event, handler)    => { this.once (`${prefix}${event}`, handler); return nsBus; },
      wait:  (event, timeoutMs = 30_000) => this._waitFor(`${prefix}${event}`, timeoutMs),
    };

    this._namespaces.set(ns, nsBus);
    return nsBus;
  }

  // ── انتظار حدث مع مهلة ────────────────────────────────────────

  /**
   * انتظر حتى يُصدَر الحدث أو تنتهي المهلة.
   * @param {string} event
   * @param {number} [timeoutMs=30000]
   * @returns {Promise<*>}
   */
  wait(event, timeoutMs = 30_000) {
    return this._waitFor(event, timeoutMs);
  }

  // ── استعلامات ─────────────────────────────────────────────────

  /**
   * أرجع خريطة بأسماء القنوات النشطة وعدد مستمعيها.
   * @returns {Record<string, number>}
   */
  listChannels() {
    return Object.fromEntries(
      this.eventNames().map(name => [name, this.listenerCount(name)])
    );
  }

  /**
   * أرجع آخر `n` حدث مسجَّل لنوع معين.
   * @param {string} event
   * @param {number} [n=10]
   * @returns {Array<{ args: *, ts: number }>}
   */
  getHistory(event, n = 10) {
    if (!this._history) return [];
    return (this._history.get(event) ?? []).slice(-n);
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /**
   * منطق الانتظار المشترك.
   * @param {string} fullEvent
   * @param {number} timeoutMs
   */
  _waitFor(fullEvent, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(fullEvent, handler);
        reject(new Error(`EventBus.wait timeout: ${fullEvent}`));
      }, timeoutMs);

      function handler(data) {
        clearTimeout(timer);
        resolve(data);
      }

      this.once(fullEvent, handler);
    });
  }
}

// ── سينغلتون عام ──────────────────────────────────────────────
export const globalBus = new EventBus({ keepHistory: false });

/**
 * مصنع مختصر.
 * @param {ConstructorParameters<typeof EventBus>[0]} options
 */
export function createEventBus(options) {
  return new EventBus(options);
}

export default { EventBus, createEventBus, globalBus };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-event-bus',
  meta: { category: 'utils', path: 'lib/utils/event-bus.js' },
  setup(_ctx) {
    // provides: EventBus, globalBus, createEventBus
  },
};
