var c = Object.defineProperty;
var a = (n, r) => c(n, 'name', { value: r, configurable: !0 });
import l from '../../../lib/utils/compat-utils.js';
import '../utils/deferred.js';
function d(n, r, u) {
  function i() {
    let e = Date.now();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (o) {
      let x = Math.floor((e + Math.random() * 16) % 16);
      return ((e = Math.floor(e / 16)), (o == 'x' ? x : (x & 3) | 8).toString(16));
    });
  }
  a(i, 'getGUID');
  function s(e, f) {
    const o = [];
    if (!l.isReadableStream(e))
      throw { error: 'Attachment should be a readable stream and not ' + l.getType(e) + '.' };
    const x = {
      file: e,
      av: r.getCurrentUserID(),
      profile_id: r.getCurrentUserID(),
      source: '19',
      target_id: r.getCurrentUserID(),
      __user: r.getCurrentUserID(),
      __a: '1',
    };
    return (
      o.push(
        n
          .postFormData('https://www.facebook.com/ajax/ufi/upload', u.jar, x)
          .then(l.parseAndCheckLogin(u, n))
          .then(function (t) {
            if (t.error || t.errors || !t.payload) throw t;
            return t.payload.fbid;
          })
      ),
      Promise.all(o)
    );
  }
  return (
    a(s, 'uploadAttachment'),
    a(function (postID, message, callback) {
      // تطبيع الـ arguments
      if (typeof message === 'function') { callback = message; message = ''; }
      if (typeof postID === 'function') { callback = postID; postID = null; }

      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      callback = typeof callback === 'function'
        ? callback
        : a((err, data) => (err ? reject(err) : resolve(data)), 'cb');

      if (!postID || typeof postID !== 'string') {
        const e = new Error('sendComment: postID must be a non-empty string');
        return (callback(e), promise);
      }

      // دعم message كنص أو كـ { body, attachment }
      let text = '';
      let attachmentStream = null;
      if (typeof message === 'string') {
        text = message;
      } else if (message && typeof message === 'object') {
        text = message.body || message.text || '';
        attachmentStream = message.attachment || null;
      }

      const doPost = a(function (fbid) {
        const form = {
          comment_text: text,
          ft_ent_identifier: postID,
          attached_sticker_fbid: '',
          attached_photo_fbid: fbid || '',
          comment_source: 2,
        };
        n
          .postFormData
          ? n.post('https://www.facebook.com/ufi/comment/add/', u.jar, form)
              .then(function (t) {
                if (t && t.error) throw new Error(JSON.stringify(t.error));
                callback(null, t);
              })
              .catch(function (err) {
                callback(err instanceof Error ? err : new Error(JSON.stringify(err)));
              })
          : callback(new Error('sendComment: http client unavailable'));
      }, 'doPost');

      if (attachmentStream) {
        s(attachmentStream, null)
          .then(function (fbids) {
            doPost(fbids && fbids[0] ? fbids[0] : null);
          })
          .catch(callback);
      } else {
        doPost(null);
      }

      return promise;
    }, 'sendComment')
  );
}
a(d, 'default');
export { d as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-external-apis-action-send-comment',
  meta: { category: 'external-api-action', path: 'lib/external-apis/action/sendComment.js' },
  setup(_ctx) {
    // see module exports
  },
};
