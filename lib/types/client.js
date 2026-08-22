/**
 * @fileoverview Client/API type definitions for fca-unofficial.
 *
 * Documents the shape of the `api` object returned by `login()` and the
 * `createFcaClient()` namespace object for IDE support.
 *
 * @example
 * // JSDoc usage in your bot file:
 * /** @param {FcaApi} api *\/
 * function setup(api) {
 *   api.sendMessage('Hello!', threadID);
 * }
 */

// ─── JSDOC TYPE DEFINITIONS ──────────────────────────────────────────────────

/**
 * @typedef {object} FcaApi
 * The flat legacy API object — every method is a top-level property.
 *
 * @property {function(string|FcaSendBody, string, function=): Promise} sendMessage
 * @property {function(string, string, function=): Promise} editMessage
 * @property {function(string, string, function=): Promise} deleteMessage
 * @property {function(string, string, function=): Promise} unsendMessage
 * @property {function(string, string, function=): Promise} getMessage
 * @property {function(string|string[], function=): Promise} markAsRead
 * @property {function(function=): Promise} markAsReadAll
 * @property {function(string, boolean, function=): Promise} sendTypingIndicator
 * @property {function(string, string, string, function=): Promise} setMessageReaction
 * @property {function(string[], function=): Promise} getUserInfo
 * @property {function(string, function=): Promise} getThreadInfo
 * @property {function(number, number, function=): Promise} getThreadList
 * @property {function(): string} getCurrentUserID
 * @property {function(): Array} getAppState
 * @property {function(): string} getCookies
 * @property {function(object): void} setOptions
 * @property {function(): object} listenMqtt   - Returns an EventEmitter for realtime events
 * @property {function(): void}   stopListening
 * @property {function(): Promise} stopListeningAsync
 */

/**
 * @typedef {object} FcaSendBody
 * Rich message body for sendMessage.
 *
 * @property {string}  [body]           - Text content
 * @property {Array}   [attachment]     - Readable streams or attachment objects
 * @property {string}  [url]            - URL to attach
 * @property {string}  [sticker]        - Sticker ID
 * @property {string}  [replyMessageID] - Reply to this message ID
 * @property {Array}   [mentions]       - [{tag, id, fromIndex, length}]
 */

/**
 * @typedef {object} FcaClient
 * The structured namespace API from `createFcaClient(api)`.
 *
 * @property {object} messages
 * @property {function} messages.send
 * @property {function} messages.edit
 * @property {function} messages.delete
 * @property {function} messages.unsend
 * @property {function} messages.markRead
 * @property {function} messages.typing
 * @property {function} messages.react
 * @property {function} messages.uploadAttachment
 *
 * @property {object} threads
 * @property {function} threads.getInfo
 * @property {function} threads.getList
 * @property {function} threads.getHistory
 * @property {function} threads.createGroup
 * @property {function} threads.addUsers
 * @property {function} threads.removeUser
 * @property {function} threads.setTitle
 * @property {function} threads.setNickname
 * @property {function} threads.createPoll
 *
 * @property {object} users
 * @property {function} users.getInfo
 * @property {function} users.getID
 * @property {function} users.getFriends
 *
 * @property {object} account
 * @property {function} account.getCurrentUserID
 * @property {function} account.getAppState
 * @property {function} account.logout
 * @property {function} account.refreshDtsg
 *
 * @property {object} realtime
 * @property {function} realtime.listen
 * @property {function} realtime.stop
 * @property {function} realtime.useMiddleware
 */

/**
 * @typedef {object} FcaLoginInput
 * @property {Array}   [appState]  - Cookie array from a previous session
 * @property {string}  [Cookie]    - Cookie header string (alternative to appState)
 * @property {string}  [email]     - Facebook email (used with password login)
 * @property {string}  [password]  - Facebook password
 */

/**
 * @typedef {object} FcaLoginOptions
 * @property {'silent'|'info'|'warn'|'error'} [logLevel]
 * @property {boolean} [selfListen]      - Receive own messages (default: false)
 * @property {boolean} [listenEvents]    - Receive thread events (default: false)
 * @property {boolean} [autoReconnect]   - Reconnect MQTT on drop (default: true)
 * @property {boolean} [forceLogin]      - Bypass AppState validation (default: false)
 * @property {string}  [userAgent]       - Override browser UA
 */

// ─── NAMED EXPORTS (allow re-export via index.js) ────────────────────────────
// These are marker objects — they carry the JSDoc types above for IDE tooling.

/** Marker: FcaApi shape reference */
export const FcaApiShape = Object.freeze({ _type: 'FcaApi' });
/** Marker: FcaClient namespace shape reference */
export const FcaClientShape = Object.freeze({ _type: 'FcaClient' });
/** Marker: FcaLoginInput shape reference */
export const FcaLoginInputShape = Object.freeze({ _type: 'FcaLoginInput' });
