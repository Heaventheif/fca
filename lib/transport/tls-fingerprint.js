import { isBun } from '../utils/runtime.js';

export const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-CBC-SHA',
  'ECDHE-RSA-AES256-CBC-SHA',
  'RSA-AES128-GCM-SHA256',
  'RSA-AES256-GCM-SHA384',
  'RSA-AES128-CBC-SHA',
  'RSA-AES256-CBC-SHA',
].join(':');

// TLS version numbers — Bun يتطلب أرقاماً، Node.js يقبل الأرقام والنصوص.
// TLSv1.2 = 771 (0x0303)  |  TLSv1.3 = 772 (0x0304)
const TLS_VERSION_1_2 = 771;
const TLS_VERSION_1_3 = 772;

/**
 * يُعيد خيارات TLS المتوافقة مع البيئة الحالية.
 *
 * الفروق بين البيئتين:
 *  - ecdhCurve: Bun لا يدعمها (يتجاهلها بصمت أو يُلقي خطأ) — نحذفها على Bun.
 *  - ciphers: مدعومة في البيئتين بنفس الصيغة.
 *  - minVersion/maxVersion: مدعومة في البيئتين كأرقام.
 *  - ALPNProtocols: لا نُمررها — Node.js يتفاوض تلقائياً، Bun لا يدعم المصفوفة.
 */
export function getChromeTlsOptions() {
  const base = {
    ciphers: CHROME_CIPHERS,
    minVersion: TLS_VERSION_1_2,
    maxVersion: TLS_VERSION_1_3,
  };

  if (!isBun) {
    // ecdhCurve مدعومة في Node.js فقط
    base.ecdhCurve = 'X25519:prime256v1:secp384r1';
  }

  return base;
}

/**
 * يُطبّق خيارات Chrome TLS على wsOptions بطريقة متوافقة مع Bun وNode.
 *
 * - Node.js (مكتبة ws): تقبل خيارات TLS مباشرة في كائن wsOptions وأيضاً في `tls`.
 * - Bun (WebSocket الأصلي): يقرأ خيارات TLS من الكائن الجذر مباشرة.
 */
export function applyChromeTlsFingerprint(wsOptions = {}) {
  const tlsOpts = getChromeTlsOptions();
  return {
    ...wsOptions,
    ...tlsOpts,
    tls: {
      ...(wsOptions.tls || {}),
      ...tlsOpts,
    },
  };
}

export default { getChromeTlsOptions, applyChromeTlsFingerprint, CHROME_CIPHERS };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-transport-tls-fingerprint',
  meta: { category: 'transport', path: 'lib/transport/tls-fingerprint.js' },
  setup(_ctx) {
    // provides: CHROME_CIPHERS, getChromeTlsOptions, applyChromeTlsFingerprint
  },
};
