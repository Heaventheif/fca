/**
 * messenger-client.js — طبقة التجميع العليا
 *
 * إصلاحات هذا الإصدار:
 *  FIX-01: إزالة _forwardBotEvents — كانت تُسبب triple-fire لكل حدث message
 *           (الحدث يُرسل من _routeEvent ثم مرتين عبر Bot listeners)
 *  FIX-02: _drainQueue تُفوّض لـ ThreadSendQueue بدل إعادة اختراع العجلة
 *  FIX-03: start() كانت تُحلّ بعد 3s ثابتة بغض النظر عن حالة MQTT الحقيقية
 *           → الآن تنتظر 'ready' أو تُرفض بعد connectTimeoutMs مع رسالة واضحة
 *  FIX-04: stop() يُرسل MQTT disconnect نظيف قبل إغلاق الاتصال
 */

import EventEmitter from 'node:events';
import { createFcaClient }        from './create-client.js';
import { MessengerBot }           from './messenger-bot.js';
import { CommandRegistry, Command } from '../command/registry.js';
import { createSessionGuard }     from '../safety/session-guard.js';
import { createCookieRefresher }  from '../safety/cookie-refresher.js';
import { createHealthMetrics }    from '../performance/health-metrics.js';
import { createHealthServer }     from '../performance/health-server.js';
import { ThreadSendQueue }        from '../utils/send-queue.js'; // FIX-02

const DEFAULT_MAX_PARALLEL = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000; // FIX-03

export class MessengerClient extends EventEmitter {
  constructor(api, opts = {}) {
    super();
    this.setMaxListeners(0);
    this.api     = api;
    this.options = opts;
    this.client  = createFcaClient(api);

    // Bot للـ middleware/command فقط — لا يُشغَّل listen مستقل
    this._bot = new MessengerBot(
      { api, ...(api._ctx ?? {}) },
      { commandPrefix: opts.commandPrefix ?? '/', maxEventListeners: 0,
        enableComposer: true, stopOnSignals: false }
    );

    this.commands = new CommandRegistry({
      prefix:   opts.commandPrefix ?? '/',
      ownerIDs: opts.ownerIDs ?? [],
    });

    this.metrics = createHealthMetrics();

    if (opts.healthServer) {
      this._healthServer = createHealthServer({ port: opts.healthServerPort });
      this._healthServer.attachMetrics(this.metrics);
    }

    if (opts.sessionGuard !== false)
      this._sessionGuard = createSessionGuard();

    if (opts.cookieRefresher !== false && api._defaultFuncs) {
      this._cookieRefresher = createCookieRefresher({
        appStatePath: opts.appStatePath,
        intervalMs:   opts.cookieRefreshIntervalMs,
      });
    }

    // FIX-02: ThreadSendQueue garantiza orden por thread y evita race conditions
    this._queue = new ThreadSendQueue(
      (msg, threadID, replyToID) => new Promise((res, rej) => {
        if (replyToID)
          this.api.sendMessage(msg, threadID, replyToID, (e, r) => e ? rej(e) : res(r));
        else
          this.api.sendMessage(msg, threadID, (e, r) => e ? rej(e) : res(r));
      }),
      { maxQueueSize: opts.maxQueueSize ?? 50,
        interMsgDelay: opts.interMsgDelay ?? 300 }
    );
    this.api._sendQueue = this._queue;

    this._stopHandle = null;
    // FIX-01: لا نستدعي _forwardBotEvents — الحدث يصل مرة واحدة فقط من _routeEvent
  }

  // ── START ──────────────────────────────────────────────────────────────────
  async start() {
    if (this._sessionGuard && this.api._ctx)
      this._sessionGuard.attach(this.api._ctx, { onStale: e => this.emit('stale', e) });

    if (this._cookieRefresher && this.api._defaultFuncs)
      this._cookieRefresher.attach(this.api._ctx, this.api._defaultFuncs);

    if (this._healthServer) this._healthServer.start();

    const timeoutMs = this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let timer = null;
      let settled = false;

      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        fn(val);
      };

      // FIX-03: رفض حقيقي إذا لم يصل 'ready' خلال المهلة
      timer = setTimeout(() => {
        settle(reject, new Error(
          `MessengerClient.start(): MQTT لم يتصل خلال ${timeoutMs}ms. ` +
          'تحقق من صحة الـ appState أو زد connectTimeoutMs.'
        ));
      }, timeoutMs);
      if (timer?.unref) timer.unref();

      this._stopHandle = this.api.listenMqtt((err, event) => {
        if (err) { this.emit('error', err); return; }
        this._sessionGuard?.heartbeat();
        this.metrics.onMessage();
        this._routeEvent(event);
      });

      this.once('ready', () => settle(resolve, this));
    });
  }

  // ── STOP ───────────────────────────────────────────────────────────────────
  // FIX-04: إرسال disconnect نظيف لـ MQTT قبل الإغلاق
  async stop() {
    // أوقف الـ listener أولاً حتى لا تصل أحداث جديدة
    if (typeof this._stopHandle === 'function') this._stopHandle();
    this._stopHandle = null;

    // انتظر تصفية قائمة الإرسال (أقصى 5s) ثم أغلق
    try { await this._queue.drain(5000); } catch { /* best-effort */ }

    // MQTT graceful disconnect
    try {
      const mc = this.api?._ctx?.mqttClient;
      if (mc?.connected) await new Promise(r => mc.end(false, {}, r));
    } catch { /* ignore MQTT close errors */ }

    this._cookieRefresher?.stop();
    this._sessionGuard?.stop();
    this._healthServer?.stop();
    this.emit('stop');
  }

  // ── SEND HELPERS ───────────────────────────────────────────────────────────
  send(msg, threadID)         { return this._queue.enqueue(msg, threadID); }
  reply(msg, event)           {
    const m = typeof msg === 'string' ? { body: msg } : msg;
    return this._queue.enqueue({ ...m, replyMessageID: event.messageID }, event.threadID);
  }
  react(reaction, messageID)  {
    return new Promise((res, rej) =>
      this.api.setMessageReaction(reaction, messageID, e => e ? rej(e) : res()));
  }
  unsend(messageID) {
    return new Promise((res, rej) =>
      this.api.unsendMessage(messageID, e => e ? rej(e) : res()));
  }
  pin(messageID, threadID, pinned) {
    return new Promise((res, rej) => {
      if (typeof this.api.pinMessage !== 'function')
        return rej(new Error('pinMessage not available'));
      this.api.pinMessage(messageID, threadID, pinned, (e, r) => e ? rej(e) : res(r));
    });
  }

  // ── MIDDLEWARE / COMMANDS ──────────────────────────────────────────────────
  use(middleware)          { this._bot.use(middleware); return this; }
  hears(pattern, handler)  { this._bot.hears(pattern, handler); return this; }
  command(name, handler, opts = {}) {
    this.commands.register(new Command(name, { ...opts, handler }));
    this._bot.command(name, async ctx => {
      const args = (ctx.text ?? '').trim().split(/\s+/).slice(1);
      await handler({ ...ctx, args });
    });
    return this;
  }

  getMetrics()  { return this.metrics.snapshot(); }
  get queueStats() { return this._queue.stats; }

  // ── EVENT ROUTING ──────────────────────────────────────────────────────────
  // FIX-01: un seul point d'émission — plus de double/triple fire
  _routeEvent(event) {
    if (!event) return;

    this.emit('update', event);
    this.emit('raw',    event);

    const t = event.type;
    if (!t) return;

    if (t === 'message' || t === 'message_reply') {
      this.metrics.onMessage();
      this.emit('message',       event);
      this.emit('messageCreate', event);

      // Dispatch middleware/commands via Bot (sans re-émettre)
      this._bot.enqueueComposerIfNeeded(event);

      const body = event.body ?? '';
      this.commands.dispatch(body, {
        senderID:  event.senderID,
        isGroup:   !!event.isGroup,
        api:       this.api,
        threadID:  event.threadID,
        messageID: event.messageID,
        event,
      }, []).catch(e => this.emit('error', e));
    }

    if (t === 'message_reply')    this.emit('message_reply',  event);
    if (t === 'message_reaction') this.emit('reaction',       event);
    if (t === 'message_unsend')   this.emit('unsend',         event);
    if (t === 'typ')              this.emit(event.isTyping ? 'typingStart' : 'typingStop', event);
    if (t === 'read_receipt')     this.emit('readReceipt',    event);
    if (t === 'event')            this.emit('threadUpdate',   event);
    if (t === 'ready') {
      this.metrics.onConnect();
      this.emit('ready', event);
    }

    // Catch-all لأي type غير المذكور أعلاه
    if (!['message','message_reply','message_reaction','message_unsend',
          'typ','read_receipt','event','ready'].includes(t)) {
      this.emit(t, event);
    }
  }
}

export function createMessengerClient(api, opts) {
  return new MessengerClient(api, opts);
}

export default { MessengerClient, createMessengerClient };
