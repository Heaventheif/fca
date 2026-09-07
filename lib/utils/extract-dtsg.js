const DTSG_PATTERNS = [
  
  { re: /"DTSGInitData"[^{]*\{[^}]*"token":"([^"]+)"/, name: 'DTSGInitData.token' },
  // نمط 2: DTSGInitData (ترتيب مختلف)
  { re: /"token":"([^"]+)"[^}]*"DTSGInitData"/, name: 'token+DTSGInitData' },
  
  { re: /name="fb_dtsg"\s+value="([^"]+)"/, name: 'input[fb_dtsg]' },
  // نمط 4: fb_dtsg كـ JSON key مباشر
  { re: /"fb_dtsg":"([^"]+)"/, name: 'json.fb_dtsg' },
  
  { re: /\["DTSG","setToken"[^\]]*,"([^"]+)"\]/, name: 'require.DTSG.setToken' },
  // نمط 6: تنسيق Comet الجديد
  { re: /CometPlatformRootClient.*?dtsg.*?"token":"([^"]+)"/, name: 'Comet.dtsg' },
  
  { re: /token&[^"]*?=([^&"]{20,})/, name: 'AsyncRequest.token' },
  
  { re: /__d\("DTSGInitData"[^)]*token:"([^"]+)"/, name: '__d.DTSGInitData' },
];

const JAZOEST_PATTERNS = [
  { re: /jazoest=(\d+)/, name: 'jazoest=' },
  { re: /"jazoest":"(\d+)"/, name: 'json.jazoest' },
  { re: /name="jazoest"\s+value="(\d+)"/, name: 'input[jazoest]' },
];

/**
 * احسب jazoest من fb_dtsg إذا لم يُوجد في الصفحة.
 * خوارزمية Facebook: "2" + مجموع charCode كل حرف
 */
function computeJazoest(dtsg) {
  if (!dtsg) return null;
  let sum = 0;
  for (let i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
  return '2' + sum;
}

export function extractDtsg(html) {
  if (!html || typeof html !== 'string') {
    return { fb_dtsg: null, jazoest: null, source: 'empty_input' };
  }

  let fb_dtsg = null;
  let dtsgSource = 'not_found';

  for (const { re, name } of DTSG_PATTERNS) {
    const m = html.match(re);
    if (m && m[1] && m[1].length > 4) {
      fb_dtsg = m[1];
      dtsgSource = name;
      break;
    }
  }

  let jazoest = null;
  if (fb_dtsg) {
    for (const { re } of JAZOEST_PATTERNS) {
      const m = html.match(re);
      if (m && m[1]) {
        jazoest = m[1];
        break;
      }
    }
    if (!jazoest) jazoest = computeJazoest(fb_dtsg);
  }

  return { fb_dtsg, jazoest, source: dtsgSource };
}

/**
 * استخرج وحدّث الـ ctx مباشرةً.
 * @returns {boolean} — true إذا تم تحديث التوكن
 */
export function extractAndPatchCtx(html, ctx) {
  const { fb_dtsg, jazoest, source } = extractDtsg(html);
  if (!fb_dtsg) return false;
  ctx.fb_dtsg = fb_dtsg;
  ctx.ttstamp = jazoest || computeJazoest(fb_dtsg);
  return true;
}

export default extractDtsg;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-extract-dtsg',
  meta: { category: 'utils', path: 'lib/utils/extract-dtsg.js' },
  setup(_ctx) {
    // provides: extractDtsg, extractAndPatchCtx
  },
};
