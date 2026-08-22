/**
 * forwardMessage — إعادة توجيه رسالة كاملة لـ thread واحد أو أكثر
 * مختلف عن forwardAttachment: يدعم multi-thread في استدعاء واحد
 *
 * @param {string}          messageID  - ID الرسالة المراد توجيهها
 * @param {string|string[]} threadID   - thread واحد أو مصفوفة
 * @param {function}        [callback] - callback(err, { success, failed })
 */
export default function forwardMessageFactory(defaultFuncs, api, ctx) {
  return function forwardMessage(messageID, threadID, callback) {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });

    if (!callback) callback = (err, data) => err ? reject(err) : resolve(data);

    if (!messageID || !threadID) {
      const e = { error: 'messageID and threadID are required.' };
      callback(e); return promise;
    }
    if (!ctx.mqttClient?.connected) {
      const e = { error: 'MQTT not connected — cannot forward message.' };
      callback(e); return promise;
    }

    const targets = Array.isArray(threadID) ? threadID : [threadID];
    const success = [];
    const failed  = [];

    const forwardOne = tid => new Promise(res => {
      const reqID  = ++ctx.wsReqNumber;
      const taskID = ++ctx.wsTaskNumber;

      const otid = (BigInt(Date.now()) << 22n | BigInt(Math.floor(Math.random() * 4194304))).toString();

      const payload = {
        thread_id: String(tid),
        otid,
        source: 65544,
        send_type: 5,
        sync_group: 1,
        mark_thread_read: 0,
        forwarded_msg_id: String(messageID),
        strip_forwarded_msg_caption: 0,
        initiating_source: 1,
      };

      const content = {
        app_id: '2220391788200892',
        payload: JSON.stringify({
          epoch_id: otid,
          tasks: [{ failure_count: null, label: '46', payload: JSON.stringify(payload), queue_name: String(tid), task_id: taskID }],
          version_id: '6903494529735864',
        }),
        request_id: reqID,
        type: 3,
      };

      let done = false;
      const finish = () => { if (done) return; done = true; ctx.mqttClient.removeListener('message', onMsg); };

      const timer = setTimeout(() => {
        finish();
        failed.push({ threadID: tid, error: 'forwardMessage timed out.' });
        res();
      }, 15000);

      const onMsg = (topic, raw) => {
        if (topic !== '/ls_resp') return;
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.request_id !== reqID) return;
          clearTimeout(timer); finish();
          success.push({ threadID: String(tid), messageID: String(messageID) });
        } catch {
          clearTimeout(timer); finish();
          failed.push({ threadID: tid, error: 'Failed to parse response.' });
        }
        res();
      };

      ctx.mqttClient.on('message', onMsg);
      try {
        ctx.mqttClient.publish('/ls_req', JSON.stringify(content), { qos: 1, retain: false });
      } catch (e) {
        clearTimeout(timer); finish();
        failed.push({ threadID: tid, error: e?.message ?? String(e) });
        res();
      }
    });

    (async () => {
      for (const tid of targets) await forwardOne(tid);
      const result = { success, failed };
      if (failed.length === targets.length) callback({ error: 'All forwards failed.', details: failed });
      else callback(null, result);
    })();

    return promise;
  };
}
