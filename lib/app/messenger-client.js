/**
 * messenger-client.js — واجهة MessengerClient العالية المستوى.
 *
 * يُنسّق بين: Safety Layer، Send Queue، Bot، Commands، Plugins، Health.
 * منطق البناء موجود في client-factory.js.
 */
import EventEmitter from 'node:events';
import { createFcaClient }                        from './create-client.js';
import { MessengerBot }                           from './messenger-bot.js';
import { PluginSystem }                           from './plugin-system.js';
import { CommandRegistry, Command }               from '../command/registry.js';
import { createDeviceManager }                    from '../safety/device-manager.js';
import { FingerprintGenerator }                   from '../safety/fingerprint-generator.js';
import SingleSessionGuard                         from '../safety/SingleSessionGuard.js';
import { dismissScrapingWarning }                 from '../safety/dismiss-scraping-warning.js';
import { loginAsync }                             from '../core/auth.js';
import { createEventBus }                         from '../utils/event-bus.js';
import { buildSafetyLayer, buildInfraLayer, buildSendQueue } from './client-factory.js';

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

const KNOWN_EVENT_TYPES = new Set([
  'message', 'message_reply', 'message_reaction',
  'message_unsend', 'typ', 'read_receipt', 'event', 'ready',
]);

// ── MessengerClient ───────────────────────────────────────────────────────

export class MessengerClient extends EventEmitter {
  constructor(api, opts = {}) {
    super();
    this.setMaxListeners(0);
    this.api     = api;
    this.options = opts;
    this.client  = createFcaClient(api);
    this.bus     = createEventBus({ keepHistory: false });

    // طبقات مبنية بواسطة factories
    this._safety = buildSafetyLayer(opts, api);
    this._infra  = buildInfraLayer(opts);
    this._queue  = buildSendQueue(api, this._safety, opts);
    api._sendQueue = this._queue;

    // Bot — يعالج middleware و composer
    this._bot = new MessengerBot(
      { api, ...(api._ctx ?? {}) },
      { commandPrefix: opts.commandPrefix ?? '/', maxEventListeners: 0, enableComposer: true, stopOnSignals: false }
    );

    // نظام الأوامر
    this.commands = new CommandRegistry({
      prefix:   opts.commandPrefix ?? '/',
      ownerIDs: opts.ownerIDs     ?? [],
    });

    // نظام البلاجين
    this.plugins = new PluginSystem(this, { bus: this.bus, strict: opts.strictPlugins ?? false });

    // shortcuts للـ infra
    this.metrics       = this._infra.metrics;
    this._healthServer = this._infra.healthServer;
    this._replayBuffer = this._infra.replayBuffer;

    // shortcuts للـ safety
    this._sessionGuard  = this._safety.sessionGuard;
    this._cookieRefresher = this._safety.cookieRefresher;
    this._singleSessionGuard = this._safety.singleSession;
    this._singleSessionGuardPreAcquired = this._safety.singleSessionPreAcquired;
    this._stealth        = this._safety.stealth;
    this._fbSafety       = this._safety.fbSafety;
    this._antiSuspension = this._safety.antiSuspension;
    this._circuitBreaker = this._safety.circuitBreaker;
    this._recipientLimiter = this._safety.recipientLimiter;
    this._watchdog       = this._safety.watchdog;
    this._sessionRotation = this._safety.sessionRotation;

    this._pipeHandlers = new Map();
    this._stopHandle   = null;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async start() {
    const { singleSession, singleSessionPreAcquired, sessionGuard, cookieRefresher,
            fbSafety, antiSuspension, watchdog, sessionRotation } = this._safety;

    // session lock
    if (singleSession && !singleSessionPreAcquired && !singleSession.acquire()) {
      throw new Error(
        'MessengerClient.start(): جلسة أخرى تعمل بالفعل بهذا الحساب (session lock). ' +
        'أوقفها أولاً، أو مرّر lockPath مختلفاً.'
      );
    }

    if (sessionGuard && this.api._ctx)
      sessionGuard.attach(this.api._ctx, { onStale: (e) => this.emit('stale', e) });

    if (cookieRefresher && this.api._defaultFuncs)
      cookieRefresher.attach(this.api._ctx, this.api._defaultFuncs);

    this._healthServer.start();

    if (fbSafety && this.api._ctx)       fbSafety.attachSession(this.api._ctx).catch(() => {});
    if (antiSuspension && this.api._ctx) antiSuspension.start(this.api._ctx).catch(() => {});
    if (watchdog)                        watchdog.start();
    if (sessionRotation && this.api._ctx) sessionRotation.start(this.api._ctx).catch(() => {});

    const timeoutMs = this.options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let timer    = null;
      let settled  = false;

      const settle = (fn, val) => {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        fn(val);
      };

      timer = setTimeout(() => {
        singleSession?.release();
        settle(reject, new Error(
          `MessengerClient.start(): MQTT لم يتصل خلال ${timeoutMs}ms. ` +
          'تحقق من صحة الـ appState أو زد connectTimeoutMs.'
        ));
      }, timeoutMs);
      timer?.unref?.();

      this._stopHandle = this.api.listenMqtt((err, event) => {
        if (err) { this.emit('error', err); return; }
        sessionGuard?.heartbeat();
        watchdog?.heartbeat();
        this.metrics.onMessage();
        this._replayBuffer?.push(event);
        this._routeEvent(event);
      });

      this.once('ready', () => settle(resolve, this));
    });
  }

  async stop() {
    if (typeof this._stopHandle === 'function') this._stopHandle();
    this._stopHandle = null;

    try { await this._queue.drain(5000); } catch { /* تجاهل */ }

    try {
      const mc = this.api?._ctx?.mqttClient;
      if (mc?.connected) await new Promise((r) => mc.end(false, {}, r));
    } catch { /* تجاهل */ }

    const { fbSafety, antiSuspension, watchdog, sessionRotation,
            cookieRefresher, sessionGuard, singleSession } = this._safety;

    fbSafety?.stop?.();
    antiSuspension?.stop?.();
    watchdog?.stop?.();
    sessionRotation?.stop?.();
    cookieRefresher?.stop();
    sessionGuard?.stop();
    singleSession?.release();
    this._healthServer?.stop();
    this.emit('stop');
  }

  // ── Messaging API ─────────────────────────────────────────────────────

  send(msg, threadID) {
    return this._queue.enqueue(msg, threadID);
  }

  reply(msg, event) {
    const m = typeof msg === 'string' ? { body: msg } : msg;
    return this._queue.enqueue({ ...m, replyMessageID: event.messageID }, event.threadID);
  }

  react(reaction, messageID) {
    return new Promise((res, rej) =>
      this.api.setMessageReaction(reaction, messageID, (e) => (e ? rej(e) : res()))
    );
  }

  unsend(messageID, threadID) {
    return new Promise((res, rej) =>
      this.api.unsendMessage(messageID, threadID, (e) => (e ? rej(e) : res()))
    );
  }

  pin(messageID, threadID, pinned) {
    return new Promise((res, rej) => {
      if (typeof this.api.pinMessage !== 'function')
        return rej(new Error('pinMessage not available'));
      this.api.pinMessage(messageID, threadID, pinned, (e, r) => (e ? rej(e) : res(r)));
    });
  }

  // ── Middleware & Commands ─────────────────────────────────────────────

  use(middleware) {
    this._bot.use(middleware);
    return this;
  }

  hears(pattern, handler) {
    this._bot.hears(pattern, handler);
    return this;
  }

  command(name, handler, opts = {}) {
    this.commands.register(new Command(name, { ...opts, handler }));
    this._bot.command(name, async (ctx) => {
      const args = (ctx.text ?? '').trim().split(/\s+/).slice(1);
      await handler({ ...ctx, args });
    });
    return this;
  }

  async usePlugin(plugin) {
    await this.plugins.register(plugin);
    return this;
  }

  pipe(eventName, handler) {
    if (!this._pipeHandlers.has(eventName)) this._pipeHandlers.set(eventName, new Set());
    this._pipeHandlers.get(eventName).add(handler);
    return this;
  }

  unpipe(eventName, handler) {
    this._pipeHandlers.get(eventName)?.delete(handler);
    return this;
  }

  // ── Observability ─────────────────────────────────────────────────────

  getMetrics() {
    return {
      ...this.metrics.snapshot(),
      stealth:    this._stealth?.getStats?.()    ?? null,
      circuit:    this._circuitBreaker?.state    ?? null,
      queueStats: this._queue.stats,
    };
  }

  get queueStats() { return this._queue.stats; }

  replayEvents(filterFn) {
    if (!this._replayBuffer) return;
    const events = filterFn
      ? this._replayBuffer.toArray().filter(filterFn)
      : this._replayBuffer.toArray();
    for (const ev of events) this._routeEvent(ev);
  }

  // ── Event Routing (private) ───────────────────────────────────────────

  async _runPipes(eventName, event) {
    const handlers = this._pipeHandlers.get(eventName);
    if (!handlers) return true;
    for (const fn of handlers) {
      if (await fn(event) === false) return false;
    }
    return true;
  }

  async _routeEvent(event) {
    if (!event) return;
    const t = event.type;

    if (!await this._runPipes('*', event)) return;
    if (t && !await this._runPipes(t, event)) return;

    this.bus.emit('event', event);
    this.emit('update', event);
    this.emit('raw',    event);
    if (!t) return;

    if (t === 'message' || t === 'message_reply') {
      this.metrics.onMessage();
      this.emit('message',       event);
      this.emit('messageCreate', event);
      this.bus.emit('message',   event);

      this._bot.enqueueComposerIfNeeded(event);

      this.commands
        .dispatch(event.body ?? '', {
          senderID:  event.senderID,
          isGroup:   !!event.isGroup,
          api:       this.api,
          threadID:  event.threadID,
          messageID: event.messageID,
          event,
        }, [])
        .catch((e) => this.emit('error', e));
    }

    if (t === 'message_reply')   this.emit('message_reply', event);
    if (t === 'message_reaction') { this.emit('reaction', event); this.bus.emit('reaction', event); }
    if (t === 'message_unsend')  this.emit('unsend', event);
    if (t === 'typ')             this.emit(event.isTyping ? 'typingStart' : 'typingStop', event);
    if (t === 'read_receipt')    this.emit('readReceipt', event);
    if (t === 'event')           { this.emit('threadUpdate', event); this.bus.emit('threadUpdate', event); }
    if (t === 'ready')           { this.metrics.onConnect(); this.emit('ready', event); this.bus.emit('ready', event); }

    if (!KNOWN_EVENT_TYPES.has(t)) this.emit(t, event);
  }
}

// ── Factory Functions ─────────────────────────────────────────────────────

export function createMessengerClient(api, opts) {
  return new MessengerClient(api, opts);
}

/**
 * يُنشئ MessengerClient مع full safety setup: device profile، fingerprint، session lock.
 */
export async function loginWithFullSafety(loginOptions, opts = {}) {
  const deviceManager = createDeviceManager({
    filePath:       opts.deviceProfilePath,
    rotateOnStart:  opts.rotateDeviceOnStart,
  });
  await deviceManager.init();

  const fingerprint = new FingerprintGenerator().generate();

  const guard = opts.singleSessionGuard === false
    ? null
    : (opts.singleSessionGuardInstance || new SingleSessionGuard({
        lockPath:    opts.lockPath,
        staleAfterMs: opts.lockStaleAfterMs,
      }));

  if (guard && !guard.acquire()) {
    throw new Error('loginWithFullSafety(): جلسة أخرى تعمل بالفعل بهذا الحساب (session lock).');
  }

  let ctx;
  try {
    ctx = await loginAsync(loginOptions, {
      userAgent: deviceManager.userAgent,
      ...fingerprint.loginHints,
      ...(opts.fcaLoginOptions ?? {}),
    });
  } catch (err) {
    guard?.release();
    throw err;
  }

  const api = ctx.api;
  api._ctx              = ctx;
  api.__deviceManager   = deviceManager;
  api.__fingerprint     = fingerprint;

  if (opts.dismissScraping !== false && typeof dismissScrapingWarning === 'function') {
    try { await dismissScrapingWarning(api); } catch { /* غير فتال */ }
  }

  return new MessengerClient(api, {
    ...opts,
    singleSessionGuardInstance:   guard,
    singleSessionGuardPreAcquired: true,
  });
}

export default { MessengerClient, createMessengerClient, loginWithFullSafety };

// ─── Plugin Descriptor ────────────────────────────────────────────────────
/** @type {import('../plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-messenger-client',
  meta: { category: 'app', path: 'lib/app/messenger-client.js' },
  setup(_ctx) { /* provides: MessengerClient, createMessengerClient, loginWithFullSafety */ },
};
