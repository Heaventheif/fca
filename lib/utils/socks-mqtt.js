/**
 * socks-mqtt.js — تمكين SOCKS5 proxy للاتصال بـ MQTT
 *
 * fca-main-patched يدعم HTTP proxy فقط في الوقت الحالي.
 * هذا الملف يُضيف SOCKS5 (وTor) عبر socks-proxy-agent.
 *
 * الاستخدام:
 *   import { buildSocksMqttAgent } from './utils/socks-mqtt.js';
 *
 *   const agent = buildSocksMqttAgent('socks5://127.0.0.1:9050');
 *   api.setOptions({ socksAgent: agent }); // ← يستخدمه connect-mqtt
 *
 * أو مدمج مع login:
 *   import { patchLoginForSocks } from './utils/socks-mqtt.js';
 *   patchLoginForSocks(ctx, 'socks5://127.0.0.1:9050');
 */

let _SocksProxyAgent;

/**
 * تحميل socks-proxy-agent بشكل ديناميكي (lazy) لتجنب crash لو لم تُثبَّت.
 */
async function getSocksProxyAgent() {
  if (_SocksProxyAgent) return _SocksProxyAgent;
  try {
    const mod = await import('socks-proxy-agent');
    _SocksProxyAgent = mod.SocksProxyAgent ?? mod.default;
    return _SocksProxyAgent;
  } catch {
    throw new Error(
      '[socks-mqtt] socks-proxy-agent غير مُثبَّت.\nقم بتشغيل: npm install socks-proxy-agent'
    );
  }
}

/**
 * بناء SOCKS agent لاستخدامه مع WebSocket/MQTT
 * @param {string} socksUrl - مثل 'socks5://127.0.0.1:9050' أو 'socks4://proxy:1080'
 * @returns {Promise<SocksProxyAgent>}
 */
export async function buildSocksMqttAgent(socksUrl) {
  const SocksProxyAgent = await getSocksProxyAgent();
  return new SocksProxyAgent(socksUrl);
}

/**
 * Patch ctx لتفعيل SOCKS5 قبل الاتصال بـ MQTT.
 * يُضاف الـ agent إلى ctx._socksAgent ويُعدَّل buildProxy لاحقاً بواسطة connect-mqtt.
 *
 * @param {object} ctx      - FCA state context
 * @param {string} socksUrl - 'socks5://127.0.0.1:9050'
 * @returns {Promise<void>}
 */
export async function patchCtxForSocks(ctx, socksUrl) {
  const agent      = await buildSocksMqttAgent(socksUrl);
  ctx._socksAgent  = agent;
  ctx._socksUrl    = socksUrl;
  return agent;
}

/**
 * Patch api.listenMqtt لتمرير SOCKS agent إلى WebSocket Options.
 * يجب استدعاؤه بعد login وقبل listenMqtt.
 *
 * @param {object} api
 * @param {object} ctx
 * @param {string} socksUrl
 */
export async function attachSocksMqtt(api, ctx, socksUrl) {
  await patchCtxForSocks(ctx, socksUrl);

  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) throw new Error('[socks-mqtt] api.listenMqtt not found.');

  api.listenMqtt = function socksListen(callback) {
    // Inject agent into ctx for connect-mqtt to pick up
    // connect-mqtt passes wsOptions to `new WebSocket(url, { agent })`
    if (ctx._socksAgent && !ctx._wsAgentPatchApplied) {
      ctx._wsAgentPatchApplied = true;
      const origOptions = ctx.options ?? {};
      ctx.options = {
        ...origOptions,
        wsOptions: {
          ...(origOptions.wsOptions ?? {}),
          agent: ctx._socksAgent,
        },
      };
    }
    return originalListen(callback);
  };

  return ctx._socksAgent;
}

/**
 * تبديل بروكسي SOCKS بدون إعادة تشغيل — يُغيّر الـ agent للاتصال القادم.
 * @param {object} ctx
 * @param {string} newSocksUrl
 */
export async function rotateSocksProxy(ctx, newSocksUrl) {
  const newAgent   = await buildSocksMqttAgent(newSocksUrl);
  ctx._socksAgent  = newAgent;
  ctx._socksUrl    = newSocksUrl;
  if (ctx.options?.wsOptions) {
    ctx.options.wsOptions.agent = newAgent;
  }
  return newAgent;
}

export default { buildSocksMqttAgent, patchCtxForSocks, attachSocksMqtt, rotateSocksProxy };
