/**
 * messenger-context.js — سياق الرسالة الواردة داخل middleware البوت.
 *
 * يُمرَّر إلى كل middleware كـ `ctx`، ويوفر:
 *  - خصائص قراءة سريعة للحدث (threadID, text, …)
 *  - طرق إرسال مُحسَّنة (reply, replyDM) مع دعم E2EE
 */

export class MessengerContext {
  /**
   * @param {import('./messenger-bot.js').MessengerBot} bot
   * @param {object} event - حدث MQTT الخام
   */
  constructor(bot, event) {
    this.bot   = bot;
    this.event = event;
  }

  // ── خصائص الحدث ───────────────────────────────────────────────

  get threadID()  { return this.event.threadID; }
  get senderID()  { return this.event.senderID; }
  get messageID() { return this.event.messageID; }
  get text()      { return (this.event.body ?? '').trim(); }
  get body()      { return this.event.body; }
  get message()   { return this.event; }

  /**
   * واجهة API المباشرة — يُستخدم بواسطة CommandRegistry
   * لإرسال رسائل الخطأ (guard errors) داخل الأوامر.
   */
  get api() { return this.bot.api; }

  // ── نوع المحادثة ──────────────────────────────────────────────

  /** true إذا كانت الرسالة من مجموعة */
  get isGroup() { return !!this.event.isGroup; }

  /** true إذا كانت رسالة خاصة (DM) — عادية أو مشفرة */
  get isDM()    { return !this.event.isGroup; }

  /** true إذا كانت رسالة مشفرة E2EE (Secret Conversation) */
  get isE2EE()  { return !!this.event.isE2EE; }

  // ── إرسال ─────────────────────────────────────────────────────

  /**
   * رد على نفس المحادثة (مجموعة أو DM).
   * يُوجَّه تلقائياً عبر E2EE إذا كانت الرسالة مشفرة.
   *
   * @param {*}      message
   * @param {string} [replyToID]
   */
  reply(message, replyToID) {
    const threadID = this.event.threadID;
    if (threadID == null) throw new Error('MessengerContext.reply: threadID is missing');
    return this._send(String(threadID), message, replyToID);
  }

  /** نسخة async من reply — تُرجع دائماً Promise */
  async replyAsync(message, replyToID) {
    const result = this.reply(message, replyToID);
    return result && typeof result.then === 'function' ? result : Promise.resolve(result);
  }

  /**
   * رد خاص مباشرة للمرسل (حتى لو جاءت الرسالة من مجموعة).
   *
   * @param {*}      message
   * @param {string} [replyToID]
   */
  replyDM(message, replyToID) {
    const dmThreadID = this.event.senderID;
    if (dmThreadID == null) throw new Error('MessengerContext.replyDM: senderID is missing');
    return this._send(String(dmThreadID), message, replyToID);
  }

  /** نسخة async من replyDM */
  async replyDMAsync(message, replyToID) {
    const result = this.replyDM(message, replyToID);
    return result && typeof result.then === 'function' ? result : Promise.resolve(result);
  }

  // ── داخلي ─────────────────────────────────────────────────────

  /**
   * منطق الإرسال المشترك — يختار E2EE أو MQTT حسب الحالة.
   * @param {string} targetThreadID
   * @param {*}      message
   * @param {string} [replyToID]
   */
  _send(targetThreadID, message, replyToID) {
    const { api } = this.bot;
    const e2ee    = api?.e2ee;

    if (this.event.isE2EE && e2ee?.isConnected?.()) {
      const promise = e2ee.sendMessage(targetThreadID, message, replyToID);
      promise?.catch?.(() => {});
      return promise;
    }

    const promise = api.sendMessage.call(api, message, targetThreadID, replyToID);
    promise?.catch?.(() => {});
    return promise;
  }
}

export default { MessengerContext };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-messenger-context',
  meta: { category: 'app', path: 'lib/app/messenger-context.js' },
  setup(_ctx) { /* provides: MessengerContext */ },
};
