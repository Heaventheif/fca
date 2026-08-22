/**
 * proxy.js — Public proxy configuration API
 *
 * FCA-01 fix: This module now actually routes HTTP requests through the
 * configured proxy. Previously setClientProxy() stored the URL but doRequest()
 * never used it. The agent is now injected into every fetch() call.
 *
 * Supported proxy URLs:
 *   http://host:port
 *   https://user:pass@host:port
 *   socks5://host:port          (e.g. Tor: socks5://127.0.0.1:9050)
 *   socks4://host:port
 */

import { setClientProxy } from './client.js';

/**
 * Configure a global HTTP/SOCKS proxy for all outgoing requests.
 *
 * @param {string|null} proxyUrl  Full proxy URL including scheme, or null to disable.
 *
 * @example
 * import { setProxy } from 'fca-unofficial/lib/utils/request/proxy.js';
 * setProxy('socks5://127.0.0.1:9050');   // route everything via Tor
 * setProxy('http://user:pass@corp:8080'); // corporate HTTP proxy
 * setProxy(null);                          // disable proxy
 */
export function setProxy(proxyUrl) {
  setClientProxy(proxyUrl ?? null);
}

export default { setProxy };
