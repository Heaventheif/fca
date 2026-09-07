import logger from '../func/logger.js';

const DOC_IDS = ['6110571418999720', '5820480661380920'];

export async function dismissScrapingWarning(http, ctx) {
  for (const docId of DOC_IDS) {
    try {
      const params = {
        av: ctx.userID,
        __aaid: 0,
        __user: ctx.userID,
        __a: 1,
        __req: Math.random().toString(36).slice(2, 8),
        dpr: 1,
        __ccg: 'EXCELLENT',
        __rev: ctx.req_ID || '1027405870',
        __hsi: ctx.hsi || '',
        __comet_req: 15,
        fb_dtsg: ctx.fb_dtsg,
        jazoest: ctx.ttstamp,
        lsd: ctx.fb_dtsg,
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'FBScrapingWarningMutation',
        variables: JSON.stringify({
          input: {
            actor_id: ctx.userID,
            client_mutation_id: String(Math.floor(Math.random() * 1e9)),
          },
        }),
        server_timestamps: true,
        doc_id: docId,
      };

      const res = await http.post('https://www.facebook.com/api/graphql/', ctx.jar, params);

      const body =
        typeof res?.data === 'string' ? res.data : JSON.stringify(res?.data ?? res ?? '');

      if (
        body.includes('"XCheckpointFBScrapingWarningController"') ||
        body.includes('"601051028565049"')
      ) {
        logger(
          '[dismissScrapingWarning] تحذير الـ scraping لا يزال نشطاً، سيُعاد المحاولة',
          'warn'
        );
        continue;
      }

      logger('[dismissScrapingWarning] تم إخفاء تحذير النشاط الآلي بنجاح ✓', 'info');
      return true;
    } catch (e) {
      logger(`[dismissScrapingWarning] فشل doc_id ${docId}: ${e?.message}`, 'warn');
    }
  }

  logger('[dismissScrapingWarning] فشل إخفاء التحذير بكل الطرق', 'error');
  return false;
}

export default dismissScrapingWarning;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-dismiss-scraping-warning',
  meta: { category: 'safety', path: 'lib/safety/dismiss-scraping-warning.js' },
  setup(_ctx) {
    // provides: dismissScrapingWarning
  },
};
