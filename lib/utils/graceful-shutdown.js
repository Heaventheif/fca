/**
 * graceful-shutdown.js — إغلاق نظيف للعملية
 *
 * FIX-09: عند SIGTERM/SIGINT:
 *   - السلوك الحالي: kill مفاجئ → Facebook يرى انقطاع غير نظيف → يُسرّع ban
 *   - السلوك الجديد: MQTT disconnect نظيف → انتظار flush الـ queues → خروج آمن
 *
 * الفرق من الـ bot المُطوَّل: بدل 3 ثوانٍ معلقة في الهواء يُغلق الاتصال
 * بمصافحة MQTT صحيحة. Facebook يعامل هذا كـ "client disconnected gracefully"
 * ويحتسب الـ session كمغلقة طبيعياً دون تشغيل منطق الـ suspicious disconnect.
 *
 * Usage:
 *   import { registerGracefulShutdown } from './utils/graceful-shutdown.js';
 *   const shutdown = registerGracefulShutdown(api, ctx, { logger, timeoutMs: 8000 });
 *   // عند SIGTERM/SIGINT يُشغَّل تلقائياً
 *   // يمكن تشغيله يدوياً: await shutdown('manual');
 */

/**
 * @param {object}   api      - FCA api object
 * @param {object}   ctx      - FCA state context
 * @param {object}   opts
 * @param {function}   opts.logger      - دالة للسجلات
 * @param {number}     opts.timeoutMs   - أقصى وقت للإغلاق (default: 8000ms)
 * @param {function}   opts.onShutdown  - callback إضافي قبل الخروج
 * @param {boolean}    opts.exitProcess - هل نستدعي process.exit() (default: true)
 * @returns {function} shutdown(reason?) → Promise<void>
 */
export function registerGracefulShutdown(api, ctx, opts = {}) {
  const {
    logger     = console.error.bind(console),
    timeoutMs  = 8_000,
    onShutdown = null,
    exitProcess = true,
  } = opts;

  let _shutting = false;

  async function shutdown(reason = 'signal') {
    if (_shutting) return;
    _shutting = true;

    const log = typeof logger === 'function' ? logger : (m) => {};
    log(`[graceful-shutdown] بدء الإغلاق (${reason})...`, 'info');

    // مهلة زمنية: لا ننتظر أبداً أكثر من timeoutMs
    const forceExit = setTimeout(() => {
      log('[graceful-shutdown] تجاوز المهلة — خروج قسري', 'warn');
      if (exitProcess) process.exit(1);
    }, timeoutMs);
    if (forceExit?.unref) forceExit.unref();

    try {
      // 1. انتظر إرسال الرسائل المعلقة
      if (api?._sendQueue?.drain) {
        log('[graceful-shutdown] تفريغ قائمة الإرسال...', 'info');
        await api._sendQueue.drain(Math.floor(timeoutMs * 0.4)).catch(() => {});
      }

      // 2. MQTT disconnect نظيف (PINGRESP + DISCONNECT packet)
      const mc = ctx?.mqttClient;
      if (mc?.connected) {
        log('[graceful-shutdown] قطع MQTT بشكل نظيف...', 'info');
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 3000);
          if (t?.unref) t.unref();
          mc.end(false, {}, () => { clearTimeout(t); resolve(); });
        });
      }

      // 3. callback مخصص (حفظ AppState، flush DB، إلخ)
      if (typeof onShutdown === 'function') {
        await onShutdown(reason);
      }

      log('[graceful-shutdown] اكتمل الإغلاق النظيف ✓', 'info');
    } catch (err) {
      log(`[graceful-shutdown] خطأ أثناء الإغلاق: ${err?.message ?? err}`, 'warn');
    } finally {
      clearTimeout(forceExit);
      if (exitProcess) process.exit(0);
    }
  }

  // تسجيل handlers — مرة واحدة فقط عبر process.once
  const sigHandler = (sig) => () => {
    logger(`[graceful-shutdown] استقبال ${sig}`, 'info');
    shutdown(sig).catch(() => { if (exitProcess) process.exit(1); });
  };

  process.once('SIGTERM', sigHandler('SIGTERM'));
  process.once('SIGINT',  sigHandler('SIGINT'));

  return shutdown;
}

/**
 * helper بسيط: ربط مع MessengerClient مباشرة
 *
 * @param {MessengerClient} client
 * @param {object}          opts
 */
export function attachShutdownToClient(client, opts = {}) {
  const shutdown = registerGracefulShutdown(
    client.api,
    client.api?._ctx,
    {
      logger:    opts.logger,
      timeoutMs: opts.timeoutMs ?? 8000,
      onShutdown: async (reason) => {
        await client.stop().catch(() => {});
        opts.onShutdown?.(reason);
      },
      exitProcess: opts.exitProcess !== false,
    }
  );
  client._shutdown = shutdown;
  return shutdown;
}

export default { registerGracefulShutdown, attachShutdownToClient };
