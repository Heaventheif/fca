const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, sys: 1, success: 1 };

const COLORS = {
  debug: '\x1b[36m', 
  info: '\x1b[34m', 
  warn: '\x1b[33m', 
  error: '\x1b[31m', 
  success: '\x1b[32m', 
  sys: '\x1b[35m', 
  reset: '\x1b[0m',
};

export function createLogger(opts = {}) {
  const {
    userID = '',
    level = 'info',
    json = false,
    colors = !json && process.stderr.isTTY,
    output = (line) => process.stderr.write(line + '\n'),
    context = {},
  } = opts;

  const minLevel = LEVELS[level] ?? LEVELS.info;

  function write(message, lvl = 'info', extra = {}) {
    const numLevel = LEVELS[lvl] ?? LEVELS.info;
    if (numLevel < minLevel) return;

    const ts = new Date().toISOString();
    const ctx = { ...context, ...(userID ? { userID } : {}), ...extra };

    if (json) {
      const entry = { ts, level: lvl, message, ...ctx };
      output(JSON.stringify(entry));
      return;
    }

    
    const color = colors ? (COLORS[lvl] ?? '') : '';
    const reset = colors ? COLORS.reset : '';
    const tag = `[${lvl.toUpperCase().padEnd(7)}]`;
    const uid = userID ? ` [uid:${userID}]` : '';
    const ctxStr = Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : '';
    output(`${color}${ts} ${tag}${uid} ${message}${ctxStr}${reset}`);
  }

  
  function log(message, level = 'info', extra = {}) {
    write(message, level, extra);
  }

  
  log.child = (extraContext) =>
    createLogger({
      ...opts,
      context: { ...context, ...extraContext },
      userID,
    });

  log.debug = (msg, extra) => write(msg, 'debug', extra);
  log.info = (msg, extra) => write(msg, 'info', extra);
  log.warn = (msg, extra) => write(msg, 'warn', extra);
  log.error = (msg, extra) => write(msg, 'error', extra);
  log.success = (msg, extra) => write(msg, 'success', extra);
  log.sys = (msg, extra) => write(msg, 'sys', extra);

  
  log.showBanner = async () => {};
  log.startSpinner = async (text) => ({
    succeed: () => {},
    fail: () => {},
    stopAndPersist: () => {},
  });
  log.persistCheckpointOk = () => {};
  log.persistLoginSuccess = () => {};
  log.persistLoginFail = () => {};
  log.runMethodLoadProgress = async () => {};

  return log;
}

export const defaultLogger = createLogger({ level: process.env.FCA_LOG_LEVEL || 'info' });

export default createLogger;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-structured-logger',
  meta: { category: 'utils', path: 'lib/utils/structured-logger.js' },
  setup(_ctx) {
    // provides: createLogger, defaultLogger
  },
};
