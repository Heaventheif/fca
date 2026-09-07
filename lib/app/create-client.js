/**
 * create-client.js — بناء كائن FcaClient المنظَّم بفضاءات أسمية.
 *
 * يأخذ كائن API الخام ويُعيد واجهة منظَّمة تضم:
 *   messages | threads | users | account | realtime | http | scheduler
 */

// ── أدوات ربط الدوال ──────────────────────────────────────────────

/**
 * اربط دالة اختيارية من كائن API. تُرجع undefined إذا لم تكن دالة.
 * @param {object} api
 * @param {string} method
 */
function bindOptional(api, method) {
  return typeof api[method] === 'function' ? api[method].bind(api) : undefined;
}

/**
 * اقرأ عضواً اختيارياً من كائن API (لا يجب أن يكون دالة).
 * @param {object} api
 * @param {string} key
 */
function readOptional(api, key) {
  return typeof api[key] !== 'undefined' ? api[key] : undefined;
}

/**
 * اربط دالة مطلوبة — تُرمى استثناء إذا لم تكن متاحة وقت الاستدعاء.
 * @param {object} api
 * @param {string} method
 */
function bindRequired(api, method) {
  return (...args) => {
    if (typeof api[method] !== 'function') {
      throw new Error(`API method "${method}" is not available`);
    }
    return api[method].apply(api, args);
  };
}

/**
 * اقرأ فضاء اسمياً موجوداً من API (كائن، ليس دالة).
 * @param {object} api
 * @param {string} key
 */
function readNamespace(api, key) {
  const val = api[key];
  return val && typeof val === 'object' ? val : undefined;
}

/**
 * أزل المفاتيح undefined من كائن.
 * @param {object} obj
 */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ── بناء فضاءات الأسماء الافتراضية ────────────────────────────────

/**
 * أنشئ فضاءات الأسماء من دوال API الخام.
 * @param {object} api
 */
function buildFallbackNamespaces(api) {
  return {
    messages: compact({
      send:             bindOptional(api, 'sendMessage'),
      edit:             bindOptional(api, 'editMessage'),
      delete:           bindOptional(api, 'deleteMessage'),
      unsend:           bindOptional(api, 'unsendMessage'),
      get:              bindOptional(api, 'getMessage'),
      markRead:         bindOptional(api, 'markAsRead'),
      markReadAll:      bindOptional(api, 'markAsReadAll'),
      markSeen:         bindOptional(api, 'markAsSeen'),
      markDelivered:    bindOptional(api, 'markAsDelivered'),
      typing:           bindOptional(api, 'sendTypingIndicator'),
      react:            bindOptional(api, 'setMessageReaction'),
      shareContact:     bindOptional(api, 'shareContact'),
      getEmojiUrl:      bindOptional(api, 'getEmojiUrl'),
      resolvePhotoUrl:  bindOptional(api, 'resolvePhotoUrl'),
      uploadAttachment: bindOptional(api, 'uploadAttachment'),
      forwardAttachment:bindOptional(api, 'forwardAttachment'),
    }),

    threads: compact({
      createGroup:          bindOptional(api, 'createNewGroup'),
      getInfo:              bindOptional(api, 'getThreadInfo'),
      getList:              bindOptional(api, 'getThreadList'),
      getHistory:           bindOptional(api, 'getThreadHistory'),
      getPictures:          bindOptional(api, 'getThreadPictures'),
      addUsers:             bindOptional(api, 'addUserToGroup'),
      archive:              bindOptional(api, 'changeArchivedStatus'),
      removeUser:           bindOptional(api, 'removeUserFromGroup'),
      setAdmin:             bindOptional(api, 'changeAdminStatus'),
      setImage:             bindOptional(api, 'changeGroupImage'),
      setColor:             bindOptional(api, 'changeThreadColor'),
      setEmoji:             bindOptional(api, 'changeThreadEmoji'),
      setNickname:          bindOptional(api, 'changeNickname'),
      createPoll:           bindOptional(api, 'createPoll'),
      createThemeAI:        bindOptional(api, 'createThemeAI'),
      getThemePictures:     bindOptional(api, 'getThemePictures'),
      delete:               bindOptional(api, 'deleteThread'),
      colors:               readOptional(api, 'threadColors'),
      handleMessageRequest: bindOptional(api, 'handleMessageRequest'),
      mute:                 bindOptional(api, 'muteThread'),
      setTitle:             bindOptional(api, 'setTitle'),
      search:               bindOptional(api, 'searchForThread'),
    }),

    users: compact({
      getID:      bindOptional(api, 'getUserID'),
      getInfo:    bindOptional(api, 'getUserInfo'),
      getInfoV2:  bindOptional(api, 'getUserInfoV2'),
      getFriends: bindOptional(api, 'getFriendsList'),
    }),

    account: compact({
      addExternalModule:    bindOptional(api, 'addExternalModule'),
      changeAvatar:         bindOptional(api, 'changeAvatar'),
      changeBio:            bindOptional(api, 'changeBio'),
      enableAutoSave:       bindOptional(api, 'enableAutoSaveAppState'),
      getCurrentUserID:     bindOptional(api, 'getCurrentUserID'),
      handleFriendRequest:  bindOptional(api, 'handleFriendRequest'),
      logout:               bindOptional(api, 'logout'),
      refreshDtsg:          bindOptional(api, 'refreshFb_dtsg'),
      changeBlockedStatus:  bindOptional(api, 'changeBlockedStatus'),
      setOptions:           bindOptional(api, 'setOptions'),
      setPostReaction:      bindOptional(api, 'setPostReaction'),
      unfriend:             bindOptional(api, 'unfriend'),
      getAppState:          bindOptional(api, 'getAppState'),
      getCookies:           bindOptional(api, 'getCookies'),
    }),

    realtime: compact({
      listen:             bindRequired(api, 'listenMqtt'),
      stop:               bindRequired(api, 'stopListening'),
      stopAsync:          bindRequired(api, 'stopListeningAsync'),
      useMiddleware:      bindRequired(api, 'useMiddleware'),
      removeMiddleware:   bindRequired(api, 'removeMiddleware'),
      clearMiddleware:    bindRequired(api, 'clearMiddleware'),
      listMiddleware:     bindRequired(api, 'listMiddleware'),
      setMiddlewareEnabled: bindRequired(api, 'setMiddlewareEnabled'),
    }),

    http: compact({
      get:          bindOptional(api, 'httpGet'),
      post:         bindOptional(api, 'httpPost'),
      postFormData: bindOptional(api, 'postFormData'),
    }),

    scheduler: compact(readOptional(api, 'scheduler') || {}),
  };
}

/**
 * ادمج فضاء اسمي مع نسخة مخصصة من API (إن وُجدت).
 * @param {object} fallback
 * @param {object} [override]
 */
function mergeNamespace(fallback, override) {
  return compact({ ...fallback, ...(override || {}) });
}

// ── الدوال الرئيسية ───────────────────────────────────────────────

/**
 * أنشئ FcaClient من فضاءات أسماء جاهزة.
 * @param {object} rawApi
 * @param {object} namespaces
 * @returns {FcaClient}
 */
export function createFcaClientFromNamespaces(rawApi, namespaces) {
  return {
    raw:       rawApi,
    messages:  compact(namespaces.messages),
    threads:   compact(namespaces.threads),
    users:     compact(namespaces.users),
    account:   compact(namespaces.account),
    realtime:  compact(namespaces.realtime),
    http:      compact(namespaces.http),
    scheduler: compact(namespaces.scheduler),
  };
}

/**
 * أنشئ FcaClient من كائن API خام.
 * يدمج فضاءات الأسماء الافتراضية مع أي فضاءات مخصصة موجودة على API.
 * @param {object} api
 * @returns {FcaClient}
 */
export function createFcaClient(api) {
  const fallback = buildFallbackNamespaces(api);

  return createFcaClientFromNamespaces(api, {
    messages:  mergeNamespace(fallback.messages,  readNamespace(api, 'messages')),
    threads:   mergeNamespace(fallback.threads,   readNamespace(api, 'threads')),
    users:     mergeNamespace(fallback.users,     readNamespace(api, 'users')),
    account:   mergeNamespace(fallback.account,   readNamespace(api, 'account')),
    realtime:  mergeNamespace(fallback.realtime,  readNamespace(api, 'realtime')),
    http:      mergeNamespace(fallback.http,      readNamespace(api, 'http')),
    scheduler: mergeNamespace(fallback.scheduler, readNamespace(api, 'scheduler')),
  });
}

export default { createFcaClient, createFcaClientFromNamespaces };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-app-create-client',
  meta: { category: 'app', path: 'lib/app/create-client.js' },
  setup(_ctx) {
    // provides: createFcaClient, createFcaClientFromNamespaces
  },
};
