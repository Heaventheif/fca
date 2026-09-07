/**
 * state.js — بناء وإدارة حالة جلسة FCA.
 *
 * الصادرات:
 *  - createDefaultContext  → السياق الأولي الفارغ
 *  - createStateStore      → يُضيف __set / __merge / __snapshot لأي كائن
 *  - createFcaState        → الحالة الكاملة بعد تسجيل الدخول
 *  - createApiFacade       → واجهة مُبسَّطة تُعرَض على المستخدم
 *  - attachThreadUpdater   → يربط تحديث قاعدة البيانات بالحالة
 */
import {
  getFacebookMqttClientId,
  getRandomWsReqStart,
  pickSessionProfile,
} from '../safety/stealth-profiles.js';

// ── السياق الافتراضي ───────────────────────────────────────────────

/**
 * أنشئ سياقاً ابتدائياً فارغاً مع ملف تخفٍّ عشوائي.
 * @returns {object}
 */
export const createDefaultContext = () => {
  const profile = pickSessionProfile(null);
  return {
    fbid:           '',
    clientId:       ((Math.random() * 2_147_483_648) | 0).toString(16),
    cookieString:   '',
    mqttClient:     null,
    _stealthProfile: profile,
    options: {
      logLevel:       'info',
      listenEvents:   false,
      selfListen:     false,
      updatePresence: false,
      forceLogin:     false,
      userAgent:      profile.userAgent,
    },
  };
};

// ── مخزن الحالة ───────────────────────────────────────────────────

/**
 * يُضيف مساعدات غير قابلة للعدّ إلى كائن الحالة:
 *  __set(key, value)  → يعيّن حقلاً ويُرجع القيمة
 *  __merge(patch)     → يدمج كائناً
 *  __snapshot()       → يُرجع نسخة ضحلة
 *
 * @param {object} initialState
 * @returns {object}
 */
export function createStateStore(initialState) {
  const state = Object.assign({}, initialState);

  const defineHidden = (name, fn) =>
    Object.defineProperty(state, name, {
      enumerable:   false,
      configurable: false,
      writable:     false,
      value:        fn,
    });

  defineHidden('__set', (key, value) => { state[key] = value; return value; });
  defineHidden('__merge', (patch) => { patch && typeof patch === 'object' && Object.assign(state, patch); return state; });
  defineHidden('__snapshot', () => ({ ...state }));

  return state;
}

// ── حالة FCA الكاملة ──────────────────────────────────────────────

/**
 * أنشئ حالة FCA الكاملة بعد إتمام تسجيل الدخول.
 *
 * @param {object} opts
 * @param {string}   opts.userID
 * @param {object}   opts.jar
 * @param {object}   opts.globalOptions
 * @param {string}   [opts.access_token]
 * @param {number}   [opts.lastSeqId]
 * @param {string}   [opts.mqttEndpoint]
 * @param {string}   [opts.region]
 * @param {string}   [opts.fb_dtsg]
 * @param {string}   [opts.clientID]
 * @param {string}   [opts.clientId]
 * @param {object}   [opts.emitter]
 * @param {Function} [opts.bypassAutomation]
 * @returns {object}
 */
export function createFcaState(opts) {
  const defaults = createDefaultContext();

  const state = createStateStore({
    ...defaults,
    userID:       opts.userID,
    fbid:         opts.userID || defaults.fbid,
    jar:          opts.jar,
    globalOptions: opts.globalOptions,
    options:      opts.globalOptions || defaults.options,
    loggedIn:     true,
    access_token: opts.access_token || 'NONE',
    mqttClient:   null,
    lastSeqId:    opts.lastSeqId,
    syncToken:    undefined,
    mqttEndpoint: opts.mqttEndpoint,
    region:       opts.region,
    firstListen:  true,
    fb_dtsg:      opts.fb_dtsg,
    clientID:     opts.clientID,
    clientId:     opts.clientId || getFacebookMqttClientId(opts.userID, null),
    wsReqNumber:  getRandomWsReqStart(),
    wsTaskNumber: 0,
    tasks:        new Map(),
    _emitter:     opts.emitter,
  });

  // الخيارات الفعّالة تأتي من globalOptions
  state.options = state.globalOptions || state.options;

  // ربط دالة تجاوز الأتمتة بالحالة إذا وُجدت
  if (typeof opts.bypassAutomation === 'function') {
    state.bypassAutomation = opts.bypassAutomation.bind(state);
  }

  return state;
}

// ── واجهة API للمستخدم ────────────────────────────────────────────

/**
 * أنشئ واجهة مُبسَّطة تُعرَض على المستخدم النهائي.
 *
 * @param {object} opts
 * @param {object}   opts.globalOptions
 * @param {object}   opts.jar
 * @param {string}   opts.userID
 * @param {object}   opts.emitter
 * @param {Function} opts.setOptions
 * @param {Function} opts.getAppState
 * @param {Function} opts.cookieHeaderFromJar
 * @param {Function} opts.getLatestBackup
 * @returns {object}
 */
export function createApiFacade({ globalOptions, jar, userID, emitter, setOptions, getAppState, cookieHeaderFromJar, getLatestBackup }) {
  return {
    setOptions:   setOptions.bind(null, globalOptions),
    getCookies:   () => cookieHeaderFromJar(jar),
    getAppState:  () => getAppState(jar),

    async getLatestAppStateFromDB(uid = userID) {
      const raw = await getLatestBackup(uid, 'appstate');
      return raw ? JSON.parse(raw) : null;
    },

    async getLatestCookieFromDB(uid = userID) {
      return getLatestBackup(uid, 'cookie');
    },

    on:                emitter.on.bind(emitter),
    once:              emitter.once.bind(emitter),
    off:               emitter.removeListener.bind(emitter),
    removeAllListeners: emitter.removeAllListeners.bind(emitter),
  };
}

// ── ربط محدِّث المحادثات بقاعدة البيانات ─────────────────────────

/**
 * يربط `state._updateThreadFromMessage` بنموذج Thread من Sequelize (إذا توفّر).
 *
 * @param {object}   state   - حالة FCA
 * @param {object}   models  - { Thread, ... }
 * @param {Function} log     - (msg, level) => void
 * @returns {boolean} true إذا جرى الربط بنجاح
 */
export function attachThreadUpdater(state, models, log) {
  try {
    const Thread = models?.Thread;
    if (!Thread) return false;

    state._updateThreadFromMessage = async (message) => {
      try {
        if (!message?.threadID) return;

        const threadID = String(message.threadID);
        let updated = 0;

        try {
          const result = await Thread.increment('messageCount', { by: 1, where: { threadID } });
          if (Array.isArray(result) && typeof result[0] === 'number') updated = result[0];
        } catch { /* تجاهل خطأ الزيادة */ }

        if (!updated) {
          try {
            await Thread.create({ threadID, messageCount: 1, data: { threadID } });
          } catch { /* تجاهل إذا كان موجوداً */ }
        }
      } catch (err) {
        log(`updateThreadFromMessage error: ${err?.message ?? String(err)}`, 'warn');
      }
    };

    return true;
  } catch {
    return false;
  }
}

export default { createStateStore, createFcaState, createApiFacade, attachThreadUpdater, createDefaultContext };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-core-state',
  meta: { category: 'core', path: 'lib/core/state.js' },
  setup(_ctx) {
    // provides: attachThreadUpdater, createApiFacade, createDefaultContext, createFcaState, createStateStore
  },
};
