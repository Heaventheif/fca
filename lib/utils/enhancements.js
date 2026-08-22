/**
 * enhancements.js — نقطة تفعيل موحّدة لكل التحسينات بعد login
 *
 * FIX-12: إضافة:
 *   - InflightCache: deduplication لـ getThreadInfo/getUserInfo
 *   - Structured logger: يستبدل console.log الأولية
 *   - ThreadSendQueue: إن لم يكن مُفعّلاً
 *   - registerGracefulShutdown: اختياري
 *
 * Usage:
 *   import { applyEnhancements } from './utils/enhancements.js';
 *   const enhanced = applyEnhancements(api, ctx, opts);
 */

import { ThreadSendQueue }           from './send-queue.js';
import { createFcaInflightCaches, wrapApiWithInflight } from './inflight-cache.js';
import { createLogger }              from './structured-logger.js';
import { registerGracefulShutdown } from './graceful-shutdown.js';

/**
 * تطبيق كل التحسينات دفعة واحدة على api object بعد login
 *
 * @param {object}  api   - FCA api object
 * @param {object}  ctx   - FCA state context (api._ctx)
 * @param {object}  opts
 * @param {boolean}   opts.sendQueue           - تفعيل ThreadSendQueue (default: true)
 * @param {boolean}   opts.inflightCache       - تفعيل in-flight dedup (default: true)
 * @param {boolean}   opts.structuredLogger    - تفعيل structured logger (default: true)
 * @param {boolean}   opts.gracefulShutdown    - تفعيل graceful SIGTERM (default: false)
 * @param {number}    opts.interMsgDelay       - ms بين رسائل نفس الـ thread (default: 300)
 * @param {string}    opts.logLevel            - مستوى السجلات (default: 'info')
 * @param {boolean}   opts.logJson             - JSON output للإنتاج (default: false)
 * @param {function}  opts.onShutdown          - callback إضافي قبل process.exit
 * @returns {object} enhanced = { queue, inflight, logger, shutdown }
 */
export function applyEnhancements(api, ctx, opts = {}) {
  const {
    sendQueue        = true,
    inflightCache    = true,
    structuredLogger = true,
    gracefulShutdown = false,
    interMsgDelay    = 300,
    logLevel         = process.env.FCA_LOG_LEVEL ?? 'info',
    logJson          = process.env.FCA_LOG_JSON  === '1',
    onShutdown       = null,
  } = opts;

  const result = {};
  const userID = ctx?.userID ?? ctx?.fbid ?? api?.getCurrentUserID?.() ?? '';

  // ── 1. Structured Logger ──────────────────────────────────────────────────
  if (structuredLogger) {
    const logger = createLogger({ userID, level: logLevel, json: logJson });
    result.logger = logger;
    // يُخزَّن في ctx حتى يستطيع func/logger.js استخدامه
    if (ctx) ctx._logger = logger;
  }

  // ── 2. ThreadSendQueue ────────────────────────────────────────────────────
  if (sendQueue && !api._sendQueue) {
    const queue = ThreadSendQueue.attachTo(api, { interMsgDelay });
    result.queue = queue;
  } else if (api._sendQueue) {
    result.queue = api._sendQueue;
  }

  // ── 3. In-Flight Cache ────────────────────────────────────────────────────
  if (inflightCache) {
    const caches = createFcaInflightCaches();
    wrapApiWithInflight(api, caches);
    result.inflight = caches;
  }

  // ── 4. Graceful Shutdown ──────────────────────────────────────────────────
  if (gracefulShutdown) {
    const shutdown = registerGracefulShutdown(api, ctx, {
      logger:     result.logger,
      timeoutMs:  opts.shutdownTimeoutMs ?? 8000,
      onShutdown,
      exitProcess: opts.exitProcess !== false,
    });
    result.shutdown = shutdown;
  }

  return result;
}

export default applyEnhancements;
