/**
 * @fileoverview Thread management type definitions for fca-unofficial.
 */

/**
 * @typedef {object} FcaThreadListOptions
 * @property {number} limit          - Number of threads to fetch
 * @property {number} [timestamp]    - Fetch threads older than this timestamp
 * @property {'inbox'|'pending'|'other'|'spam'} [folder]
 */

/**
 * @typedef {object} FcaThreadHistoryOptions
 * @property {string}  threadID
 * @property {number}  amount        - Number of messages
 * @property {number}  [timestamp]   - Fetch messages before this timestamp
 */

/**
 * @typedef {object} FcaGroupImage
 * Passed to threads.setImage / changeGroupImage.
 * @property {string} [url]          - Remote image URL, OR
 * @property {import('node:stream').Readable} [stream] - Local file stream
 */

/**
 * @typedef {object} FcaMessageRequestAction
 * @property {string}  threadID
 * @property {'accept'|'delete'} action
 */

export const FcaThreadFolders = Object.freeze({
  INBOX:   'inbox',
  PENDING: 'pending',
  OTHER:   'other',
  SPAM:    'spam',
});
