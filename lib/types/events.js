/**
 * @fileoverview Event type constants and JSDoc definitions for fca-unofficial.
 *
 * All event names emitted by the realtime listener (listenMqtt / MessengerBot).
 * Import these constants instead of hardcoding strings to get IDE autocomplete
 * and to catch typos at lint-time rather than runtime.
 *
 * @example
 * import { FCA_EVENT, FcaEventType } from 'fca-unofficial/lib/types/events.js';
 *
 * bot.on(FCA_EVENT.MESSAGE, (event) => { ... });
 * bot.on(FCA_EVENT.TYPING_START, (event) => { ... });
 */

// ─── EVENT NAME CONSTANTS ────────────────────────────────────────────────────

/** All event names emitted by the realtime listener. */
export const FCA_EVENT = Object.freeze({
  // Message lifecycle
  MESSAGE:          'message',
  MESSAGE_CREATE:   'messageCreate',
  MESSAGE_REPLY:    'message_reply',
  MESSAGE_DELETE:   'messageDelete',        // message_unsend
  MESSAGE_SEEN:     'message_seen',

  // Reactions
  MESSAGE_REACTION_ADD: 'messageReactionAdd', // message_reaction

  // Typing
  TYPING_START: 'typingStart',
  TYPING_STOP:  'typingStop',

  // Thread/group events
  THREAD_UPDATE: 'threadUpdate',           // group member add/remove, rename, etc.
  EVENT:         'event',                  // raw thread event

  // Presence
  PRESENCE: 'presence',

  // Connection
  READY:       'ready',
  SHARD_READY: 'shardReady',
  ERROR:       'error',

  // Raw catch-all
  UPDATE: 'update',
  RAW:    'raw',
});

// ─── JSDOC TYPE DEFINITIONS ──────────────────────────────────────────────────

/**
 * @typedef {object} FcaMessage
 * @property {'message'|'message_reply'} type
 * @property {string}  threadID      - ID of the conversation thread
 * @property {string}  senderID      - Facebook UID of the sender
 * @property {string}  messageID     - Unique message ID
 * @property {string}  [body]        - Plain-text body of the message
 * @property {number}  timestamp     - Unix timestamp (ms)
 * @property {boolean} isGroup       - Whether the thread is a group
 * @property {Array<FcaAttachment>} [attachments] - Attached files/media
 * @property {string}  [repliedMessageID] - If type===message_reply, the parent ID
 */

/**
 * @typedef {object} FcaAttachment
 * @property {'photo'|'video'|'audio'|'file'|'sticker'|'location'} type
 * @property {string} [url]
 * @property {string} [name]
 * @property {number} [fileSize]
 */

/**
 * @typedef {object} FcaReactionEvent
 * @property {'message_reaction'} type
 * @property {string} threadID
 * @property {string} messageID
 * @property {string} senderID
 * @property {string} reaction   - Emoji character, or '' for removal
 * @property {'add'|'remove'} userID
 */

/**
 * @typedef {object} FcaTypingEvent
 * @property {'typ'} type
 * @property {string}  threadID
 * @property {string}  senderID
 * @property {boolean} isTyping
 */

/**
 * @typedef {object} FcaThreadEvent
 * @property {'event'} type
 * @property {string}  threadID
 * @property {string}  logMessageType  - e.g. 'log:subscribe', 'log:unsubscribe', 'log:thread-name'
 * @property {string}  [logMessageBody]
 * @property {object}  [logMessageData]
 * @property {Array<string>} [author]
 */

/**
 * @typedef {'message'|'message_reply'|'message_reaction'|'typ'|'event'|'presence'|'error'} FcaEventType
 */
