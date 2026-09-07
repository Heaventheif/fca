/**
 * methods.js — دوال HTTP عالية المستوى (GET / POST / FormData).
 *
 * كل دالة تستخدم requestWithRetry داخلياً للتعامل مع الأخطاء العابرة.
 */
import { getHeaders }       from '../headers.js';
import { cfg }              from './config.js';
import { client }           from './client.js';
import { requestWithRetry } from './retry.js';
import { isStream, isBlobLike, isPairArrayList, toStringVal, getType } from '../helpers.js';

// ── تحويل البيانات لـ Blob ─────────────────────────────────────────

/**
 * حوِّل Stream إلى Buffer.
 * @param {NodeJS.ReadableStream} stream
 * @returns {Promise<Buffer>}
 */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data',  (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end',   () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * حوِّل أي قيمة مدعومة إلى Web Blob.
 * @param {*}      value
 * @param {object} [opts]
 * @param {string} [opts.contentType]
 * @returns {Promise<Blob>}
 */
async function toWebBlob(value, opts) {
  const contentType = opts?.contentType;

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return (contentType && value.type !== contentType)
      ? new Blob([await value.arrayBuffer()], { type: contentType })
      : value;
  }

  if (Buffer.isBuffer(value)) {
    return contentType ? new Blob([value], { type: contentType }) : new Blob([value]);
  }

  if (isStream(value)) {
    const buf = await streamToBuffer(value);
    return contentType ? new Blob([buf], { type: contentType }) : new Blob([buf]);
  }

  if (isBlobLike(value)) {
    const buf = Buffer.from(await value.arrayBuffer());
    return new Blob([buf], { type: contentType || value.type || undefined });
  }

  return new Blob([String(value)], contentType ? { type: contentType } : undefined);
}

/**
 * أضف حقل ملف إلى FormData.
 * @param {FormData} form
 * @param {string}   fieldName
 * @param {*}        value
 * @param {object}   [opts]
 */
async function appendFileField(form, fieldName, value, opts) {
  const blob     = await toWebBlob(value, opts);
  const filename = (opts?.filename) || value?.name || fieldName;
  form.append(fieldName, blob, filename);
}

// ── هل القيمة كائن FormData Entry مُهيكَل؟ ──────────────────────────

function isFormDataEntryObject(val) {
  return !!(val && typeof val === 'object' && 'value' in val && 'options' in val);
}

// ── دوال HTTP ─────────────────────────────────────────────────────

/**
 * GET مجرَّد بدون Cookie أو رؤوس إضافية.
 * @param {string} url
 * @param {object} [ctx]
 */
export function cleanGet(url, ctx) {
  return requestWithRetry(() => client.get(url, cfg()), 3, 1000, ctx);
}

/**
 * GET مع Cookie ورؤوس وباراميترات.
 * @param {string} url
 * @param {object} jar
 * @param {object} params
 * @param {object} ctx
 * @param {object} [mqttCtx]
 * @param {object} [extra]
 */
export function get(url, jar, params, ctx, mqttCtx, extra) {
  const headers = getHeaders(url, ctx, mqttCtx, extra);
  return requestWithRetry(
    () => client.get(url, cfg({ reqJar: jar, headers, params })),
    3, 1000, mqttCtx
  );
}

/**
 * POST مع دعم JSON و URL-encoded.
 * @param {string} url
 * @param {object} jar
 * @param {object} body
 * @param {object} ctx
 * @param {object} [mqttCtx]
 * @param {object} [extra]
 */
export function post(url, jar, body, ctx, mqttCtx, extra) {
  const headers     = getHeaders(url, ctx, mqttCtx, extra);
  const contentType = String(
    headers['Content-Type'] || headers['content-type'] || 'application/x-www-form-urlencoded'
  ).toLowerCase();

  let serializedBody;

  if (contentType.includes('json')) {
    serializedBody           = JSON.stringify(body || {});
    headers['Content-Type'] = 'application/json';
  } else {
    const params = new URLSearchParams();

    if (body && typeof body === 'object') {
      for (const key of Object.keys(body)) {
        let value = body[key];

        if (isPairArrayList(value)) {
          for (const [subKey, subVal] of value) params.append(`${key}[${subKey}]`, toStringVal(subVal));
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            const isTuple = Array.isArray(item) && item.length === 2 && typeof item[1] !== 'object';
            isTuple
              ? params.append(key, toStringVal(item[1]))
              : params.append(key, toStringVal(item));
          }
          continue;
        }

        if (getType(value) === 'Object') value = JSON.stringify(value);
        params.append(key, toStringVal(value));
      }
    }

    serializedBody           = params.toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  return requestWithRetry(
    () => client.post(url, serializedBody, cfg({ reqJar: jar, headers })),
    3, 1000, mqttCtx
  );
}

/**
 * POST بـ multipart/form-data مع دعم كامل لجميع أنواع القيم.
 * @param {string} url
 * @param {object} jar
 * @param {object} body
 * @param {object} params
 * @param {object} [mqttCtx]
 * @param {object} [extra]
 */
export async function postFormData(url, jar, body, params, mqttCtx, extra) {
  const form = new FormData();

  if (body && typeof body === 'object') {
    for (const key of Object.keys(body)) {
      const value = body[key];
      if (value == null) continue;

      // ── مصفوفة أزواج ──
      if (isPairArrayList(value)) {
        for (const [subKey, subVal] of value) {
          const isObjectVal = typeof subVal === 'object' && !Buffer.isBuffer(subVal) && !isStream(subVal);
          form.append(`${key}[${subKey}]`, isObjectVal ? JSON.stringify(subVal) : toStringVal(subVal));
        }
        continue;
      }

      // ── مصفوفة عادية ──
      if (Array.isArray(value)) {
        for (const item of value) {
          const isTupleWithObject = Array.isArray(item) && item.length === 2 && item[1]
            && typeof item[1] === 'object' && !Buffer.isBuffer(item[1]) && !isStream(item[1]);

          const isTupleWithPrimitive = Array.isArray(item) && item.length === 2 && typeof item[1] !== 'object';

          if (isTupleWithObject)    { await appendFileField(form, key, item[0], item[1]); }
          else if (isTupleWithPrimitive) { form.append(key, toStringVal(item[1])); }
          else if (isFormDataEntryObject(item)) { await appendFileField(form, key, item.value, item.options || {}); }
          else if (isStream(item) || Buffer.isBuffer(item)) { await appendFileField(form, key, item, {}); }
          else if (typeof item === 'string') { form.append(key, item); }
          else if (isBlobLike(item)) { await appendFileField(form, key, item, { filename: item.name, contentType: item.type }); }
          else { form.append(key, JSON.stringify(item)); }
        }
        continue;
      }

      // ── قيمة مفردة ──
      if (isFormDataEntryObject(value))  { await appendFileField(form, key, value.value, value.options || {}); }
      else if (isStream(value) || Buffer.isBuffer(value)) { await appendFileField(form, key, value, {}); }
      else if (typeof value === 'string') { form.append(key, value); }
      else if (isBlobLike(value)) { await appendFileField(form, key, value, { filename: value.name, contentType: value.type }); }
      else if (typeof value === 'number' || typeof value === 'boolean') { form.append(key, toStringVal(value)); }
      else { form.append(key, JSON.stringify(value)); }
    }
  }

  const headers = getHeaders(url, mqttCtx, extra);
  // اسمح لـ fetch بضبط Content-Type مع boundary تلقائياً
  delete headers['Content-Type'];
  delete headers['content-type'];

  return requestWithRetry(
    () => client.post(url, form, cfg({ reqJar: jar, headers, params })),
    3, 1000, extra
  );
}

export default { cleanGet, get, post, postFormData };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-request-methods',
  meta: { category: 'utils', path: 'lib/utils/request/methods.js' },
  setup(_ctx) {
    // provides: cleanGet, get, post, postFormData
  },
};
