let _SocksProxyAgent;

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

export async function buildSocksMqttAgent(socksUrl) {
  const SocksProxyAgent = await getSocksProxyAgent();
  return new SocksProxyAgent(socksUrl);
}

export async function patchCtxForSocks(ctx, socksUrl) {
  const agent = await buildSocksMqttAgent(socksUrl);
  ctx._socksAgent = agent;
  ctx._socksUrl = socksUrl;
  return agent;
}

export async function attachSocksMqtt(api, ctx, socksUrl) {
  await patchCtxForSocks(ctx, socksUrl);

  const originalListen = api.listenMqtt?.bind(api);
  if (!originalListen) throw new Error('[socks-mqtt] api.listenMqtt not found.');

  api.listenMqtt = function socksListen(callback) {
    
    
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

export async function rotateSocksProxy(ctx, newSocksUrl) {
  const newAgent = await buildSocksMqttAgent(newSocksUrl);
  ctx._socksAgent = newAgent;
  ctx._socksUrl = newSocksUrl;
  if (ctx.options?.wsOptions) {
    ctx.options.wsOptions.agent = newAgent;
  }
  return newAgent;
}

export default { buildSocksMqttAgent, patchCtxForSocks, attachSocksMqtt, rotateSocksProxy };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-socks-mqtt',
  meta: { category: 'utils', path: 'lib/utils/socks-mqtt.js' },
  setup(_ctx) {
    // provides: buildSocksMqttAgent, patchCtxForSocks, attachSocksMqtt, rotateSocksProxy
  },
};
