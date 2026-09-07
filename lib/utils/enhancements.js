import { ThreadSendQueue } from './send-queue.js';
import { createFcaInflightCaches, wrapApiWithInflight } from './inflight-cache.js';
import { createLogger } from './structured-logger.js';
import { registerGracefulShutdown } from './graceful-shutdown.js';

export function applyEnhancements(api, ctx, opts = {}) {
  const {
    sendQueue = true,
    inflightCache = true,
    structuredLogger = true,
    gracefulShutdown = false,
    interMsgDelay = 300,
    logLevel = process.env.FCA_LOG_LEVEL ?? 'info',
    logJson = process.env.FCA_LOG_JSON === '1',
    onShutdown = null,
  } = opts;

  const result = {};
  const userID = ctx?.userID ?? ctx?.fbid ?? api?.getCurrentUserID?.() ?? '';

  if (structuredLogger) {
    const logger = createLogger({ userID, level: logLevel, json: logJson });
    result.logger = logger;
    
    if (ctx) ctx._logger = logger;
  }

  if (sendQueue && !api._sendQueue) {
    const queue = ThreadSendQueue.attachTo(api, { interMsgDelay });
    result.queue = queue;
  } else if (api._sendQueue) {
    result.queue = api._sendQueue;
  }

  if (inflightCache) {
    const caches = createFcaInflightCaches();
    wrapApiWithInflight(api, caches);
    result.inflight = caches;
  }

  if (gracefulShutdown) {
    const shutdown = registerGracefulShutdown(api, ctx, {
      logger: result.logger,
      timeoutMs: opts.shutdownTimeoutMs ?? 8000,
      onShutdown,
      exitProcess: opts.exitProcess !== false,
    });
    result.shutdown = shutdown;
  }

  return result;
}

export default applyEnhancements;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-enhancements',
  meta: { category: 'utils', path: 'lib/utils/enhancements.js' },
  setup(_ctx) {
    // provides: applyEnhancements
  },
};
