/**
 * @fileoverview Messaging domain type definitions for fca-unofficial.
 */

/**
 * @typedef {object} FcaThread
 * @property {string}   threadID
 * @property {string}   name
 * @property {boolean}  isGroup
 * @property {string[]} participantIDs
 * @property {number}   messageCount
 * @property {string}   [imageSrc]
 * @property {string}   [color]
 * @property {string}   [emoji]
 * @property {object}   [nicknames]     - { [uid]: string }
 * @property {string[]} [adminIDs]
 */

/**
 * @typedef {object} FcaUserInfo
 * @property {string} id
 * @property {string} name
 * @property {string} [firstName]
 * @property {string} [vanity]
 * @property {string} [thumbSrc]
 * @property {string} [profileUrl]
 * @property {string} [gender]      - '1' female, '2' male
 * @property {string} [type]        - 'friend' | 'user' | 'page'
 * @property {boolean} isFriend
 * @property {boolean} isBirthday
 */

/**
 * @typedef {object} FcaReaction
 * Represents a single reaction on a message.
 * @property {string} userID
 * @property {string} reaction  - Emoji character
 */

/**
 * @typedef {object} FcaPoll
 * @property {string}   title
 * @property {string[]} options
 * @property {boolean}  [allowAddOptions]
 */

/**
 * @typedef {'text'|'image'|'video'|'audio'|'file'|'sticker'} FcaMessageType
 */

export const FcaMessageTypes = Object.freeze({
  TEXT:    'text',
  IMAGE:   'image',
  VIDEO:   'video',
  AUDIO:   'audio',
  FILE:    'file',
  STICKER: 'sticker',
});
