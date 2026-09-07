import _rtLog from '../func/logAdapter.js';
/**
 * @file runtime.js
 * @description كشف بيئة التشغيل — Bun أم Node.js؟
 *
 * هذا الملف هو المرجع الوحيد (Single Source of Truth) لكشف البيئة في كامل المشروع.
 * لا تكتب `typeof Bun !== 'undefined'` في أي مكان آخر — استورد منه فقط.
 *
 * الطريقة المعتمدة:
 *  1. process.versions.bun  ← الأكثر موثوقية (متاحة منذ Bun v0.1)
 *  2. typeof Bun            ← احتياطي لحالات نادرة مثل البيئات المُحاكاة
 *
 * المراجع:
 *  - https://bun.sh/guides/util/detect-bun
 *  - https://bun.sh/docs/runtime/nodejs-compat
 */

// ────────────────────────────────────────────────────────────
// 1. الكشف الأساسي
// ────────────────────────────────────────────────────────────

/** @type {boolean} هل يعمل المشروع حالياً داخل Bun؟ */
export const isBun =
  typeof process !== 'undefined' && !!process.versions?.bun
    ? true
    : typeof globalThis.Bun !== 'undefined';

/** @type {boolean} هل يعمل المشروع حالياً داخل Node.js الخالص؟ */
export const isNode = !isBun;

// ────────────────────────────────────────────────────────────
// 2. خصائص إضافية مفيدة
// ────────────────────────────────────────────────────────────

/**
 * اسم بيئة التشغيل كنص للطباعة واللوج.
 * @type {'bun' | 'node'}
 */
export const runtimeName = isBun ? 'bun' : 'node';

/**
 * إصدار بيئة التشغيل الحالية.
 * @type {string}
 */
export const runtimeVersion = isBun
  ? (process.versions?.bun ?? globalThis.Bun?.version ?? 'unknown')
  : (process.versions?.node ?? 'unknown');

// ────────────────────────────────────────────────────────────
// 3. قدرات مرتبطة بالبيئة
// ────────────────────────────────────────────────────────────

/**
 * هل تدعم البيئة الحالية تمرير `agent` لـ fetch()؟
 * - Node.js 18+ يدعم `agent` عبر undici
 * - Bun يتجاهل `agent` ويستخدم `tls` مباشرة في `Bun.serve` و `fetch`
 * @type {boolean}
 */
export const supportsFetchAgent = isNode;

/**
 * هل يجب استخدام `dispatcher` (undici) بدل `agent` في fetch()؟
 * ينطبق فقط على Node.js مع undici.
 * @type {boolean}
 */
export const supportsUndiciDispatcher = isNode;

// ────────────────────────────────────────────────────────────
// 4. مساعد لخيارات TLS في WebSocket / MQTT
// ────────────────────────────────────────────────────────────

/**
 * يُعيد خيارات WebSocket المتوافقة مع كلتا البيئتين.
 *
 * المشكلة:
 *  - Node.js (ws library): يقبل `agent` مباشرة في wsOptions لتوجيه الاتصال عبر proxy.
 *  - Bun (native WebSocket): يتجاهل `agent` تماماً — يجب تمرير بيانات TLS/proxy
 *    بطريقة مختلفة أو الاعتماد على متغيرات البيئة (HTTPS_PROXY).
 *
 * @param {object} wsOptions - الخيارات الأساسية لـ WebSocket
 * @param {object|null} proxyAgent - كائن HttpsProxyAgent أو SocksProxyAgent
 * @returns {object} الخيارات الجاهزة للبيئة الحالية
 */
export function buildCompatibleWsOptions(wsOptions = {}, proxyAgent = null) {
  if (!proxyAgent) return wsOptions;

  if (isNode) {
    // Node.js: مكتبة `ws` تقبل agent مباشرة
    return { ...wsOptions, agent: proxyAgent };
  }

  // Bun: لا يدعم agent في WebSocket — نسجّل تحذيراً ونُعيد الخيارات كما هي
  // الحل الموصى به: استخدم متغير البيئة HTTPS_PROXY أو ALL_PROXY
  _rtLog.warn(
    '[fca/runtime] ⚠️  Proxy agent غير مدعوم في WebSocket على Bun. ' +
    'استخدم متغير البيئة HTTPS_PROXY بدلاً من ذلك.\n' +
    '  مثال: HTTPS_PROXY=http://user:pass@host:port bun run index.js'
  );
  return wsOptions;
}

// ────────────────────────────────────────────────────────────
// 5. مساعد لخيارات fetch() مع Agent
// ────────────────────────────────────────────────────────────

/**
 * يُضيف خيارات الـ proxy/agent لكائن fetch init بطريقة متوافقة.
 *
 * - Node.js: يدعم `agent` (http/https) و `dispatcher` (undici)
 * - Bun: يتجاهل `agent` و `dispatcher` في fetch — يقرأ HTTPS_PROXY تلقائياً
 *
 * @param {RequestInit} fetchInit - كائن الخيارات الأصلي لـ fetch
 * @param {object|null} agent - كائن الـ proxy agent
 * @returns {RequestInit} كائن الخيارات المعدَّل
 */
export function applyAgentToFetchInit(fetchInit = {}, agent = null) {
  if (!agent) return fetchInit;

  if (isNode) {
    return {
      ...fetchInit,
      // undici dispatcher (Node 18+ الافتراضي)
      dispatcher: agent,
      // احتياطي لـ node-fetch أو fetch القديم
      agent: agent,
    };
  }

  // Bun: لا نُضيف شيئاً — Bun يقرأ HTTPS_PROXY/HTTP_PROXY/ALL_PROXY تلقائياً
  return fetchInit;
}

export default {
  isBun,
  isNode,
  runtimeName,
  runtimeVersion,
  supportsFetchAgent,
  supportsUndiciDispatcher,
  buildCompatibleWsOptions,
  applyAgentToFetchInit,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-runtime',
  meta: { category: 'utils', path: 'lib/utils/runtime.js' },
  setup(_ctx) {
    // provides: isBun, isNode, runtimeName, runtimeVersion, supportsFetchAgent, supportsUndiciDispatcher, buildCompatibleWsOptions, applyAgentToFetchInit
  },
};
