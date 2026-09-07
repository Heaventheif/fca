import { createRequire } from 'node:module';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { decompressResponse } from './decompress.js';
import { applyAgentToFetchInit } from '../runtime.js';

const require = createRequire(import.meta.url);
const toughCookie = require('tough-cookie');

export const jar = new toughCookie.CookieJar();

let _proxyUrl = null;

let _proxyAgent = null;

export function setClientProxy(url) {
  _proxyUrl = url || null;
  if (!_proxyUrl) {
    _proxyAgent = null;
    return;
  }
  const lc = _proxyUrl.toLowerCase();
  if (lc.startsWith('socks5://') || lc.startsWith('socks4://')) {
    _proxyAgent = new SocksProxyAgent(_proxyUrl);
  } else {
    
    _proxyAgent = new HttpsProxyAgent(_proxyUrl);
  }
}

function resolveAgent(options) {
  
  if (options?.proxyUrl) {
    const lc = options.proxyUrl.toLowerCase();
    return lc.startsWith('socks')
      ? new SocksProxyAgent(options.proxyUrl)
      : new HttpsProxyAgent(options.proxyUrl);
  }
  return _proxyAgent;
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    
    return [...new Set(response.headers.getSetCookie())];
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

async function applyCookiesFromResponse(response, url, cookieJar) {
  const cookies = getSetCookieHeaders(response);
  await Promise.all(
    cookies.map((c) =>
      cookieJar.setCookie(c, url).catch(() => {
        
      })
    )
  );
}

function headersToObject(headers) {
  const obj = {};
  headers.forEach((value, key) => {
    obj[key] = value;
  });
  return obj;
}

async function parseResponseBody(response, options) {
  const type = options?.responseType;
  if (type === 'stream') return response.body;

  
  const encoding = response.headers.get('content-encoding');
  let bodyBuffer;
  if (encoding && encoding !== 'identity') {
    bodyBuffer = Buffer.from(await response.arrayBuffer());
    try {
      bodyBuffer = await decompressResponse(bodyBuffer, encoding);
    } catch {
      
    }
  }

  if (type === 'arraybuffer') {
    return bodyBuffer ?? Buffer.from(await response.arrayBuffer());
  }

  const text = bodyBuffer ? bodyBuffer.toString('utf8') : await response.text();

  const ct = response.headers.get('content-type') ?? '';
  if (ct.includes('application/json') || type === 'json') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function buildUrlWithParams(url, params) {
  if (!params || typeof params !== 'object') return url;
  const qs = new URLSearchParams();
  for (const key of Object.keys(params)) {
    const val = params[key];
    if (val != null) qs.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
  }
  const str = qs.toString();
  return str ? `${url}${url.includes('?') ? '&' : '?'}${str}` : url;
}

function normalizeNetworkError(err, config, url) {
  const msg = err && err.message ? err.message : 'Network Error';
  const wrapped = new Error(msg);
  wrapped.code = err?.name === 'AbortError' ? 'ETIMEDOUT' : (err?.code ?? 'ERR_NETWORK');
  wrapped.config = { ...config, url };
  wrapped.originalError = err;
  return wrapped;
}

export async function doRequest(method, url, bodyOrParams, optionsOrUndef) {
  const isBodyMethod = ['post', 'put', 'patch'].includes(method);
  const body = isBodyMethod ? bodyOrParams : undefined;
  const options = (isBodyMethod ? optionsOrUndef : bodyOrParams) ?? {};

  const cookieJar = options.jar ?? jar;
  const fullUrl = buildUrlWithParams(url, options.params);

  
  const headers = { ...(options.headers ?? {}) };

  
  try {
    const cookieStr = await cookieJar.getCookieString(fullUrl);
    if (cookieStr) headers.Cookie = cookieStr;
  } catch {
    
  }

  
  const init = {
    method: method.toUpperCase(),
    headers,
    redirect: 'follow',
  };

  if (body != null) init.body = body;

  
  
  
  
  
  const agent = resolveAgent(options);
  // applyAgentToFetchInit يُضيف agent/dispatcher على Node فقط.
  // على Bun يُعيد init كما هو لأن Bun يقرأ HTTPS_PROXY/HTTP_PROXY تلقائياً.
  Object.assign(init, applyAgentToFetchInit({}, agent));

  
  const timeoutMs = options.timeout ?? 60000;
  let abortController = null;
  let timeoutId = null;

  if (timeoutMs > 0) {
    abortController = new AbortController();
    init.signal = abortController.signal;
    timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
    if (timeoutId?.unref) timeoutId.unref();
  }

  let response;
  try {
    response = await fetch(fullUrl, init);
  } catch (err) {
    throw normalizeNetworkError(err, options, fullUrl);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  
  await applyCookiesFromResponse(response, fullUrl, cookieJar);

  
  const data = await parseResponseBody(response, options);

  return {
    status: response.status,
    statusText: response.statusText,
    headers: headersToObject(response.headers),
    data,
    config: { ...options, url: fullUrl, method },
    request: { res: { responseUrl: response.url } },
    url: response.url,
  };
}

export const client = {
  get: (url, opts) => doRequest('get', url, opts),
  post: (url, body, opts) => doRequest('post', url, body, opts),
  put: (url, body, opts) => doRequest('put', url, body, opts),
  patch: (url, body, opts) => doRequest('patch', url, body, opts),
  defaults: { httpAgent: undefined, httpsAgent: undefined, proxy: false },
};

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createRequestCore(contextJar) {
  const boundJar =
    contextJar instanceof toughCookie.CookieJar ? contextJar : new toughCookie.CookieJar();

  
  function boundRequest(method, url, bodyOrParams, optionsOrUndef) {
    const isBodyMethod = ['post', 'put', 'patch'].includes(method);
    const options = (isBodyMethod ? optionsOrUndef : bodyOrParams) ?? {};
    
    const merged = options.jar ? options : { ...options, jar: boundJar };
    return isBodyMethod
      ? doRequest(method, url, bodyOrParams, merged)
      : doRequest(method, url, merged);
  }

  return {
    jar: boundJar,
    doRequest: (method, url, b, o) => boundRequest(method, url, b, o),
    get: (url, opts) => boundRequest('get', url, opts),
    post: (url, body, opts) => boundRequest('post', url, body, opts),
    put: (url, body, opts) => boundRequest('put', url, body, opts),
    patch: (url, body, opts) => boundRequest('patch', url, body, opts),
  };
}

export default { setClientProxy, jar, client, delay, doRequest, createRequestCore };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-client',
  meta: { category: 'utils', path: 'lib/utils/request/client.js' },
  setup(_ctx) {
    // provides: jar, setClientProxy, doRequest, client, delay, createRequestCore
  },
};
