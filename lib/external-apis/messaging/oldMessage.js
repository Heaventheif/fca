/**
 * oldMessage — إرسال رسالة عبر HTTP endpoint كلاسيكي كـ fallback حين يفشل MQTT
 *
 * يُستخدم تلقائياً عبر api.oldMessage(msg, threadID)
 * أو يمكن استدعاؤه يدوياً حين يكون ctx.mqttClient غير متصل.
 *
 * يرجع: Promise<{ messageID, threadID, timestamp }>
 */
export default function oldMessageFactory(defaultFuncs, api, ctx) {
  /**
   * @param {string|object} msg       - نص أو object { body, attachment, ... }
   * @param {string}        threadID
   * @param {function}      [callback]
   */
  return function oldMessage(msg, threadID, callback) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    if (!callback) callback = (e, d) => e ? reject(e) : resolve(d);

    const body = typeof msg === 'string' ? msg : (msg?.body ?? '');

    if (!threadID) {
      const e = { error: 'oldMessage: threadID is required.' };
      callback(e); return promise;
    }
    if (!ctx?.jar) {
      const e = { error: 'oldMessage: no cookie jar — not logged in.' };
      callback(e); return promise;
    }

    // Compose a minimal x-www-form-urlencoded form payload
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
    if (ctx.userID)  form.author   = `fbid:${ctx.userID}`;

    defaultFuncs
      .postFormData('https://www.facebook.com/messaging/send/', ctx, form, {})
      .then(r => defaultFuncs.parseAndCheckLogin(ctx, r))
      .then(resData => {
        if (resData?.error) {
          callback({ error: resData.error }); return;
        }
        const result = {
          messageID:  msgID,
          threadID:   String(threadID),
          timestamp:  Date.now(),
          fallback:   true,
        };
        callback(null, result);
      })
      .catch(err => {
        callback({ error: err?.message ?? String(err) });
      });

    return promise;
  };
}
