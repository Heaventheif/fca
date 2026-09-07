import _gsLog from '../func/logAdapter.js';
export function registerGracefulShutdown(api, ctx, opts = {}) {
  const {
    logger = (msg, level = 'error') => _gsLog[level] ? _gsLog[level](msg) : _gsLog.error(msg),
    timeoutMs = 8_000,
    onShutdown = null,
    exitProcess = true,
  } = opts;

  let _shutting = false;

  async function shutdown(reason = 'signal') {
    if (_shutting) return;
    _shutting = true;

    const log = typeof logger === 'function' ? logger : (m) => {};
    log(`[graceful-shutdown] بدء الإغلاق (${reason})...`, 'info');

    
    const forceExit = setTimeout(() => {
      log('[graceful-shutdown] تجاوز المهلة — خروج قسري', 'warn');
      if (exitProcess) process.exit(1);
    }, timeoutMs);
    if (forceExit?.unref) forceExit.unref();

    try {
      
      if (api?._sendQueue?.drain) {
        log('[graceful-shutdown] تفريغ قائمة الإرسال...', 'info');
        await api._sendQueue.drain(Math.floor(timeoutMs * 0.4)).catch(() => {});
      }

      
      const mc = ctx?.mqttClient;
      if (mc?.connected) {
        log('[graceful-shutdown] قطع MQTT بشكل نظيف...', 'info');
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 3000);
          if (t?.unref) t.unref();
          mc.end(false, {}, () => {
            clearTimeout(t);
            resolve();
          });
        });
      }

      
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

  
  const sigHandler = (sig) => () => {
    logger(`[graceful-shutdown] استقبال ${sig}`, 'info');
    shutdown(sig).catch(() => {
      if (exitProcess) process.exit(1);
    });
  };

  process.once('SIGTERM', sigHandler('SIGTERM'));
  process.once('SIGINT', sigHandler('SIGINT'));

  return shutdown;
}

export function attachShutdownToClient(client, opts = {}) {
  const shutdown = registerGracefulShutdown(client.api, client.api?._ctx, {
    logger: opts.logger,
    timeoutMs: opts.timeoutMs ?? 8000,
    onShutdown: async (reason) => {
      await client.stop().catch(() => {});
      opts.onShutdown?.(reason);
    },
    exitProcess: opts.exitProcess !== false,
  });
  client._shutdown = shutdown;
  return shutdown;
}

export default { registerGracefulShutdown, attachShutdownToClient };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-graceful-shutdown',
  meta: { category: 'utils', path: 'lib/utils/graceful-shutdown.js' },
  setup(_ctx) {
    // provides: registerGracefulShutdown, attachShutdownToClient
  },
};
