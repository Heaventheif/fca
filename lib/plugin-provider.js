/**
 * @file lib/plugin-provider.js
 * @description مزوّد البلاجينات المركزي — lazy registry بدلاً من 341 static import.
 *
 * كل فئة تُحمَّل فقط عند الطلب عبر dynamic import().
 * هذا يُقلّل وقت الإقلاع ويُلغي تحميل ملفات غير مستخدمة.
 *
 * @example
 *   import { registerAll } from './lib/plugin-provider.js';
 *   await registerAll(ps);
 *   await registerAll(ps, { categories: ['safety', 'database'] });
 *   await registerAll(ps, { exclude: ['fca-workers-delta-pool'] });
 *
 * @typedef {{
 *   name:        string,
 *   meta?:       { category?: string, path?: string },
 *   middlewares?: Function[],
 *   pipes?:       Record<string, Function>,
 *   commands?:    Array<{name:string, handler:Function, options?:object}>,
 *   events?:      Record<string, Function>,
 *   setup?:      (ctx: object) => void | Promise<void>,
 * }} FcaPlugin
 */

// ── Lazy Registry ─────────────────────────────────────────────────────────
// كل مدخلة: [category, () => import(path)]
// يُحمَّل الملف فقط عند استدعاء registerAll مع تلك الفئة.

/** @type {Array<[string, () => Promise<{ $plugin: FcaPlugin }>]>} */
const LAZY_REGISTRY = [
  // app
  ['app', () => import('./app/attach-legacy-api.js')],
  ['app', () => import('./app/conduit-layer.js')],
  ['app', () => import('./app/create-client.js')],
  ['app', () => import('./app/messenger-bot.js')],
  ['app', () => import('./app/messenger-client.js')],
  ['app', () => import('./app/messenger-context.js')],
  ['app', () => import('./app/plugin-system.js')],
  // command
  ['command', () => import('./command/registry.js')],
  // compat
  ['compat', () => import('./compat/api-registry.js')],
  ['compat', () => import('./compat/callbackify.js')],
  ['compat', () => import('./compat/legacy-promise.js')],
  // core
  ['core', () => import('./core/auth-helpers.js')],
  ['core', () => import('./core/auth.js')],
  ['core', () => import('./core/config.js')],
  ['core', () => import('./core/login-helper.impl.js')],
  ['core', () => import('./core/login-helper.js')],
  ['core', () => import('./core/mqtt.js')],
  ['core', () => import('./core/options.js')],
  ['core', () => import('./core/request.js')],
  ['core', () => import('./core/state.js')],
  ['core', () => import('./core/thread-info-realtime-sync.js')],
  // database
  ['database', () => import('./database/helpers.js')],
  ['database', () => import('./database/jsonStore.js')],
  ['database', () => import('./database/models/index.js')],
  ['database', () => import('./database/mongoStore.js')],
  ['database', () => import('./database/postgresStore.js')],
  ['database', () => import('./database/threadData.js')],
  ['database', () => import('./database/userData.js')],
  // domain-account
  ['domain-account', () => import('./domains/account/account.types.js')],
  ['domain-account', () => import('./domains/account/commands/add-external-module.js')],
  ['domain-account', () => import('./domains/account/commands/change-avatar.js')],
  ['domain-account', () => import('./domains/account/commands/change-bio.js')],
  ['domain-account', () => import('./domains/account/commands/change-blocked-status.js')],
  ['domain-account', () => import('./domains/account/commands/enable-auto-save-app-state.js')],
  ['domain-account', () => import('./domains/account/commands/follow.js')],
  ['domain-account', () => import('./domains/account/commands/get-current-user-id.js')],
  ['domain-account', () => import('./domains/account/commands/handle-friend-request.js')],
  ['domain-account', () => import('./domains/account/commands/logout.js')],
  ['domain-account', () => import('./domains/account/commands/refresh-fb-dtsg.js')],
  ['domain-account', () => import('./domains/account/commands/set-post-reaction.js')],
  ['domain-account', () => import('./domains/account/commands/set-profile-guard.js')],
  ['domain-account', () => import('./domains/account/commands/unfriend.js')],
  ['domain-account', () => import('./domains/account/index.js')],
  // domain-http
  ['domain-http', () => import('./domains/http/commands/http-post.js')],
  ['domain-http', () => import('./domains/http/commands/post-form-data.js')],
  ['domain-http', () => import('./domains/http/index.js')],
  ['domain-http', () => import('./domains/http/queries/http-get.js')],
  // domain-media
  ['domain-media', () => import('./domains/media/commands/create-post.js')],
  ['domain-media', () => import('./domains/media/index.js')],
  ['domain-media', () => import('./domains/media/queries/search-stickers.js')],
  // domain-messages
  ['domain-messages', () => import('./domains/messages/commands/change-thread-color.js')],
  ['domain-messages', () => import('./domains/messages/commands/change-thread-emoji.js')],
  ['domain-messages', () => import('./domains/messages/commands/delete-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/edit-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/forward-attachment.js')],
  ['domain-messages', () => import('./domains/messages/commands/mark-delivered.js')],
  ['domain-messages', () => import('./domains/messages/commands/mark-read-all.js')],
  ['domain-messages', () => import('./domains/messages/commands/mark-read.js')],
  ['domain-messages', () => import('./domains/messages/commands/mark-seen.js')],
  ['domain-messages', () => import('./domains/messages/commands/pin-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/search-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/send-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/send-typing-indicator-v2.js')],
  ['domain-messages', () => import('./domains/messages/commands/send-typing-indicator.js')],
  ['domain-messages', () => import('./domains/messages/commands/set-message-reaction.js')],
  ['domain-messages', () => import('./domains/messages/commands/share-contact.js')],
  ['domain-messages', () => import('./domains/messages/commands/share-link.js')],
  ['domain-messages', () => import('./domains/messages/commands/unsend-message.js')],
  ['domain-messages', () => import('./domains/messages/commands/upload-attachment.js')],
  ['domain-messages', () => import('./domains/messages/index.js')],
  ['domain-messages', () => import('./domains/messages/message.types.js')],
  ['domain-messages', () => import('./domains/messages/queries/get-emoji-url.js')],
  ['domain-messages', () => import('./domains/messages/queries/get-message.js')],
  ['domain-messages', () => import('./domains/messages/queries/get-thread-colors.js')],
  ['domain-messages', () => import('./domains/messages/queries/resolve-photo-url.js')],
  // domain-realtime
  ['domain-realtime', () => import('./domains/realtime/async-listen.js')],
  ['domain-realtime', () => import('./domains/realtime/emit-auth.js')],
  ['domain-realtime', () => import('./domains/realtime/index.js')],
  ['domain-realtime', () => import('./domains/realtime/listener.js')],
  ['domain-realtime', () => import('./domains/realtime/middleware.js')],
  ['domain-realtime', () => import('./domains/realtime/parse-delta.js')],
  // domain-scheduler
  ['domain-scheduler', () => import('./domains/scheduler/index.js')],
  // domain-threads
  ['domain-threads', () => import('./domains/threads/commands/add-users-to-group.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-admin-status.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-archived-status.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-group-image.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-nickname.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-thread-color.js')],
  ['domain-threads', () => import('./domains/threads/commands/change-thread-emoji.js')],
  ['domain-threads', () => import('./domains/threads/commands/create-new-group.js')],
  ['domain-threads', () => import('./domains/threads/commands/create-poll.js')],
  ['domain-threads', () => import('./domains/threads/commands/create-theme-ai.js')],
  ['domain-threads', () => import('./domains/threads/commands/delete-thread.js')],
  ['domain-threads', () => import('./domains/threads/commands/handle-message-request.js')],
  ['domain-threads', () => import('./domains/threads/commands/mute-thread.js')],
  ['domain-threads', () => import('./domains/threads/commands/remove-user-from-group.js')],
  ['domain-threads', () => import('./domains/threads/commands/set-title.js')],
  ['domain-threads', () => import('./domains/threads/index.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-theme-pictures.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-thread-colors.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-thread-history.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-thread-info.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-thread-list.js')],
  ['domain-threads', () => import('./domains/threads/queries/get-thread-pictures.js')],
  ['domain-threads', () => import('./domains/threads/queries/search-for-thread.js')],
  ['domain-threads', () => import('./domains/threads/thread.types.js')],
  // domain-users
  ['domain-users', () => import('./domains/users/index.js')],
  ['domain-users', () => import('./domains/users/queries/get-friends-list.js')],
  ['domain-users', () => import('./domains/users/queries/get-user-id.js')],
  ['domain-users', () => import('./domains/users/queries/get-user-info-v2.js')],
  ['domain-users', () => import('./domains/users/queries/get-user-info.js')],
  ['domain-users', () => import('./domains/users/shared.js')],
  ['domain-users', () => import('./domains/users/user.types.js')],
  // errors
  ['core', () => import('./errors.js')],
  // external-apis
  ['external-action',  () => import('./external-apis/action/acpUser.js')],
  ['external-action',  () => import('./external-apis/action/addExternalModule.js')],
  ['external-action',  () => import('./external-apis/action/advancedSessionGuard.js')],
  ['external-action',  () => import('./external-apis/action/changeAvatar.js')],
  ['external-action',  () => import('./external-apis/action/changeAvatarV2.js')],
  ['external-action',  () => import('./external-apis/action/changeBio.js')],
  ['external-action',  () => import('./external-apis/action/changeCover.js')],
  ['external-action',  () => import('./external-apis/action/changeName.js')],
  ['external-action',  () => import('./external-apis/action/changeUsername.js')],
  ['external-action',  () => import('./external-apis/action/createCommentPost.js')],
  ['external-action',  () => import('./external-apis/action/createPost.js')],
  ['external-action',  () => import('./external-apis/action/enableAutoSaveAppState.js')],
  ['external-action',  () => import('./external-apis/action/follow.js')],
  ['external-action',  () => import('./external-apis/action/getCurrentUserID.js')],
  ['external-action',  () => import('./external-apis/action/handleFriendRequest.js')],
  ['external-action',  () => import('./external-apis/action/logout.js')],
  ['external-action',  () => import('./external-apis/action/refreshFb_dtsg.js')],
  ['external-action',  () => import('./external-apis/action/sendComment.js')],
  ['external-action',  () => import('./external-apis/action/sendFriendRequest.js')],
  ['external-action',  () => import('./external-apis/action/setActiveStatus.js')],
  ['external-action',  () => import('./external-apis/action/setPostReaction.js')],
  ['external-action',  () => import('./external-apis/action/setProfileGuard.js')],
  ['external-action',  () => import('./external-apis/action/setProfileLock.js')],
  ['external-action',  () => import('./external-apis/action/setStoryReaction.js')],
  ['external-action',  () => import('./external-apis/action/setStorySeen.js')],
  ['external-action',  () => import('./external-apis/action/shareLink.js')],
  ['external-action',  () => import('./external-apis/action/story.js')],
  ['external-action',  () => import('./external-apis/action/storyManager.js')],
  ['external-action',  () => import('./external-apis/action/unfriend.js')],
  ['external-app',     () => import('./external-apis/app/botManager.js')],
  ['external-command', () => import('./external-apis/command/CommandSystem.js')],
  ['external-database',() => import('./external-apis/database/DatabaseManager.js')],
  ['external-error',   () => import('./external-apis/error/ErrorHandler.js')],
  ['external-index',   () => import('./external-apis/index.js')],
  ['external-messaging',() => import('./external-apis/messaging/addUserToGroup.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeAdminStatus.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeArchivedStatus.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeBlockedStatus.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeBlockedStatusMqtt.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeGroupImage.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeNickname.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeThreadColor.js')],
  ['external-messaging',() => import('./external-apis/messaging/changeThreadEmoji.js')],
  ['external-messaging',() => import('./external-apis/messaging/createNewGroup.js')],
  ['external-messaging',() => import('./external-apis/messaging/createPoll.js')],
  ['external-messaging',() => import('./external-apis/messaging/createThemeAI.js')],
  ['external-messaging',() => import('./external-apis/messaging/deleteMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/deleteThread.js')],
  ['external-messaging',() => import('./external-apis/messaging/editMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/forwardAttachment.js')],
  ['external-messaging',() => import('./external-apis/messaging/forwardMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/gcrule.js')],
  ['external-messaging',() => import('./external-apis/messaging/getEmojiUrl.js')],
  ['external-messaging',() => import('./external-apis/messaging/getFriendsList.js')],
  ['external-messaging',() => import('./external-apis/messaging/getMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/getThemePictures.js')],
  ['external-messaging',() => import('./external-apis/messaging/getThreadTheme.js')],
  ['external-messaging',() => import('./external-apis/messaging/handleMessageRequest.js')],
  ['external-messaging',() => import('./external-apis/messaging/markAsDelivered.js')],
  ['external-messaging',() => import('./external-apis/messaging/markAsRead.js')],
  ['external-messaging',() => import('./external-apis/messaging/markAsReadAll.js')],
  ['external-messaging',() => import('./external-apis/messaging/markAsSeen.js')],
  ['external-messaging',() => import('./external-apis/messaging/muteThread.js')],
  ['external-messaging',() => import('./external-apis/messaging/notes.js')],
  ['external-messaging',() => import('./external-apis/messaging/oldMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/pinMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/removeUserFromGroup.js')],
  ['external-messaging',() => import('./external-apis/messaging/resolvePhotoUrl.js')],
  ['external-messaging',() => import('./external-apis/messaging/scheduler.js')],
  ['external-messaging',() => import('./external-apis/messaging/searchForThread.js')],
  ['external-messaging',() => import('./external-apis/messaging/searchStickers.js')],
  ['external-messaging',() => import('./external-apis/messaging/sendBroadcast.js')],
  ['external-messaging',() => import('./external-apis/messaging/sendButtons.js')],
  ['external-messaging',() => import('./external-apis/messaging/sendMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/sendMessageWithRetry.js')],
  ['external-messaging',() => import('./external-apis/messaging/sendTypingIndicator.js')],
  ['external-messaging',() => import('./external-apis/messaging/setMessageReaction.js')],
  ['external-messaging',() => import('./external-apis/messaging/setThreadTheme.js')],
  ['external-messaging',() => import('./external-apis/messaging/setTitle.js')],
  ['external-messaging',() => import('./external-apis/messaging/shareContact.js')],
  ['external-messaging',() => import('./external-apis/messaging/stickers.js')],
  ['external-messaging',() => import('./external-apis/messaging/threadColors.js')],
  ['external-messaging',() => import('./external-apis/messaging/unsendMessage.js')],
  ['external-messaging',() => import('./external-apis/messaging/uploadAttachment.js')],
  ['external-safety',  () => import('./external-apis/safety/FacebookSafetyManager.js')],
  ['external-threads', () => import('./external-apis/threads/getThreadHistory.js')],
  ['external-threads', () => import('./external-apis/threads/getThreadInfo.js')],
  ['external-threads', () => import('./external-apis/threads/getThreadList.js')],
  ['external-threads', () => import('./external-apis/threads/getThreadPictures.js')],
  ['external-users',   () => import('./external-apis/users/getAvatarUser.js')],
  ['external-users',   () => import('./external-apis/users/getRegion.js')],
  ['external-users',   () => import('./external-apis/users/getUID.js')],
  ['external-users',   () => import('./external-apis/users/getUserID.js')],
  ['external-users',   () => import('./external-apis/users/getUserInfo.js')],
  ['external-users',   () => import('./external-apis/users/getUserInfoV2.js')],
  ['external-users',   () => import('./external-apis/users/suggestFriend.js')],
  ['external-utils',   () => import('./external-apis/utils/antiDetection.js')],
  ['external-utils',   () => import('./external-apis/utils/deferred.js')],
  ['external-utils',   () => import('./external-apis/utils/mostakimCompat.js')],
  ['external-utils',   () => import('./external-apis/utils/userAgents.js')],
  ['external-utils',   () => import('./external-apis/utils/ws3Compat.js')],
  // func
  ['func', () => import('./func/logAdapter.js')],
  ['func', () => import('./func/logger.js')],
  // nexus
  ['nexus', () => import('./nexus/api/changeBlockedStatusMqtt.js')],
  ['nexus', () => import('./nexus/api/changeCover.js')],
  ['nexus', () => import('./nexus/api/changeName.js')],
  ['nexus', () => import('./nexus/api/changeUsername.js')],
  ['nexus', () => import('./nexus/api/createCommentPost.js')],
  ['nexus', () => import('./nexus/api/follow.js')],
  ['nexus', () => import('./nexus/api/getAccess.js')],
  ['nexus', () => import('./nexus/api/getBotInitialData.js')],
  ['nexus', () => import('./nexus/api/getCtx.js')],
  ['nexus', () => import('./nexus/api/getUID.js')],
  ['nexus', () => import('./nexus/api/listenNotification.js')],
  ['nexus', () => import('./nexus/api/listenRealtime.js')],
  ['nexus', () => import('./nexus/api/listenSpeed.js')],
  ['nexus', () => import('./nexus/api/sendComment.js')],
  ['nexus', () => import('./nexus/api/setStoryReaction.js')],
  ['nexus', () => import('./nexus/api/threadColors.js')],
  ['nexus', () => import('./nexus/index.js')],
  ['nexus', () => import('./nexus/utils.js')],
  // observability
  ['observability', () => import('./observability/channels.js')],
  ['observability', () => import('./observability/perf.js')],
  // performance
  ['performance', () => import('./performance/health-metrics.js')],
  ['performance', () => import('./performance/health-server.js')],
  ['performance', () => import('./performance/manager.js')],
  // remote
  ['remote', () => import('./remote/remoteClient.js')],
  // safety
  ['safety', () => import('./safety/FacebookSafety.js')],
  ['safety', () => import('./safety/SafeTimerRegistry.js')],
  ['safety', () => import('./safety/SessionLock.js')],
  ['safety', () => import('./safety/SingleSessionGuard.js')],
  ['safety', () => import('./safety/StealthMode.js')],
  ['safety', () => import('./safety/anti-suspension.js')],
  ['safety', () => import('./safety/backup-crypto.js')],
  ['safety', () => import('./safety/circuit-breaker.js')],
  ['safety', () => import('./safety/cookie-refresher.js')],
  ['safety', () => import('./safety/device-manager.js')],
  ['safety', () => import('./safety/dismiss-scraping-warning.js')],
  ['safety', () => import('./safety/fingerprint-generator.js')],
  ['safety', () => import('./safety/nexus-index.js')],
  ['safety', () => import('./safety/per-recipient-limiter.js')],
  ['safety', () => import('./safety/rate-limiter-per-thread.js')],
  ['safety', () => import('./safety/session-guard.js')],
  ['safety', () => import('./safety/session-rotation.js')],
  ['safety', () => import('./safety/stealth-profiles.js')],
  ['safety', () => import('./safety/token-bucket.js')],
  ['safety', () => import('./safety/watchdog.js')],
  // session
  ['session', () => import('./session/capability-resolver.js')],
  ['session', () => import('./session/context-store.js')],
  ['session', () => import('./session/session.js')],
  // transport
  ['transport', () => import('./transport/http/facebook.js')],
  ['transport', () => import('./transport/http/form-data.js')],
  ['transport', () => import('./transport/http/graphql.js')],
  ['transport', () => import('./transport/http/mercury.js')],
  ['transport', () => import('./transport/http/shared-photos.js')],
  ['transport', () => import('./transport/http/threads.js')],
  ['transport', () => import('./transport/http/upload-attachment.js')],
  ['transport', () => import('./transport/realtime/connect-mqtt.js')],
  ['transport', () => import('./transport/realtime/get-seq-id.js')],
  ['transport', () => import('./transport/realtime/ls-requests.js')],
  ['transport', () => import('./transport/realtime/publish.js')],
  ['transport', () => import('./transport/realtime/stream.js')],
  ['transport', () => import('./transport/realtime/task-response.js')],
  ['transport', () => import('./transport/realtime/topics.js')],
  ['transport', () => import('./transport/tls-fingerprint.js')],
  // types
  ['types', () => import('./types/client.js')],
  ['types', () => import('./types/core-modules.js')],
  ['types', () => import('./types/core.js')],
  ['types', () => import('./types/events.js')],
  ['types', () => import('./types/index.js')],
  ['types', () => import('./types/messaging.js')],
  ['types', () => import('./types/scheduler.js')],
  ['types', () => import('./types/threads.js')],
  // utils
  ['utils', () => import('./utils/broadcast.js')],
  ['utils', () => import('./utils/client.js')],
  ['utils', () => import('./utils/compat-utils.js')],
  ['utils', () => import('./utils/constants.js')],
  ['utils', () => import('./utils/cookies.js')],
  ['utils', () => import('./utils/disposable.js')],
  ['utils', () => import('./utils/enhancements.js')],
  ['utils', () => import('./utils/event-bus.js')],
  ['utils', () => import('./utils/event-replay-buffer.js')],
  ['utils', () => import('./utils/extract-dtsg.js')],
  ['utils', () => import('./utils/format/attachment.js')],
  ['utils', () => import('./utils/format/cookie.js')],
  ['utils', () => import('./utils/format/date.js')],
  ['utils', () => import('./utils/format/decode.js')],
  ['utils', () => import('./utils/format/delta.js')],
  ['utils', () => import('./utils/format/ids.js')],
  ['utils', () => import('./utils/format/index.js')],
  ['utils', () => import('./utils/format/message.js')],
  ['utils', () => import('./utils/format/presence.js')],
  ['utils', () => import('./utils/format/readTyp.js')],
  ['utils', () => import('./utils/format/thread.js')],
  ['utils', () => import('./utils/format/utils.js')],
  ['utils', () => import('./utils/graceful-shutdown.js')],
  ['utils', () => import('./utils/headers.js')],
  ['utils', () => import('./utils/human-timing.js')],
  ['utils', () => import('./utils/inflight-cache.js')],
  ['utils', () => import('./utils/loginParser/autoLogin.js')],
  ['utils', () => import('./utils/loginParser/helpers.js')],
  ['utils', () => import('./utils/loginParser/index.js')],
  ['utils', () => import('./utils/loginParser/parseAndCheckLogin.js')],
  ['utils', () => import('./utils/loginParser/textUtils.js')],
  ['utils', () => import('./utils/lru-cache.js')],
  ['utils', () => import('./utils/message-dedup.js')],
  ['utils', () => import('./utils/nexca-logger.js')],
  ['utils', () => import('./utils/request/client.js')],
  ['utils', () => import('./utils/request/config.js')],
  ['utils', () => import('./utils/request/decompress.js')],
  ['utils', () => import('./utils/request/defaults.js')],
  ['utils', () => import('./utils/request/helpers.js')],
  ['utils', () => import('./utils/request/index.js')],
  ['utils', () => import('./utils/request/methods.js')],
  ['utils', () => import('./utils/request/proxy.js')],
  ['utils', () => import('./utils/request/retry.js')],
  ['utils', () => import('./utils/request/sanitize.js')],
  ['utils', () => import('./utils/runtime.js')],
  ['utils', () => import('./utils/send-queue.js')],
  ['utils', () => import('./utils/socks-mqtt.js')],
  ['utils', () => import('./utils/structured-logger.js')],
  ['utils', () => import('./utils/thread-cache.js')],
  ['utils', () => import('./utils/thread-filter.js')],
  ['utils', () => import('./utils/totp-login-bridge.js')],
  ['utils', () => import('./utils/totp.js')],
  ['utils', () => import('./utils/webhook-parser.js')],
  // workers
  ['workers', () => import('./workers/delta-parser.worker.js')],
  ['workers', () => import('./workers/delta-pool.js')],
];

// ── Helper: تحميل مجموعة من الـ loaders بشكل متوازٍ ──────────────────────

async function loadPlugins(loaders) {
  const results = await Promise.allSettled(loaders.map((fn) => fn()));
  const plugins = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value?.$plugin) {
      plugins.push(r.value.$plugin);
    }
  }
  return plugins;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * يُسجّل البلاجينات في PluginSystem مع تصفية اختيارية.
 * يُحمَّل كل ملف مرة واحدة فقط عند الطلب.
 *
 * @param {{ register(p: FcaPlugin): Promise<any>, has(name: string): boolean }} pluginSystem
 * @param {{ categories?: string[], names?: string[], exclude?: string[] }} [options]
 */
export async function registerAll(pluginSystem, options = {}) {
  const { categories, names, exclude = [] } = options;

  // فلترة الـ loaders حسب الفئة
  let entries = LAZY_REGISTRY;
  if (Array.isArray(categories) && categories.length > 0) {
    entries = entries.filter(([cat]) => categories.includes(cat));
  }

  const plugins = await loadPlugins(entries.map(([, loader]) => loader));

  // فلترة إضافية بعد التحميل
  let list = plugins;
  if (Array.isArray(names) && names.length > 0) list = list.filter((p) => names.includes(p.name));
  if (exclude.length > 0)                        list = list.filter((p) => !exclude.includes(p.name));

  for (const plugin of list) {
    if (!pluginSystem.has(plugin.name)) await pluginSystem.register(plugin);
  }
}

/** يُسجّل فئة واحدة */
export async function registerByCategory(pluginSystem, category) {
  return registerAll(pluginSystem, { categories: [category] });
}

/** قائمة الفئات المتاحة */
export function listCategories() {
  return [...new Set(LAZY_REGISTRY.map(([cat]) => cat))].sort();
}

export default { registerAll, registerByCategory, listCategories };
