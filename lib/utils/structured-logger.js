/**
 * structured-logger.js — مسجّل منظّم بدون تبعيات
 *
 * FIX-08: السجلات الحالية نصوص حرة بدون context.
 *          هذا يجعل debugging في multi-bot environments مستحيلاً.
 *
 * هذا المسجّل يُضيف:
 *  - userID ثابت لكل جلسة (يساعد في تتبع الـ bot المشكلة)
 *  - level قابل للتحكم (debug/info/warn/error)
 *  - timestamp ISO بدل أي تنسيق آخر
 *  - JSON mode للنشر الإنتاجي (يُلغي الألوان)
 *  - لا يحتوي على console.log مباشر — يُمرر للـ output function
 *
 * Usage:
 *   import { createLogger } from './utils/structured-logger.js';
 *   const log = createLogger({ userID: '123456', level: 'info' });
 *   log('MQTT connected', 'info');
 *   log.child({ threadID: 'tid' })('message received', 'debug');
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, sys: 1, success: 1 };

const COLORS = {
  debug:   '\x1b[36m', // cyan
  info:    '\x1b[34m', // blue
  warn:    '\x1b[33m', // yellow
  error:   '\x1b[31m', // red
  success: '\x1b[32m', // green
  sys:     '\x1b[35m', // magenta
  reset:   '\x1b[0m',
};

/**
 * @param {object}   opts
 * @param {string}     opts.userID    - UID للجلسة (للـ context)
 * @param {string}     opts.level     - أدنى مستوى ('debug'|'info'|'warn'|'error')
 * @param {boolean}    opts.json      - JSON output (للإنتاج)
 * @param {boolean}    opts.colors    - ألوان ANSI (default: !json)
 * @param {function}   opts.output    - دالة الإخراج (default: process.stderr.write)
 * @param {object}     opts.context   - حقول إضافية تُرفق بكل سجل
 * @returns {function} log(message, level?, extra?)
 */
export function createLogger(opts = {}) {
  const {
    userID  = '',
    level   = 'info',
    json    = false,
    colors  = !json && process.stderr.isTTY,
    output  = (line) => process.stderr.write(line + '\n'),
    context = {},
  } = opts;

  const minLevel = LEVELS[level] ?? LEVELS.info;

  function write(message, lvl = 'info', extra = {}) {
    const numLevel = LEVELS[lvl] ?? LEVELS.info;
    if (numLevel < minLevel) return;

    const ts  = new Date().toISOString();
    const ctx = { ...context, ...(userID ? { userID } : {}), ...extra };

    if (json) {
      const entry = { ts, level: lvl, message, ...ctx };
      output(JSON.stringify(entry));
      return;
    }

    // Human-readable
    const color  = colors ? (COLORS[lvl] ?? '') : '';
    const reset  = colors ? COLORS.reset : '';
    const tag    = `[${lvl.toUpperCase().padEnd(7)}]`;
    const uid    = userID ? ` [uid:${userID}]` : '';
    const ctxStr = Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : '';
    output(`${color}${ts} ${tag}${uid} ${message}${ctxStr}${reset}`);
  }

  // Alias للـ legacy logger API (fca يستدعي logger(message, level))
  function log(message, level = 'info', extra = {}) {
    write(message, level, extra);
  }

  /** إنشاء logger فرعي يرث الـ context ويضيف حقولاً جديدة */
  log.child = (extraContext) => createLogger({
    ...opts,
    context: { ...context, ...extraContext },
    userID,
  });

  log.debug   = (msg, extra) => write(msg, 'debug',   extra);
  log.info    = (msg, extra) => write(msg, 'info',    extra);
  log.warn    = (msg, extra) => write(msg, 'warn',    extra);
  log.error   = (msg, extra) => write(msg, 'error',   extra);
  log.success = (msg, extra) => write(msg, 'success', extra);
  log.sys     = (msg, extra) => write(msg, 'sys',     extra);

  // showBanner / startSpinner / etc. — stubs للتوافق مع الكود القاديم
  log.showBanner          = async () => {};
  log.startSpinner        = async (text) => ({ succeed: () => {}, fail: () => {}, stopAndPersist: () => {} });
  log.persistCheckpointOk = () => {};
  log.persistLoginSuccess = () => {};
  log.persistLoginFail    = () => {};
  log.runMethodLoadProgress = async () => {};

  return log;
}

/**
 * مسجّل افتراضي للاستخدام خارج session context
 * (يُستخدم عند import مباشر دون إنشاء)
 */
export const defaultLogger = createLogger({ level: process.env.FCA_LOG_LEVEL || 'info' });

export default createLogger;
