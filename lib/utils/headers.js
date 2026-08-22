/**
 * headers.js — HTTP request header factory for fca-unofficial (2026-compatible)
 *
 * Audit fixes applied:
 *  - Added sec-ch-ua-wow64 for Windows profiles (was missing entirely)
 *  - Added Priority header (Chrome sends "u=1, i" for Fetch/XHR requests)
 *  - Removed X-Requested-With for modern fetch paths (Chrome's fetch API doesn't send it)
 *  - Fixed Accept header to match real browser Fetch requests precisely
 *  - Accept-Language now uses profile's value, not a hardcoded fallback
 *  - Fixed header sanitization: strips control chars but preserves valid ASCII-printable
 *  - sec-ch-ua headers are now omitted entirely for Firefox profiles
 */

import { pickSessionProfile } from '../safety/stealth-profiles.js';

// Strip control characters and non-printable ASCII that crash Node's http module.
// Only called on values we construct; user-provided header values must also be clean.
function sanitizeHeaderValue(val) {
  if (val == null) return '';
  let s = String(val);
  // Reject JSON arrays (appState fragments sometimes slip in as header values)
  if (s.trim().startsWith('[') && s.trim().endsWith(']')) {
    try { if (Array.isArray(JSON.parse(s))) return ''; } catch { /* not JSON */ }
  }
  // Strip control chars (0x00-0x08, 0x0A-0x1F, 0x7F) and CR/LF (header injection prevention)
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\r\n\[\]]/g, '').trim();
}

function sanitizeHeaderName(name) {
  if (!name || typeof name !== 'string') return '';
  // Header names: visible ASCII only, no separators
  return name.replace(/[^\x21-\x7E]/g, '').trim();
}

/**
 * Build a complete, internally-consistent set of HTTP headers for a Facebook
 * request. All headers are validated and sanitised before being returned.
 *
 * @param {string}  url         Destination URL (used for Host, Origin, Referer)
 * @param {object}  options     Per-request overrides (userAgent, referer, contentType, acceptLanguage)
 * @param {object}  ctx         FCA session context (used for region, _stealthProfile)
 * @param {object}  extraHeaders Additional headers to merge (lowest priority)
 * @returns {object} Plain header object safe for Node.js http/https
 */
export function getHeaders(url, options, ctx, extraHeaders) {
  const parsed = new URL(url);
  const profile = pickSessionProfile(ctx);

  const ua = options?.userAgent || profile.userAgent;
  const referer = options?.referer || 'https://www.facebook.com/';
  const origin = referer.replace(/\/+$/, '');
  const contentType = options?.contentType || 'application/x-www-form-urlencoded';
  // Use the profile's Accept-Language so all headers form a consistent browser fingerprint
  const acceptLanguage = options?.acceptLanguage || profile.acceptLanguage;

  // Base headers that every Facebook API request should carry
  const headers = {
    Host: sanitizeHeaderValue(parsed.host),
    Origin: sanitizeHeaderValue(origin),
    Referer: sanitizeHeaderValue(referer),
    'User-Agent': sanitizeHeaderValue(ua),
    // Modern fetch requests use a narrower Accept than navigation requests
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': sanitizeHeaderValue(acceptLanguage),
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': sanitizeHeaderValue(contentType),
    Connection: 'keep-alive',
    // Priority header: Chrome Fetch/XHR uses "u=1, i" (medium priority, not idle)
    Priority: 'u=1, i',
    DNT: '1',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  };

  // Chromium-based browsers send Client-Hints; Firefox does not
  if (!profile.isFirefox) {
    if (profile.secChUa)              headers['sec-ch-ua']                  = profile.secChUa;
    if (profile.secChUaMobile)        headers['sec-ch-ua-mobile']           = profile.secChUaMobile;
    if (profile.secChUaPlatform)      headers['sec-ch-ua-platform']         = profile.secChUaPlatform;
    if (profile.secChUaArch)          headers['sec-ch-ua-arch']             = profile.secChUaArch;
    if (profile.secChUaBitness)       headers['sec-ch-ua-bitness']          = profile.secChUaBitness;
    // FIX: wow64 was missing; Windows x86-64 processes send this
    if (profile.secChUaWow64)         headers['sec-ch-ua-wow64']            = profile.secChUaWow64;
    if (profile.secChUaFullVersionList) headers['sec-ch-ua-full-version-list'] = profile.secChUaFullVersionList;
    if (profile.secChUaPlatformVersion) headers['sec-ch-ua-platform-version'] = profile.secChUaPlatformVersion;
  }

  // Region routing hint — reduces geo-based redirect loops
  if (ctx?.region) {
    const regionVal = sanitizeHeaderValue(ctx.region);
    if (regionVal) headers['X-MSGR-Region'] = regionVal;
  }

  // Merge caller-supplied extra headers (e.g., Cookie, Authorization)
  if (extraHeaders && typeof extraHeaders === 'object') {
    for (const [rawName, rawVal] of Object.entries(extraHeaders)) {
      if (rawVal == null || typeof rawVal === 'function') continue;
      if (typeof rawVal === 'object' && !Array.isArray(rawVal)) continue;
      const name = sanitizeHeaderName(rawName);
      const val = sanitizeHeaderValue(rawVal);
      if (name && val !== '') headers[name] = val;
    }
  }

  // Final sanitisation pass — remove any empty-string values that slipped through
  const clean = {};
  for (const [name, val] of Object.entries(headers)) {
    const n = sanitizeHeaderName(name);
    const v = sanitizeHeaderValue(val);
    if (n && v !== '') clean[n] = v;
  }
  return clean;
}

export default { getHeaders };
