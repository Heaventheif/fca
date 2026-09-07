/**
 * send-message.js — أمر إرسال الرسائل عبر MQTT / Lighthouse protocol.
 *
 * يدعم: نص، sticker، emoji، مرفقات، location، mentions، reply.
 */
import * as compat from '../../../compat/callbackify.js';
import * as lsRequests from '../../../transport/realtime/ls-requests.js';

// ── ثوابت ────────────────────────────────────────────────────────────────

const EMOJI_SIZE = { small: 1, medium: 2, large: 3 };

const APP_ID         = '2220391788200892';
const VERSION_ID     = '24804310205905615';
const TASK_SEND_ID   = 400;
const TASK_READ_ID   = 401;
const SOURCE_DEFAULT = 2097153;

// ── أدوات مساعدة ──────────────────────────────────────────────────────────

/** يُطبّع حجم الـ emoji إلى رقم 1-3 */
function toEmojiSize(size) {
  if (typeof size === 'number' && !Number.isNaN(size)) return Math.min(3, Math.max(1, size));
  if (typeof size === 'string' && size in EMOJI_SIZE)   return EMOJI_SIZE[size];
  return 1;
}

/** يكتشف هل النص يحتوي روابط */
function hasLinks(text) {
  return /(https?:\/\/|www\.|t\.me\/|fb\.me\/|youtu\.be\/|facebook\.com\/|youtube\.com\/)/i.test(text);
}

/**
 * يستخرج threadID و messageID من استجابة MQTT.
 * يمشي الـ payload بشكل recursive يبحث عن المعرّفات.
 */
function extractIdsFromPayload(response) {
  let messageID = null;
  let threadID  = null;

  function walk(node) {
    if (!Array.isArray(node)) return;

    if (node[0] === 5) {
      const label = node[1];
      if ((label === 'replaceOptimsiticMessage' || label === 'replaceOptimisticMessage') && node[3]) {
        messageID = String(node[3]);
      }
      if (label === 'writeCTAIdToThreadsTable') {
        const inner = node[2];
        if (Array.isArray(inner) && inner[0] === 19) {
          threadID = String(inner[1]);
        }
      }
    }

    for (const child of node) walk(child);
  }

  walk(response?.step);
  return { threadID, messageID };
}

/**
 * يبني بيانات الـ mentions للرسالة.
 * يُعيد null إذا لم توجد mentions.
 */
function buildMentionData(payload, bodyText) {
  if (!Array.isArray(payload.mentions) || payload.mentions.length === 0) return null;

  const ids     = [];
  const offsets = [];
  const lengths = [];
  const types   = [];
  let cursor = 0;

  for (const mention of payload.mentions) {
    const tag      = String(mention.tag || '');
    const nameOnly = tag.replace(/^@+/, '');
    const hintIdx  = Number.isInteger(mention.fromIndex) ? mention.fromIndex : cursor;

    let pos = bodyText.indexOf(tag, hintIdx);
    let pad = 0;
    if (pos === -1) {
      pos = bodyText.indexOf(nameOnly, hintIdx);
    } else {
      pad = tag.length - nameOnly.length;
    }
    if (pos < 0) { pos = 0; pad = 0; }

    const nameStart = pos + pad;
    ids.push(String(mention.id || 0));
    offsets.push(nameStart);
    lengths.push(nameOnly.length);
    types.push('p');
    cursor = nameStart + nameOnly.length;
  }

  return {
    mention_ids:     ids.join(','),
    mention_offsets: offsets.join(','),
    mention_lengths: lengths.join(','),
    mention_types:   types.join(','),
  };
}

/**
 * يُطبّع payload الرسالة — يقبل string أو object أو null.
 */
function coercePayload(input) {
  if (input == null)              return { body: '' };
  if (typeof input === 'string')  return { body: input };
  if (typeof input === 'object')  return input;
  return { body: String(input) };
}

/**
 * يكتشف هل العنصر مرفق تم رفعه مسبقاً (tuple [type, fbid]).
 */
function isPreUploadedTuple(item) {
  return (
    Array.isArray(item) &&
    item.length >= 2 &&
    typeof item[0] === 'string' &&
    (typeof item[1] === 'string' || typeof item[1] === 'number')
  );
}

/**
 * يُطبّق تأخير anti-detection إذا كان مفعّلاً في الإعداد.
 */
async function maybeAntiDetectionDelay(ctx) {
  const ad = ctx?.antiDetection;
  if (!ad?.enabled) return;
  const min = ad.requestDelayMin || 0;
  const max = ad.requestDelayMax || 0;
  if (min > 0 && max > 0) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((r) => setTimeout(r, delay));
  }
}

// ── createSendMessageCommand ─────────────────────────────────────────────

/**
 * يُنشئ دالة sendMessage مرتبطة بسياق FCA.
 *
 * @param {{
 *   ctx:                      object,
 *   uploadAttachment:         Function,
 *   generateOfflineThreadingID: Function,
 *   isReadableStream:         Function,
 *   logError:                 Function|null,
 * }} deps
 * @returns {Function} sendMessage(payload, threadID, callbackOrReplyTo?, replyToID?) => Promise
 */
export function createSendMessageCommand(deps) {
  const { ctx, uploadAttachment, generateOfflineThreadingID, isReadableStream, logError } = deps;

  return async function sendMessage(payload, threadID, callbackOrReplyTo, replyToID) {
    // ── التحقق من threadID ──
    if (typeof threadID === 'function') {
      threadID(new Error('Pass a threadID as second argument.'));
      return;
    }
    if (!threadID) {
      const err = { error: 'threadID is required' };
      const cb  = typeof callbackOrReplyTo === 'function' ? callbackOrReplyTo : compat.ensureNodeCallback();
      cb(err);
      throw err;
    }

    // ── فصل callback عن replyTo ──
    const callback = typeof callbackOrReplyTo === 'function'
      ? callbackOrReplyTo
      : compat.ensureNodeCallback();

    const replyTarget = replyToID
      ?? (typeof callbackOrReplyTo === 'string' ? callbackOrReplyTo : undefined)
      ?? payload?.replyMessageID
      ?? payload?.replyToMessage;

    // ── تطبيع payload ──
    const msg           = coercePayload(payload);
    const body          = msg.body != null ? String(msg.body) : '';
    const sticker       = msg.sticker;
    const emoji         = msg.emoji;
    const emojiSize     = msg.emojiSize;
    const location      = msg.location;
    const attachment    = msg.attachment;
    const forwardIds    = msg.forwardAttachmentIds;

    // ── تأخير anti-detection ──
    await maybeAntiDetectionDelay(ctx);

    // ── بناء task payload ──
    const requestId = Math.floor(100 + Math.random() * 900);
    const epochId   = (BigInt(Date.now()) << 22n).toString();

    const taskPayload = {
      thread_id:                String(threadID),
      otid:                     generateOfflineThreadingID(),
      source:                   SOURCE_DEFAULT,
      send_type:                1,
      sync_group:               1,
      mark_thread_read:         1,
      text:                     body || null,
      initiating_source:        0,
      skip_url_preview_gen:     0,
      text_has_links:           hasLinks(body) ? 1 : 0,
      multitab_env:             0,
      metadata_dataclass:       JSON.stringify({ media_accessibility_metadata: { alt_text: null } }),
    };

    // mentions
    const mentionData = buildMentionData(msg, body);
    if (mentionData) taskPayload.mention_data = mentionData;

    // sticker
    if (sticker) {
      taskPayload.send_type  = 2;
      taskPayload.sticker_id = sticker;
    }

    // emoji
    if (emoji) {
      taskPayload.send_type     = 1;
      taskPayload.text          = emoji;
      taskPayload.hot_emoji_size = toEmojiSize(emojiSize);
    }

    // location
    if (location?.latitude != null && location?.longitude != null) {
      taskPayload.send_type     = 1;
      taskPayload.location_data = {
        coordinates:         { latitude: location.latitude, longitude: location.longitude },
        is_current_location: !!location.current,
        is_live_location:    !!location.live,
      };
    }

    // reply
    if (replyTarget) {
      taskPayload.reply_metadata = {
        reply_source_id:   replyTarget,
        reply_source_type: 1,
        reply_type:        0,
      };
    }

    // مرفقات
    if (attachment) {
      taskPayload.send_type     = 3;
      taskPayload.text          = taskPayload.text || null;
      taskPayload.attachment_fbids = [];

      const items = (Array.isArray(attachment) && !isPreUploadedTuple(attachment))
        ? attachment
        : [attachment];

      const preUploaded = [];
      const streams     = [];

      for (const item of items) {
        if (isPreUploadedTuple(item)) {
          preUploaded.push(String(item[1]));
        } else if (Buffer.isBuffer(item) || isReadableStream(item)) {
          streams.push(item);
        }
      }

      if (preUploaded.length) taskPayload.attachment_fbids.push(...preUploaded);

      if (Array.isArray(forwardIds) && forwardIds.length) {
        taskPayload.attachment_fbids.push(...forwardIds.map(String));
      }

      if (streams.length) {
        try {
          const uploaded = await uploadAttachment(streams);
          for (const result of uploaded) {
            const key = Object.keys(result)[0];
            taskPayload.attachment_fbids.push(String(result[key]));
          }
        } catch (uploadErr) {
          logError?.('uploadAttachment', uploadErr);
          callback(uploadErr);
          throw uploadErr;
        }
      }
    }

    // ── بناء MQTT request ──
    const request = {
      app_id: APP_ID,
      payload: {
        tasks: [
          {
            label:         '46',
            payload:       taskPayload,
            queue_name:    String(threadID),
            task_id:       TASK_SEND_ID,
            failure_count: null,
          },
          {
            label:         '21',
            payload:       { thread_id: String(threadID), last_read_watermark_ts: Date.now(), sync_group: 1 },
            queue_name:    String(threadID),
            task_id:       TASK_READ_ID,
            failure_count: null,
          },
        ],
        epoch_id:      epochId,
        version_id:    VERSION_ID,
        data_trace_id: `#${Buffer.from(String(Math.random())).toString('base64').replace(/=+$/, '')}`,
      },
      request_id: requestId,
      type:       3,
    };

    // تحويل payloads الداخلية إلى JSON strings
    request.payload.tasks   = request.payload.tasks.map((t) => ({ ...t, payload: JSON.stringify(t.payload) }));
    request.payload         = JSON.stringify(request.payload);

    // ── إرسال عبر MQTT ──
    try {
      const result = await lsRequests.publishLsRequestWithAck({
        client:    ctx.mqttClient || null,
        content:   request,
        requestId,
        extract(response) {
          const { threadID: tid, messageID: mid } = extractIdsFromPayload(response.payload);
          return { body: body || null, messageID: mid, threadID: tid };
        },
      });
      callback(undefined, result);
      return result;
    } catch (sendErr) {
      logError?.('sendMessage', sendErr);
      callback(sendErr);
      throw sendErr;
    }
  };
}

export default { createSendMessageCommand };

// ─── Plugin Descriptor ────────────────────────────────────────────────────
/** @type {import('../../../plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-send-message',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/send-message.js' },
  setup(_ctx) { /* provides: createSendMessageCommand */ },
};
