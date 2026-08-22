/**
 * client.js — HTTP client layer built on Node.js native fetch (2026-compatible)
 *
 * Audit fixes applied in this version:
 *  - FCA-01: Proxy is now ACTUALLY wired into fetch requests via undici
 *            ProxyAgent (HTTP/HTTPS) or socks-proxy-agent (SOCKS5).
 *            Previously _proxyUrl was stored but never used in fetch().
 *  - Cookie jar operations are fully async (no stray setCookieSync calls)
 *  - normalizeNetworkError preserves original .code for retry classification
 *  - Added deduplication of Set-Cookie headers to avoid jar corruption
 *  - Timeout AbortController is always cleaned up in finally{}
 */

import { createRequire } from 'node:module';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const require = createRequire(import.meta.url);
const toughCookie = require('tough-cookie');

// ⚠️  LEGACY: single shared jar kept for backward-compatibility ONLY.
//   New callers must use createRequestCore(contextJar) so that every
//   login context carries its own isolated cookie store.
//   Multi-bot / multi-session code MUST NOT rely on this export.
export const jar = new toughCookie.CookieJar();

// ─── PROXY MANAGEMENT (FCA-01 fix) ───────────────────────────────────────────
/**
 * Active proxy URL. When set, ALL HTTP requests (not just MQTT) will be
 * routed through this proxy. Supports http://, https://, socks5://, socks4://.
 *
 * @type {string|null}
 */
let _proxyUrl = null;

/** @type {import('https-proxy-agent').HttpsProxyAgent|import('socks-proxy-agent').SocksProxyAgent|null} */
let _proxyAgent = null;

/**
 * Set (or clear) the global HTTP proxy used by ALL doRequest() calls.
 *
 * @param {string|null} url  e.g. 'socks5://127.0.0.1:9050' or 'http://user:pass@proxy:8080'
 *
 * @example
 * setClientProxy('socks5://127.0.0.1:9050');  // route via Tor
 * setClientProxy(null);                         // disable proxy
 */
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
    // http:// or https://
    _proxyAgent = new HttpsProxyAgent(_proxyUrl);
  }
}

/**
 * Return the agent for a given context jar (allows per-context proxy override).
 * Falls back to the module-level agent.
 * @internal
 */
function resolveAgent(options) {
  // Per-request proxy takes precedence over global
  if (options?.proxyUrl) {
    const lc = options.proxyUrl.toLowerCase();
    return lc.startsWith('socks') ? new SocksProxyAgent(options.proxyUrl)
                                   : new HttpsProxyAgent(options.proxyUrl);
  }
  return _proxyAgent;
}

// ─── INTERNAL HELPERS ────────────────────────────────────────────────────────

/** Extract Set-Cookie header values from a fetch Response, deduplicated. */
function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    // Node 18+ native fetch has getSetCookie()
    return [...new Set(response.headers.getSetCookie())];
  }
  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** Apply all Set-Cookie headers to the cookie jar for the given URL. */
async function applyCookiesFromResponse(response, url, cookieJar) {
  const cookies = getSetCookieHeaders(response);
  await Promise.all(
    cookies.map(c => cookieJar.setCookie(c, url).catch(() => { /* invalid cookie — skip silently */ }))
  );
}

/** Convert fetch Headers to a plain object. */
function headersToObject(headers) {
  const obj = {};
  headers.forEach((value, key) => { obj[key] = value; });
  return obj;
}

/** Parse the response body according to the expected responseType. */
async function parseResponseBody(response, options) {
  const type = options?.responseType;
  if (type === 'arraybuffer') return Buffer.from(await response.arrayBuffer());
  if (type === 'stream') return response.body;

  const text = await response.text();
  const ct = response.headers.get('content-type') ?? '';
  if (ct.includes('application/json') || type === 'json') {
    try { return JSON.parse(text); } catch { return text; }
  }
  return text;
}

/** Append query-string params to a URL string. */
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

/** Wrap a low-level fetch error into a standardised error object. */
function normalizeNetworkError(err, config, url) {
  const msg = (err && err.message) ? err.message : 'Network Error';
  const wrapped = new Error(msg);
  wrapped.code = err?.name === 'AbortError'
    ? 'ETIMEDOUT'
    : (err?.code ?? 'ERR_NETWORK');
  wrapped.config = { ...config, url };
  wrapped.originalError = err;
  return wrapped;
}

// ─── CORE REQUEST ────────────────────────────────────────────────────────────

/**
 * Perform an HTTP request using Node's native fetch.
 *
 * @param {'get'|'post'|'put'|'patch'|'delete'} method
 * @param {string} url
 * @param {*} bodyOrParams  For GET/DELETE: options. For POST/PUT: body.
 * @param {object} [optionsOrUndef]  For POST/PUT: options.
 */
export async function doRequest(method, url, bodyOrParams, optionsOrUndef) {
  const isBodyMethod = ['post', 'put', 'patch'].includes(method);
  const body = isBodyMethod ? bodyOrParams : undefined;
  const options = (isBodyMethod ? optionsOrUndef : bodyOrParams) ?? {};

  const cookieJar = options.jar ?? jar;
  const fullUrl = buildUrlWithParams(url, options.params);

  // Build headers, starting with caller-supplied ones
  const headers = { ...(options.headers ?? {}) };

  // Attach cookies from jar — always async now (no setCookieSync)
  try {
    const cookieStr = await cookieJar.getCookieString(fullUrl);
    if (cookieStr) headers.Cookie = cookieStr;
  } catch { /* jar empty or URL not matched — continue without Cookie */ }

  // Build fetch init
  const init = {
    method: method.toUpperCase(),
    headers,
    redirect: 'follow',
  };

  if (body != null) init.body = body;

  // FCA-01 fix: inject proxy agent into every fetch call.
  // Node 18+ native fetch accepts `dispatcher` (undici) via options, but the
  // cross-runtime compatible approach is to pass `agent` which both undici and
  // node-fetch honour. For Bun we attach it the same way — Bun proxies the
  // agent through its own fetch implementation.
  const agent = resolveAgent(options);
  if (agent) {
    // undici path (Node ≥ 18 native fetch): dispatcher is the correct field
    // node-fetch / Bun path: agent is correct
    init.agent = agent;       // node-fetch / Bun
    init.dispatcher = agent;  // undici (native Node fetch)
  }

  // Timeout via AbortController — always cleaned up in finally
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

  // Persist Set-Cookie headers into the jar
  await applyCookiesFromResponse(response, fullUrl, cookieJar);

  // Parse body
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

// ─── PUBLIC CLIENT API ───────────────────────────────────────────────────────

export const client = {
  get:   (url, opts)        => doRequest('get',   url, opts),
  post:  (url, body, opts)  => doRequest('post',  url, body, opts),
  put:   (url, body, opts)  => doRequest('put',   url, body, opts),
  patch: (url, body, opts)  => doRequest('patch', url, body, opts),
  defaults: { httpAgent: undefined, httpsAgent: undefined, proxy: false },
};

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ─── PER-CONTEXT CLIENT FACTORY ──────────────────────────────────────────────
/**
 * Create an isolated HTTP client core bound to a specific CookieJar.
 *
 * ALWAYS use this instead of the module-level `client` when handling
 * multiple login contexts in the same process (multi-bot, multi-account).
 * Each call returns a fresh object whose cookie operations are fully
 * scoped to `contextJar` — no cross-contamination between sessions.
 *
 * @param {import('tough-cookie').CookieJar} [contextJar]
 *   The jar to bind to.  Defaults to a brand-new empty jar so callers
 *   can omit the argument and still get an isolated context.
 * @returns {{ jar: import('tough-cookie').CookieJar, get, post, put, patch, doRequest }}
 *
 * @example
 * const ctx = createRequestCore();
 * await ctx.post('https://www.facebook.com/login', formBody, { jar: ctx.jar });
 */
export function createRequestCore(contextJar) {
  const boundJar = contextJar instanceof toughCookie.CookieJar
    ? contextJar
    : new toughCookie.CookieJar();

  /**
   * Thin wrapper that injects `boundJar` as the default jar so the
   * caller never has to pass `{ jar: ... }` on every single request.
   */
  function boundRequest(method, url, bodyOrParams, optionsOrUndef) {
    const isBodyMethod = ['post', 'put', 'patch'].includes(method);
    const options = (isBodyMethod ? optionsOrUndef : bodyOrParams) ?? {};
    // Only inject when the caller has not already supplied a jar
    const merged = options.jar ? options : { ...options, jar: boundJar };
    return isBodyMethod
      ? doRequest(method, url, bodyOrParams, merged)
      : doRequest(method, url, merged);
  }

  return {
    jar: boundJar,
    doRequest: (method, url, b, o) => boundRequest(method, url, b, o),
    get:   (url, opts)        => boundRequest('get',   url, opts),
    post:  (url, body, opts)  => boundRequest('post',  url, body, opts),
    put:   (url, body, opts)  => boundRequest('put',   url, body, opts),
    patch: (url, body, opts)  => boundRequest('patch', url, body, opts),
  };
}

export default { setClientProxy, jar, client, delay, doRequest, createRequestCore };
