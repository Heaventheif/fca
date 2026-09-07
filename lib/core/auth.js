/**
 * auth.js — نقطة دخول تسجيل الدخول لـ FCA.
 *
 * الصادرات:
 *  - login          → متعدد الأشكال (credentials, options?, callback?)
 *  - loginAsync     → (credentials, options?) → Promise<ctx>
 *  - loginLegacy    → شكل قديم للتوافق
 *  - loginViaAPI    → تسجيل دخول عبر Access Token
 *  - tokensViaAPI   → استخراج التوكنات فقط
 *  - installProcessHandlers → يُثبَّت صراحةً، لا يُنفَّذ عند الاستيراد
 */
import logger          from '../func/logger.js';
import format          from '../utils/format/index.js';
import * as stateUtils from './state.js';
import * as requestUtils from './request.js';
import * as optUtils   from './options.js';
import * as configUtils from './config.js';
import loginHelper     from './login-helper.js';
import { pickSessionProfile } from '../safety/stealth-profiles.js';

const { getType } = format;

// ── تصنيف أخطاء العملية ───────────────────────────────────────────────────

const BENIGN_PATTERNS = [
  { test: (msg) => msg.includes('No Sequelize instance passed'), label: 'compat warning' },
];

const NETWORK_CODES   = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET']);
const NETWORK_PATTERN = /Connect Timeout|fetch failed|ECONNREFUSED|ENOTFOUND/;

/**
 * يُصنّف خطأ العملية: ignore | warn | fatal.
 */
function classifyProcessError(err) {
  const message = (err && (err.message || String(err))) || '';
  const code    = err?.code;

  for (const pattern of BENIGN_PATTERNS) {
    if (pattern.test(message)) return { action: 'ignore', message };
  }
  if ((code && NETWORK_CODES.has(code)) || NETWORK_PATTERN.test(message)) {
    return { action: 'warn', message };
  }
  return { action: 'fatal', message };
}

// ── معالجات أخطاء العملية ────────────────────────────────────────────────

async function runFlushHooks() {
  for (const hook of global.__fca_flush_hooks ?? []) {
    try { await hook(); } catch { /* تجاهل */ }
  }
}

/**
 * يُثبّت معالجات unhandledRejection/uncaughtException.
 * يُستدعى صراحةً من loginAsync — لا يُنفَّذ تلقائياً عند الاستيراد.
 *
 * @param {object} config - كائن الإعداد من loadConfig()
 */
export function installProcessHandlers(config) {
  if (config.processErrorHandlers !== true) return;
  if (global.__fca_handlers_installed) return;
  global.__fca_handlers_installed = true;
  global.__fca_flush_hooks        = global.__fca_flush_hooks ?? [];

  process.on('unhandledRejection', (err) => {
    try {
      const { action, message } = classifyProcessError(err);
      if (action === 'ignore') return;
      logger(`Unhandled promise rejection (non-fatal): ${message}`, action === 'warn' ? 'warn' : 'error');
    } catch { /* لا شيء */ }
  });

  process.on('uncaughtException', (err) => {
    try {
      const { action, message } = classifyProcessError(err);
      if (action === 'ignore') return;

      if (action === 'warn') {
        logger(`Uncaught network error (non-fatal): ${message}`, 'warn');
        return;
      }

      logger(`Uncaught exception (fatal): ${message}`, 'error');

      if (config.crashOnUnknownError === false) {
        logger('crashOnUnknownError=false — continuing (process may be in undefined state).', 'warn');
        return;
      }

      runFlushHooks().finally(() => process.exit(1));
    } catch {
      process.exit(1);
    }
  });
}

// ── أدوات appState ────────────────────────────────────────────────────────

/** يُحوّل مصفوفة appState إلى نص Cookie. */
function appStateToCookieString(appState) {
  if (!Array.isArray(appState)) return '';
  return appState
    .map((entry) => {
      const key   = entry?.key   || entry?.name;
      const value = entry?.value;
      return (key && value !== undefined && value !== null) ? `${key}=${value}` : null;
    })
    .filter(Boolean)
    .join('; ');
}

/** يستخرج FBID من مصفوفة appState. */
function appStateToFbid(appState) {
  if (!Array.isArray(appState)) return '';
  const cUser = appState.find((e) => e?.key === 'c_user' || e?.name === 'c_user');
  const iUser = appState.find((e) => e?.key === 'i_user' || e?.name === 'i_user');
  return String((cUser && cUser.value) || (iUser && iUser.value) || '');
}

// ── خيارات افتراضية ───────────────────────────────────────────────────────

const DEFAULT_OPTIONS = {
  selfListen:      false,
  selfListenEvent: false,
  listenEvents:    false,
  listenTyping:    false,
  updatePresence:  false,
  forceLogin:      false,
  autoMarkRead:    false,
  autoReconnect:   true,
  online:          true,
  emitReady:       false,
};

// ── مهلة تسجيل الدخول ─────────────────────────────────────────────────────

/**
 * يُلف Promise بمهلة زمنية. يُلغى التايمر تلقائياً عند الانتهاء.
 * @param {Promise<*>} promise
 * @param {number}     timeoutMs  - 0 أو سالب = بلا مهلة
 */
function withLoginTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Login timed out after ${timeoutMs}ms`)), timeoutMs);
    timer?.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ── loginAsync ─────────────────────────────────────────────────────────────

/**
 * سجِّل الدخول وأرجع سياق FCA كاملاً.
 *
 * @param {object} credentials
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function loginAsync(credentials, options = {}) {
  if (!credentials || typeof credentials !== 'object') {
    throw new TypeError('login requires an options object');
  }

  const { config } = configUtils.loadConfig();

  // تثبيت معالجات العملية هنا — لا عند الاستيراد
  installProcessHandlers(config);

  // تهيئة global fca namespace
  global.fca         = global.fca         || {};
  global.fca.config  = config;

  const ctx      = stateUtils.createDefaultContext();
  const resolved = { ...DEFAULT_OPTIONS };

  optUtils.setOptions(resolved, options);

  if (!resolved.userAgent) {
    resolved.userAgent = pickSessionProfile(null).userAgent;
  }

  ctx.options       = { ...ctx.options, ...resolved };
  ctx.globalOptions = resolved;
  ctx.cookieString  = appStateToCookieString(credentials.appState);
  ctx.fbid          = appStateToFbid(credentials.appState);
  ctx._request      = requestUtils.createRequestHelper(ctx);

  const runLogin = () =>
    new Promise((resolve, reject) => {
      loginHelper(
        credentials.appState,
        credentials.Cookie,
        credentials.email,
        credentials.password,
        resolved,
        (err, api) => (err ? reject(err) : resolve(api))
      );
    });

  const api = await withLoginTimeout(runLogin(), config.loginTimeoutMs);
  ctx.api   = api;

  try {
    if (typeof api.getCurrentUserID === 'function') {
      ctx.fbid   = String(api.getCurrentUserID() || ctx.fbid || '');
      ctx.userID = ctx.fbid;
    }
    if (typeof api.getCookies === 'function') {
      ctx.cookieString = String(api.getCookies() || ctx.cookieString || '');
    }
  } catch { /* لا يجب أن يوقف العملية */ }

  return ctx;
}

// ── أشكال تسجيل الدخول المتعددة ───────────────────────────────────────────

/**
 * شكل متعدد الأوجه:
 *   login(credentials)
 *   login(credentials, options)
 *   login(credentials, callback)
 *   login(credentials, options, callback)
 */
export function login(credentials, optionsOrCallback, maybeCallback) {
  if (typeof optionsOrCallback === 'function') {
    loginAsync(credentials, {})
      .then((ctx) => optionsOrCallback(null, ctx.api))
      .catch((err) => optionsOrCallback(err instanceof Error ? err : new Error(String(err?.message ?? err))));
    return;
  }

  if (typeof maybeCallback === 'function') {
    loginAsync(credentials, optionsOrCallback || {})
      .then((ctx) => maybeCallback(null, ctx.api))
      .catch((err) => maybeCallback(err instanceof Error ? err : new Error(String(err?.message ?? err))));
    return;
  }

  return loginAsync(credentials, optionsOrCallback || {});
}

/** شكل قديم للتوافق */
export function loginLegacy(credentials, options, callback) {
  if (getType(options) === 'Function' || getType(options) === 'AsyncFunction') {
    callback = options;
    options  = {};
  }

  const promise = loginAsync(credentials, options || {});

  if (typeof callback === 'function') {
    promise.then((ctx) => callback?.(null, ctx)).catch((err) => callback?.(err));
    return;
  }

  return promise;
}

// ── دوال مساعدة مُعاد تصديرها ─────────────────────────────────────────────

export const tokensViaAPI              = (...a) => loginHelper.tokensViaAPI(...a);
export const loginViaAPI               = (...a) => loginHelper.loginViaAPI(...a);
export const normalizeCookieHeaderString = (str) => loginHelper.normalizeCookieHeaderString(str);
export const setJarFromPairs           = (...a) => loginHelper.setJarFromPairs(...a);

export default login;

// ─── Plugin Descriptor ────────────────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-core-auth',
  meta: { category: 'core', path: 'lib/core/auth.js' },
  setup(_ctx) { /* provides: login, loginAsync, loginLegacy, loginViaAPI, tokensViaAPI, installProcessHandlers */ },
};
