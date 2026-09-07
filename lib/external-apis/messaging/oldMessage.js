export default function oldMessageFactory(defaultFuncs, api, ctx) {
  
  return function oldMessage(msg, threadID, callback) {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    if (!callback) callback = (e, d) => (e ? reject(e) : resolve(d));

    const body = typeof msg === 'string' ? msg : (msg?.body ?? '');

    if (!threadID) {
      const e = { error: 'oldMessage: threadID is required.' };
      callback(e);
      return promise;
    }
    if (!ctx?.jar) {
      const e = { error: 'oldMessage: no cookie jar — not logged in.' };
      callback(e);
      return promise;
    }

    
    const msgID = `mid.${Date.now()}:${Math.floor(Math.random() * 0xffffff).toString(16)}`;
    const form = {
      client: 'mercury',
      action_type: 'ma-type:user-generated-message',
      ephemeral_ttl_mode: '0',
      message_batch_id: '',
      thread_fbid: threadID,
      message_id: msgID,
      body: body,
      timestamp: String(Date.now()),
      timestamp_absolute: 'Today',
      timestamp_relative: '0:00',
      timestamp_time_passed: '0',
      is_unread: 'false',
      is_archived: 'false',
      is_filtered_content: 'false',
      is_filtered_content_babo: 'false',
      is_filtered_content_account_plus: 'false',
      is_spoof_warning: 'false',
      source: 'source:chat:web',
      'source_tags[0]': 'source:chat',
    };

    if (ctx.fb_dtsg) form.fb_dtsg = ctx.fb_dtsg;
    if (ctx.userID) form.author = `fbid:${ctx.userID}`;

    defaultFuncs
      .postFormData('https://www.facebook.com/messaging/send/', ctx, form, {})
      .then((r) => defaultFuncs.parseAndCheckLogin(ctx, r))
      .then((resData) => {
        if (resData?.error) {
          callback({ error: resData.error });
          return;
        }
        const result = {
          messageID: msgID,
          threadID: String(threadID),
          timestamp: Date.now(),
          fallback: true,
        };
        callback(null, result);
      })
      .catch((err) => {
        callback({ error: err?.message ?? String(err) });
      });

    return promise;
  };
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-messaging-old-message',
  meta: { category: 'external-api-messaging', path: 'lib/external-apis/messaging/oldMessage.js' },
  setup(_ctx) {
    // provides: oldMessageFactory
  },
};
