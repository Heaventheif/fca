/**
 * @fileoverview Core context/state type definitions for fca-unofficial.
 */

/**
 * @typedef {object} FcaContext
 * The internal context object passed throughout the library.
 * (The `ctx` / state object — not the public API.)
 *
 * @property {string}  fbid          - Logged-in user's Facebook ID
 * @property {string}  userID        - Alias for fbid
 * @property {object}  jar           - tough-cookie CookieJar for this session
 * @property {string}  cookieString  - Raw Cookie header string
 * @property {string}  [fb_dtsg]     - Anti-CSRF token
 * @property {string}  [access_token]
 * @property {object}  globalOptions - Resolved login options
 * @property {object}  options       - Alias for globalOptions
 * @property {object}  mqttClient    - MQTT client instance (null until listenMqtt)
 * @property {boolean} loggedIn
 * @property {boolean} firstListen
 */

/**
 * @typedef {object} FcaAppStateCookie
 * One entry in the appState array.
 * @property {string} key
 * @property {string} value
 * @property {string} domain
 * @property {string} path
 * @property {boolean} [secure]
 * @property {boolean} [httpOnly]
 */

export const FcaLogLevels = Object.freeze({
  SILENT: 'silent',
  INFO:   'info',
  WARN:   'warn',
  ERROR:  'error',
});
