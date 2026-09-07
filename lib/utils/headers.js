import { pickSessionProfile } from '../safety/stealth-profiles.js';

function sanitizeHeaderValue(val) {
  if (val == null) return '';
  let s = String(val);
  
  if (s.trim().startsWith('[') && s.trim().endsWith(']')) {
    try {
      if (Array.isArray(JSON.parse(s))) return '';
    } catch {
      
    }
  }
  
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\r\n\[\]]/g, '').trim();
}

function sanitizeHeaderName(name) {
  if (!name || typeof name !== 'string') return '';
  
  return name.replace(/[^\x21-\x7E]/g, '').trim();
}

export function getHeaders(url, options, ctx, extraHeaders) {
  const parsed = new URL(url);
  const profile = pickSessionProfile(ctx);

  const ua = options?.userAgent || profile.userAgent;
  const referer = options?.referer || 'https://www.facebook.com/';
  const origin = referer.replace(/\/+$/, '');
  const contentType = options?.contentType || 'application/x-www-form-urlencoded';
  
  const acceptLanguage = options?.acceptLanguage || profile.acceptLanguage;

  
  const headers = {
    Host: sanitizeHeaderValue(parsed.host),
    Origin: sanitizeHeaderValue(origin),
    Referer: sanitizeHeaderValue(referer),
    'User-Agent': sanitizeHeaderValue(ua),
    
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': sanitizeHeaderValue(acceptLanguage),
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': sanitizeHeaderValue(contentType),
    Connection: 'keep-alive',
    
    Priority: 'u=1, i',
    DNT: '1',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  
  if (!profile.isFirefox) {
    if (profile.secChUa) headers['sec-ch-ua'] = profile.secChUa;
    if (profile.secChUaMobile) headers['sec-ch-ua-mobile'] = profile.secChUaMobile;
    if (profile.secChUaPlatform) headers['sec-ch-ua-platform'] = profile.secChUaPlatform;
    if (profile.secChUaArch) headers['sec-ch-ua-arch'] = profile.secChUaArch;
    if (profile.secChUaBitness) headers['sec-ch-ua-bitness'] = profile.secChUaBitness;
    
    if (profile.secChUaWow64) headers['sec-ch-ua-wow64'] = profile.secChUaWow64;
    if (profile.secChUaFullVersionList)
      headers['sec-ch-ua-full-version-list'] = profile.secChUaFullVersionList;
    if (profile.secChUaPlatformVersion)
      headers['sec-ch-ua-platform-version'] = profile.secChUaPlatformVersion;
  }

  
  if (ctx?.region) {
    const regionVal = sanitizeHeaderValue(ctx.region);
    if (regionVal) headers['X-MSGR-Region'] = regionVal;
  }

  
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [rawName, rawVal] of Object.entries(extraHeaders)) {
      if (rawVal == null || typeof rawVal === 'function') continue;
      if (typeof rawVal === 'object' && !Array.isArray(rawVal)) continue;
      const name = sanitizeHeaderName(rawName);
      const val = sanitizeHeaderValue(rawVal);
      if (name && val !== '') headers[name] = val;
    }
  }

  
  const clean = {};
  for (const [name, val] of Object.entries(headers)) {
    const n = sanitizeHeaderName(name);
    const v = sanitizeHeaderValue(val);
    if (n && v !== '') clean[n] = v;
  }
  return clean;
}

export default { getHeaders };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-headers',
  meta: { category: 'utils', path: 'lib/utils/headers.js' },
  setup(_ctx) {
    // provides: getHeaders
  },
};
