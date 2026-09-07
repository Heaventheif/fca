/**
 * index.js — نقطة دخول موحَّدة لأدوات الطلبات HTTP.
 *
 * يُعيد تصدير جميع الأدوات من وحدات request الفرعية
 * في واجهة واحدة مرتبة.
 */
export { jar, client }                           from './client.js';
export { makeDefaults }                          from './defaults.js';
export { cleanGet, get, post, postFormData }     from './methods.js';
export { setProxy }                              from './proxy.js';
export { requestWithRetry }                      from './retry.js';

// تصدير افتراضي (للتوافق مع الاستيراد القديم)
import { jar, client }                           from './client.js';
import { makeDefaults }                          from './defaults.js';
import { cleanGet, get, post, postFormData }     from './methods.js';
import { setProxy }                              from './proxy.js';

export default { jar, client, makeDefaults, cleanGet, get, post, postFormData, setProxy };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-index',
  meta: { category: 'utils', path: 'lib/utils/request/index.js' },
  setup(_ctx) {
    // provides: cleanGet, client, get, jar, makeDefaults, post, postFormData, setProxy, requestWithRetry
  },
};
