/**
 * messenger-bot.js — واجهة البوت العالية المستوى.
 *
 * يوفر:
 *  - نظام middleware (use, command, hears, dm, group, e2ee)
 *  - أحداث Gateway مطابِقة لنمط Discord.js
 *  - دعم E2EE (Secret Conversations)
 *  - إيقاف متحكَّم به عبر SIGINT/SIGTERM
 */
import EventEmitter        from 'node:events';
import { createRequire }   from 'node:module';
import { login }           from '../core/auth.js';
import { createFcaClient } from './create-client.js';
import { MessengerContext } from './messenger-context.js';

// ── تحميل E2EE اختياري (sync) ─────────────────────────────────────
// نستخدم createRequire بدلاً من top-level await لتجنب تأخير تحميل الوحدة

let E2EEBridge        = null;
let createListenE2EE  = null;

try {
  const _require   = createRequire(import.meta.url);
  E2EEBridge       = _require('../e2ee/bridge.js').E2EEBridge;
  createListenE2EE = _require('../e2ee/listenE2EE.js');
} catch {
  // E2EE غير متاح — البوت يعمل بشكل طبيعي بدونه
}

// ── أدوات الأحداث ─────────────────────────────────────────────────

/** يهرب محارف regex الخاصة */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** يُصدر حدثاً فقط إذا كان هناك مستمعون */
function emitIfListened(emitter, event, data) {
  if (emitter.listenerCount(event) > 0) emitter.emit(event, data);
}

/**
 * يُوزِّع حدث MQTT على قنوات متعددة مُتوافقة مع أنماط Discord.js.
 * @param {EventEmitter} emitter
 * @param {object}       event
 */
function dispatchGatewayEvent(emitter, event) {
  emitIfListened(emitter, 'update', event);
  emitIfListened(emitter, 'raw',    event);

  const type = event.type;
  if (!type) return;

  // رسائل عادية ورد
  if (type === 'message' || type === 'message_reply') {
    emitIfListened(emitter, 'message',       event);
    emitIfListened(emitter, 'messageCreate', event);
  }
  if (type === 'message_reply') emitIfListened(emitter, 'message_reply', event);
  else if (type !== 'message') emitIfListened(emitter, type, event);

  // أحداث متخصصة
  switch (type) {
    case 'message_reaction': emitIfListened(emitter, 'messageReactionAdd', event); break;
    case 'message_unsend':   emitIfListened(emitter, 'messageDelete',      event); break;
    case 'typ':              emitIfListened(emitter, event.isTyping ? 'typingStart' : 'typingStop', event); break;
    case 'event':            emitIfListened(emitter, 'threadUpdate',  event); break;
    case 'ready':
      emitIfListened(emitter, 'ready',      event);
      emitIfListened(emitter, 'shardReady', event);
      break;
  }
}

// ── MessengerBot ───────────────────────────────────────────────────

export class MessengerBot extends EventEmitter {
  /**
   * @param {object} ctx    - سياق FCA (من loginAsync)
   * @param {object} [opts]
   * @param {boolean} [opts.enableComposer=true]
   * @param {string}  [opts.commandPrefix='/']
   * @param {boolean} [opts.stopOnSignals=false]
   * @param {number}  [opts.maxEventListeners=64]
   * @param {boolean} [opts.e2ee=true]
   */
  constructor(ctx, opts = {}) {
    super();

    const maxListeners = opts.maxEventListeners ?? 64;
    this.setMaxListeners(maxListeners === 0 ? 0 : maxListeners);

    this.ctx     = ctx;
    this.api     = ctx.api;

    this._facade         = null;
    this._mqtt           = null;
    this._listening      = false;
    this._middlewares    = [];
    this._catchHandler   = null;
    this._signalsBound   = false;
    this._onStopSignal   = null;
    this._enableComposer = opts.enableComposer  ?? true;
    this._commandPrefix  = opts.commandPrefix   ?? '/';
    this._stopOnSignals  = opts.stopOnSignals    ?? false;
    this._e2eeEnabled    = opts.e2ee             !== false;
  }

  // ── خصائص ─────────────────────────────────────────────────────

  get commandPrefix()        { return this._commandPrefix; }
  set commandPrefix(val)     { this._commandPrefix = val || '/'; }

  /** كائن FcaClient المنظَّم بفضاءات أسماء (مُخزَّن في ذاكرة) */
  get client() {
    if (!this._facade) this._facade = createFcaClient(this.api);
    return this._facade;
  }

  /** هل E2EE متصل حالياً؟ */
  get e2eeConnected() {
    return !!(this.api.e2ee?.isConnected?.());
  }

  // ── middleware ─────────────────────────────────────────────────

  /** أضف middleware عام */
  use(fn) { this._middlewares.push(fn); return this; }

  /**
   * تعامل مع أمر بادئته `commandPrefix`.
   * @param {string}   name   - اسم الأمر (بدون prefix)
   * @param {Function} handler - (ctx) => void
   */
  command(name, handler) {
    const lowerName = name.toLowerCase();
    return this.use(async (ctx, next) => {
      const text = ctx.text;
      if (!text) return next();

      const prefixPattern = escapeRegex(this._commandPrefix);
      const matches = new RegExp(`^${prefixPattern}${escapeRegex(lowerName)}(?:\\s|$)`, 'i').test(text);

      return matches ? handler(ctx) : next();
    });
  }

  /**
   * تعامل مع رسائل تحتوي نصاً أو تطابق pattern.
   * @param {string|RegExp} pattern
   * @param {Function}      handler
   */
  hears(pattern, handler) {
    const matches = typeof pattern === 'string'
      ? (text) => text.toLowerCase().includes(pattern.toLowerCase())
      : (text) => pattern.test(text);

    return this.use(async (ctx, next) => {
      const text = ctx.text;
      return (text && matches(text)) ? handler(ctx) : next();
    });
  }

  /** middleware يعمل فقط في رسائل DM */
  dm(fn) {
    return this.use(async (ctx, next) => ctx.isDM ? fn(ctx, next) : next());
  }

  /** middleware يعمل فقط في المجموعات */
  group(fn) {
    return this.use(async (ctx, next) => ctx.isGroup ? fn(ctx, next) : next());
  }

  /** middleware يعمل فقط في رسائل E2EE */
  e2ee(fn) {
    return this.use(async (ctx, next) => ctx.message.isE2EE ? fn(ctx, next) : next());
  }

  /** سجِّل معالج الأخطاء */
  catch(fn) { this._catchHandler = fn; return this; }

  // ── E2EE ──────────────────────────────────────────────────────

  /**
   * اتصل بـ E2EE bridge. يجب استدعاؤه قبل startListening.
   * @param {string} [deviceStorePath]
   */
  async connectE2EE(deviceStorePath) {
    if (!E2EEBridge) {
      throw new Error(
        'E2EE engine not available. Ensure lib/e2ee/vendor/fb-e2ee.cjs exists.\n' +
        'Copy from fca-riyad: src/api/socket/e2ee/vendor/fb-e2ee.cjs'
      );
    }

    const rawCtx = this.ctx.ctx || this.ctx;

    if (!this.api.e2ee) {
      this.api.e2ee = new E2EEBridge(rawCtx, this.api);
      rawCtx.e2ee   = this.api.e2ee;
    }

    // احفظ listenMqtt الأصلية قبل استبدالها
    if (!this.api._listenMqttRaw && typeof this.api.listenMqtt === 'function') {
      this.api._listenMqttRaw = this.api.listenMqtt.bind(this.api);
    }

    await this.api.e2ee.connect(deviceStorePath, rawCtx.userID);

    if (createListenE2EE) {
      const combined        = createListenE2EE(this.api, rawCtx);
      this.api.listenMqtt  = combined;
      this.api.listenE2EE  = combined;
    }

    this.emit('e2ee_ready', { userId: rawCtx.userID });
    return this;
  }

  // ── تشغيل وإيقاف ──────────────────────────────────────────────

  /** ابدأ الاستماع لأحداث MQTT */
  startListening() {
    if (this._listening) return this;

    if (typeof this.api.listenMqtt !== 'function') {
      throw new Error('listenMqtt is not available on API');
    }

    const mqtt     = this.api.listenMqtt.call(this.api);
    this._mqtt      = mqtt;
    this._listening = true;

    mqtt.on('message', (event) => {
      dispatchGatewayEvent(this, event);
      this._enqueueComposer(event);
    });

    mqtt.on('error', (err) => this.emit('error', err));

    return this;
  }

  /**
   * شغِّل البوت (startListening + إشارات الإيقاف اختياريًا).
   * @param {object} [opts]
   * @param {boolean} [opts.stopOnSignals]
   */
  async launch(opts) {
    this.startListening();
    if (opts?.stopOnSignals ?? this._stopOnSignals) this.attachStopSignals();
    return this;
  }

  /** اربط معالجات SIGINT/SIGTERM */
  attachStopSignals() {
    if (this._signalsBound) return;
    this._signalsBound = true;
    this._onStopSignal = () => {
      this.stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    };
    process.once('SIGINT',  this._onStopSignal);
    process.once('SIGTERM', this._onStopSignal);
  }

  /** أفلت معالجات الإشارات */
  detachStopSignals() {
    if (!this._signalsBound || !this._onStopSignal) return;
    process.off('SIGINT',  this._onStopSignal);
    process.off('SIGTERM', this._onStopSignal);
    this._signalsBound = false;
    this._onStopSignal = null;
  }

  /** أوقف البوت بأمان */
  async stop() {
    this.detachStopSignals();
    if (!this._mqtt) return;

    const mqtt = this._mqtt;
    if (typeof mqtt.stopListeningAsync === 'function') await mqtt.stopListeningAsync();
    else mqtt.stopListening?.();

    mqtt.removeAllListeners?.();
    this._mqtt      = null;
    this._listening = false;
  }

  // ── تشغيل middleware ───────────────────────────────────────────

  /** أضف حدث رسالة إلى قائمة انتظار المعالجة */
  _enqueueComposer(event) {
    if (
      !this._enableComposer ||
      this._middlewares.length === 0 ||
      (event.type !== 'message' && event.type !== 'message_reply')
    ) return;

    const ctx = new MessengerContext(this, event);
    queueMicrotask(() => this._runComposer(ctx));
  }

  /** شغِّل سلسلة middleware بترتيب */
  async _runComposer(ctx) {
    const dispatch = async (index) => {
      if (index >= this._middlewares.length) return;
      await this._middlewares[index](ctx, () => dispatch(index + 1));
    };

    try {
      await dispatch(0);
    } catch (err) {
      this._catchHandler ? this._catchHandler(err, ctx) : this.emit('error', err);
    }
  }

  // ── مصنع ثابت ─────────────────────────────────────────────────

  /**
   * أنشئ بوتاً وسجِّل الدخول بخطوة واحدة.
   * @param {object} credentials
   * @param {object} [opts]
   * @param {boolean} [opts.autoListen=true]
   * @param {boolean} [opts.enableComposer=true]
   * @param {string}  [opts.commandPrefix='/']
   * @param {boolean} [opts.stopOnSignals=false]
   * @param {number}  [opts.maxEventListeners=64]
   * @param {boolean} [opts.e2ee=true]
   * @param {string}  [opts.e2eeDeviceStore]
   */
  static async connect(credentials, opts = {}) {
    const {
      autoListen      = true,
      enableComposer  = true,
      commandPrefix   = '/',
      stopOnSignals   = false,
      maxEventListeners = 64,
      e2ee: e2eeOpt,
      e2eeDeviceStore,
      ...loginOptions
    } = opts;

    const ctx = await login(credentials, loginOptions);
    const bot = new MessengerBot(ctx, { enableComposer, commandPrefix, stopOnSignals, maxEventListeners });

    // اتصال E2EE تلقائي
    if (e2eeOpt !== false && E2EEBridge) {
      try {
        await bot.connectE2EE(e2eeDeviceStore);
      } catch (err) {
        bot.emit('e2ee_error', err); // غير فتال
      }
    }

    if (autoListen) await bot.launch({ stopOnSignals });
    else if (stopOnSignals) bot.attachStopSignals();

    return bot;
  }
}

/** مصنع مختصر */
export function createMessengerBot(credentials, opts) {
  return MessengerBot.connect(credentials, opts);
}

export default { MessengerBot, createMessengerBot };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-messenger-bot',
  meta: { category: 'app', path: 'lib/app/messenger-bot.js' },
  setup(_ctx) { /* provides: MessengerBot, createMessengerBot */ },
};
