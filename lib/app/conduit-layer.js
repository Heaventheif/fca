/**
 * conduit-layer.js — طبقة middleware بأسماء أحداث بشرية فوق MessengerClient
 *
 * مستوحى من زنكيا/conduit مع إضافات:
 *  - nextLogNormal بدل setTimeout ثابت في send/reply/react
 *  - CircuitBreaker مدمج لكل thread
 *  - fan-out: threadUpdate → 8 أحداث منفصلة
 *  - enrich() يضيف send/reply/react/pin تلقائياً لكل event
 *  - middleware chain (next() pattern مثل Koa)
 *
 * Usage:
 *   import { ConduitLayer } from './app/conduit-layer.js';
 *   const layer = new ConduitLayer(messengerClient, api);
 *   layer.on('message:create', async (ctx, next) => {
 *     await ctx.reply('مرحباً!');
 *     await next();
 *   });
 */

import { nextLogNormal } from '../utils/human-timing.js';
import logger            from '../func/logger.js';

// خريطة: اسم conduit → اسم FCA
const FCA_EVENT_MAP = {
  'message:create':         'message',
  'message:remove':         'message_unsend',
  'message:react':          'message_reaction',
  'message:respond':        'message_reply',
  'message:writing':        'typ',
  'message:read':           'read_receipt',
  'user:join':              'threadUpdate',
  'user:leave':             'threadUpdate',
  'thread:update':          'threadUpdate',
  'thread:title_change':    'threadUpdate',
  'thread:photo_replaced':  'threadUpdate',
  'thread:theme_changed':   'threadUpdate',
  'thread:nickname_changed':'threadUpdate',
  'thread:admin_changed':   'threadUpdate',
};

// أحداث threadUpdate المُفرَّعة حسب logMessageType
const LOG_TYPE_MAP = {
  'log:subscribe':    'user:join',
  'log:unsubscribe':  'user:leave',
  'log:thread-name':  'thread:title_change',
  'log:thread-image': 'thread:photo_replaced',
  'log:thread-color': 'thread:theme_changed',
  'log:user-nickname':'thread:nickname_changed',
  'log:thread-admins':'thread:admin_changed',
};

const FANOUT_EVENTS = new Set(Object.keys(LOG_TYPE_MAP).map(k => LOG_TYPE_MAP[k])
  .concat(['thread:update']));

const REPLYABLE = new Set(['message:create', 'message:respond']);

export class ConduitLayer {
  /**
   * @param {object} client - MessengerClient instance
   * @param {object} api    - FCA api object
   * @param {object} opts
   * @param {object}   opts.circuitBreaker  - اختياري: CircuitBreaker instance
   * @param {object}   opts.antiSuspension  - اختياري: AntiSuspension instance
   */
  constructor(client, api, opts = {}) {
    this._client   = client;
    this._api      = api;
    this._cb       = opts.circuitBreaker  ?? null;
    this._anti     = opts.antiSuspension  ?? null;
    this._stacks   = new Map();  // event → [middleware, ...]
    this._fanBound = false;
  }

  /**
   * تسجيل middleware لحدث معين
   * @param {string}   event        - اسم الحدث (مثل 'message:create')
   * @param {...function} handlers  - دوال middleware
   */
  on(event, ...handlers) {
    if (!this._stacks.has(event)) {
      this._stacks.set(event, []);
      if (FANOUT_EVENTS.has(event)) this._bindFanOut();
      else                          this._bindDirect(event);
    }
    this._stacks.get(event).push(...handlers);
    return this;
  }

  // ── ربط مباشر ────────────────────────────────────────────────────────────
  _bindDirect(conduitEvent) {
    const fcaEvent = FCA_EVENT_MAP[conduitEvent];
    if (!fcaEvent) return;
    this._client.on(fcaEvent, async raw => {
      await this._run(conduitEvent, raw);
    });
  }

  // ── fan-out: threadUpdate → أحداث فرعية ───────────────────────────────
  _bindFanOut() {
    if (this._fanBound) return;
    this._fanBound = true;
    this._client.on('threadUpdate', async raw => {
      // حدث الـ catch-all
      await this._run('thread:update', raw);
      // حدث محدد حسب logMessageType
      const sub = LOG_TYPE_MAP[raw?.logMessageType];
      if (sub) await this._run(sub, raw);
    });
  }

  // ── تشغيل سلسلة middleware ────────────────────────────────────────────
  async _run(event, raw) {
    const stack = this._stacks.get(event);
    if (!stack?.length) return;
    const ctx = this._enrich(event, raw);
    let i = 0;
    const next = async () => {
      if (i < stack.length) await stack[i++](ctx, next);
    };
    try { await next(); }
    catch(e) { logger(`[ConduitLayer] خطأ في ${event}: ${e?.message}`, 'error'); }
  }

  // ── إثراء الحدث بـ send/reply/react ─────────────────────────────────
  _enrich(event, raw) {
    const tid = raw?.threadID;
    const mid = raw?.messageID;
    const api = this._api;

    // تأخير human-like: log-normal بدل setTimeout ثابت
    const humanDelay = (median = 600) =>
      new Promise(r => setTimeout(r, nextLogNormal(median, 0.4)));

    // Gate: CircuitBreaker + AntiSuspension
    const gate = async () => {
      if (this._cb)   this._cb.canAttempt();
      if (this._anti) await this._anti.gate();
    };

    // دالة إرسال مشتركة
    const sendMsg = async (body, replyTo) => {
      await gate();
      // مؤشر الكتابة أولاً بتأخير human-like
      try { await new Promise(r => api.sendTypingIndicator(tid, r)); } catch { /* ignore */ }
      await humanDelay(700);
      return new Promise((res, rej) => {
        const msg = typeof body === 'string' ? { body } : body;
        const cb  = (e, d) => { e ? rej(e) : res(d); };
        replyTo ? api.sendMessage(msg, tid, cb, replyTo) : api.sendMessage(msg, tid, cb);
      });
    };

    const base = {
      ...raw,
      send:  body => sendMsg(body),
    };

    if (REPLYABLE.has(event)) {
      return {
        ...base,
        reply: body => sendMsg(body, mid),
        react: async emoji => {
          await gate();
          await humanDelay(400);  // log-normal بدل sleep(500,700)
          return new Promise((res, rej) =>
            api.setMessageReaction(emoji, mid, tid, e => e ? rej(e) : res())
          );
        },
        unsend: () => new Promise((res, rej) =>
          api.unsendMessage(mid, tid, e => e ? rej(e) : res())
        ),
      };
    }

    if (event.startsWith('thread:') || event.startsWith('user:')) {
      return {
        ...base,
        addUser:    uid => new Promise((res,rej) => api.addUserToGroup(uid, tid, e => e?rej(e):res())),
        removeUser: uid => new Promise((res,rej) => api.removeUserFromGroup(uid, tid, e => e?rej(e):res())),
        setTitle:   t   => new Promise((res,rej) => api.setTitle(t, tid, e => e?rej(e):res())),
        setAdmin:  (uid, isAdmin) => new Promise((res,rej) => api.changeAdminStatus(uid, tid, isAdmin, e => e?rej(e):res())),
      };
    }

    return base;
  }

  /** إيقاف كل الـ listeners */
  destroy() {
    this._stacks.clear();
    this._fanBound = false;
  }
}

export function createConduitLayer(client, api, opts) {
  return new ConduitLayer(client, api, opts);
}

export default ConduitLayer;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-conduit-layer',
  meta: { category: 'app', path: 'lib/app/conduit-layer.js' },
  setup(_ctx) {
    // provides: ConduitLayer, createConduitLayer
  },
};
