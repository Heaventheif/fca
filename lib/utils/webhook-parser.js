import crypto from 'node:crypto';
import logger from '../func/logger.js';

export class WebhookParser {
  
  constructor(opts = {}) {
    if (!opts.appSecret) throw new Error('WebhookParser: appSecret مطلوب');
    this._secret = opts.appSecret;
    this._verifyToken = opts.verifyToken ?? null;
    this._strict = opts.strict !== false;
  }

  
  verifySignature(req) {
    const header = req.headers?.['x-hub-signature-256'] ?? req.headers?.['x-hub-signature'] ?? null;

    if (!header) {
      if (this._strict) {
        logger('[Webhook] ❌ طلب بدون توقيع X-Hub-Signature-256', 'error');
        return false;
      }
      logger('[Webhook] ⚠️ طلب بدون توقيع (strict=false)', 'warn');
      return true;
    }

    const [algo, signature] = header.split('=');
    const hmacAlgo = algo === 'sha1' ? 'sha1' : 'sha256';

    const rawBody =
      req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    const expected = crypto.createHmac(hmacAlgo, this._secret).update(rawBody).digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );

    if (!valid) logger('[Webhook] ❌ توقيع HMAC غير صحيح', 'error');
    return valid;
  }

  
  verifyChallenge(query) {
    if (query['hub.mode'] !== 'subscribe') return null;
    if (this._verifyToken && query['hub.verify_token'] !== this._verifyToken) {
      logger('[Webhook] ❌ verify_token غير مطابق', 'error');
      return null;
    }
    return query['hub.challenge'] ?? null;
  }

  
  parse(body) {
    try {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      if (!data || data.object !== 'page') return [];

      const events = [];
      for (const entry of data.entry ?? []) {
        for (const msg of entry.messaging ?? []) {
          const base = {
            pageId: entry.id,
            timestamp: msg.timestamp,
            senderId: msg.sender?.id ?? null,
            recipientId: msg.recipient?.id ?? null,
          };

          if (msg.message) {
            events.push({ ...base, type: 'message', message: msg.message });
          } else if (msg.delivery) {
            events.push({ ...base, type: 'delivery', delivery: msg.delivery });
          } else if (msg.read) {
            events.push({ ...base, type: 'read', read: msg.read });
          } else if (msg.postback) {
            events.push({ ...base, type: 'postback', postback: msg.postback });
          } else if (msg.reaction) {
            events.push({ ...base, type: 'reaction', reaction: msg.reaction });
          } else {
            events.push({ ...base, type: 'unknown', raw: msg });
          }
        }
      }
      return events;
    } catch (e) {
      logger(`[Webhook] ❌ فشل التحليل: ${e?.message}`, 'error');
      return [];
    }
  }
}

export function createWebhookParser(opts) {
  return new WebhookParser(opts);
}

export default WebhookParser;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-webhook-parser',
  meta: { category: 'utils', path: 'lib/utils/webhook-parser.js' },
  setup(_ctx) {
    // provides: WebhookParser, createWebhookParser
  },
};
