import {
  login,
  loginAsync,
  loginLegacy,
  loginViaAPI,
  tokensViaAPI,
  normalizeCookieHeaderString,
  setJarFromPairs,
} from './core/auth.js';

import {
  createDefaultContext,
  createFcaState,
  createApiFacade,
} from './core/state.js';

import { createRequestHelper } from './core/request.js';
import { listenMqtt }          from './core/mqtt.js';
import { createAuthCore }      from './core/auth-helpers.js';

import {
  defaultConfig,
  loadConfig,
  resolveConfig,
  writeConfigTemplate,
} from './core/config.js';

import { attachThreadInfoRealtimeSync }                      from './core/thread-info-realtime-sync.js';

import { createFcaClient }                                         from './app/create-client.js';
import { MessengerBot, createMessengerBot }                        from './app/messenger-bot.js';
import { MessengerContext }                                        from './app/messenger-context.js';
import {
  MessengerClient,
  createMessengerClient,
  loginWithFullSafety,
} from './app/messenger-client.js';
import { PluginSystem, createPluginSystem } from './app/plugin-system.js';

import { attachClientFacade } from './compat/api-registry.js';

import { createMessagesDomain }  from './domains/messages/index.js';
import { createThreadsDomain }   from './domains/threads/index.js';
import { createRealtimeDomain }  from './domains/realtime/index.js';
import { createUsersDomain }     from './domains/users/index.js';
import { createAccountDomain }   from './domains/account/index.js';
import { createHttpDomain }      from './domains/http/index.js';
import { createSchedulerDomain } from './domains/scheduler/index.js';
import { createMediaDomain }     from './domains/media/index.js';

import { CookieRefresher, createCookieRefresher }     from './safety/cookie-refresher.js';
import { DeviceManager, createDeviceManager }         from './safety/device-manager.js';
import { SessionGuard, createSessionGuard }           from './safety/session-guard.js';
import FacebookSafety                                 from './safety/FacebookSafety.js';
import { StealthMode }                               from './safety/StealthMode.js';
import SingleSessionGuard                            from './safety/SingleSessionGuard.js';
import { SessionLock }                               from './safety/SessionLock.js';
import { AntiSuspension }                            from './safety/anti-suspension.js';
import { CircuitBreaker }                            from './safety/circuit-breaker.js';
import { TokenBucket }                              from './safety/token-bucket.js';
import { Watchdog, createWatchdog }                  from './safety/watchdog.js';
import { FingerprintGenerator, createFingerprintGenerator } from './safety/fingerprint-generator.js';
import { SessionRotationManager, createSessionRotationManager } from './safety/session-rotation.js';
import { dismissScrapingWarning }                    from './safety/dismiss-scraping-warning.js';
import { PerRecipientLimiter, createPerRecipientLimiter } from './safety/per-recipient-limiter.js';
import { PerThreadRateLimiter }                      from './safety/rate-limiter-per-thread.js';

import {
  PerformanceManager,
  createPerformanceManager,
  getGlobalPerformanceManager,
} from './performance/manager.js';
import { HealthMetrics, createHealthMetrics } from './performance/health-metrics.js';
import { HealthServer,  createHealthServer  } from './performance/health-server.js';

import { Command, CommandRegistry, createCommandRegistry } from './command/registry.js';

import { attachNexusMethods, threadColors } from './nexus/index.js';

import { EXTERNAL_API_FACTORIES, default as EXTERNAL_API_FACTORIES_DEFAULT } from './external-apis/index.js';
import { CommandRegistry as CommandSystem }   from './external-apis/command/CommandSystem.js';
import { FCAError, ErrorHandler, errorHandler as defaultErrorHandler } from './external-apis/error/ErrorHandler.js';
import { DatabaseManager, getInstance as getDatabaseInstance }           from './external-apis/database/DatabaseManager.js';
import FacebookSafetyManager                 from './external-apis/safety/FacebookSafetyManager.js';
import BotManager                            from './external-apis/app/botManager.js';
import {
  randomDelay,
  calculateTypingTime,
  calculateReadingTime,
  RateLimiter,
  getRandomUserAgent,
  BehaviorTracker,
  ActivityScheduler,
} from './external-apis/utils/antiDetection.js';
import { defaultUserAgent, randomUserAgent } from './external-apis/utils/userAgents.js';
import * as ws3Compat     from './external-apis/utils/ws3Compat.js';
import * as mostakimCompat from './external-apis/utils/mostakimCompat.js';

import { LRUCache, createFcaCaches }               from './utils/lru-cache.js';
import { ThreadSendQueue }                         from './utils/send-queue.js';
import { MessageDedup, attachDedup }               from './utils/message-dedup.js';
import { EventReplayBuffer, attachReplayBuffer }   from './utils/event-replay-buffer.js';
import { attachThreadFilter }                      from './utils/thread-filter.js';
import { applyEnhancements }                       from './utils/enhancements.js';
import { broadcast }                               from './utils/broadcast.js';
import { EventBus, createEventBus, globalBus }     from './utils/event-bus.js';
import { ThreadCache, createThreadCache }          from './utils/thread-cache.js';
import { generateTOTP, verifyTOTP, totpRemainingSeconds, waitForFreshTOTP } from './utils/totp.js';
import { decompressResponse }                      from './utils/request/decompress.js';
import {
  buildSocksMqttAgent,
  patchCtxForSocks,
  attachSocksMqtt,
  rotateSocksProxy,
} from './utils/socks-mqtt.js';

import {
  getChromeTlsOptions,
  applyChromeTlsFingerprint,
  CHROME_CIPHERS,
} from './transport/tls-fingerprint.js';
import { publishLsRequestWithAck } from './transport/realtime/ls-requests.js';

import {
  listenAsync,
  filterEvents,
  takeEvents,
} from './domains/realtime/async-listen.js';

import { DeltaParserPool, createDeltaParserPool } from './workers/delta-pool.js';

import {
  channels as diagChannels,
  emitMqttPublish,
  emitMqttReceive,
  emitError as emitDiagError,
  emitHttpRequest,
  emitHttpResponse,
  emitRateLimit,
  emitCircuitChange,
} from './observability/channels.js';
import {
  startPerfObserver,
  stopPerfObserver,
  measureMqttPublish,
  measure as perfMeasure,
} from './observability/perf.js';

import {
  ctxStore,
  getCtx,
  runWithCtx,
  bindCtx,
  requireCtx,
} from './session/context-store.js';

import {
  disposableTimer,
  disposableMqttListener,
  disposableAbortController,
} from './utils/disposable.js';

import sendBroadcast        from './external-apis/messaging/sendBroadcast.js';
import forwardMessage       from './external-apis/messaging/forwardMessage.js';
import sendMessageWithRetry from './external-apis/messaging/sendMessageWithRetry.js';
import oldMessage           from './external-apis/messaging/oldMessage.js';

import advancedSessionGuard from './external-apis/action/advancedSessionGuard.js';
import acpUser              from './external-apis/action/acpUser.js';
import suggestFriend        from './external-apis/users/suggestFriend.js';

import { parseAndCheckLogin as ws3ParseAndCheckLogin,    generateOfflineThreadingID as ws3GenerateOfflineThreadingID, getGUID as ws3GetGUID, log as ws3Log, warn as ws3Warn, error as ws3Error } from './external-apis/utils/ws3Compat.js';
import { parseAndCheckLogin as mostakimParseAndCheckLogin, generateOfflineThreadingID as mostakimGenerateOfflineThreadingID, getGUID as mostakimGetGUID, getType as mostakimGetType, isReadableStream as mostakimIsReadableStream, getFrom as mostakimGetFrom, getSignatureID as mostakimGetSignatureID } from './external-apis/utils/mostakimCompat.js';
import { extractDtsg, extractAndPatchCtx } from './utils/extract-dtsg.js';

const fca = {
  
  login, loginAsync, loginLegacy, loginViaAPI, tokensViaAPI,
  normalizeCookieHeaderString, setJarFromPairs,
  createDefaultContext, createFcaState, createApiFacade,
  createRequestHelper, listenMqtt, createAuthCore,
  defaultConfig, loadConfig, resolveConfig, writeConfigTemplate,
  attachThreadInfoRealtimeSync,

  
  createFcaClient, MessengerBot, createMessengerBot,
  MessengerContext, MessengerClient, createMessengerClient,
  loginWithFullSafety,
  PluginSystem, createPluginSystem,

  
  attachClientFacade,

  
  createMessagesDomain, createThreadsDomain, createRealtimeDomain,
  createUsersDomain, createAccountDomain, createHttpDomain,
  createSchedulerDomain, createMediaDomain,

  
  CookieRefresher, createCookieRefresher,
  DeviceManager, createDeviceManager,
  SessionGuard, createSessionGuard,
  FacebookSafety, StealthMode, SingleSessionGuard, SessionLock,
  AntiSuspension, CircuitBreaker, TokenBucket,
  Watchdog, createWatchdog,
  FingerprintGenerator, createFingerprintGenerator,
  SessionRotationManager, createSessionRotationManager,
  dismissScrapingWarning,
  PerRecipientLimiter, createPerRecipientLimiter,
  PerThreadRateLimiter,

  
  PerformanceManager, createPerformanceManager, getGlobalPerformanceManager,
  HealthMetrics, createHealthMetrics, HealthServer, createHealthServer,

  
  Command, CommandRegistry, createCommandRegistry,

  
  attachNexusMethods, threadColors,

  
  default: login,
};

export default fca;

export * from './types/index.js';

export {
  login, loginAsync, loginLegacy, loginViaAPI, tokensViaAPI,
  normalizeCookieHeaderString, setJarFromPairs,
  createDefaultContext, createFcaState, createApiFacade,
  createRequestHelper, listenMqtt, createAuthCore,
  defaultConfig, loadConfig, resolveConfig, writeConfigTemplate,
  attachThreadInfoRealtimeSync,
};

export {
  createFcaClient,
  MessengerBot, createMessengerBot,
  MessengerContext,
  MessengerClient, createMessengerClient,
  loginWithFullSafety,
  PluginSystem, createPluginSystem,
};

export { attachClientFacade };

export {
  createMessagesDomain, createThreadsDomain, createRealtimeDomain,
  createUsersDomain, createAccountDomain, createHttpDomain,
  createSchedulerDomain, createMediaDomain,
};

export {
  CookieRefresher, createCookieRefresher,
  DeviceManager, createDeviceManager,
  SessionGuard, createSessionGuard,
  FacebookSafety, StealthMode, SingleSessionGuard, SessionLock,
  AntiSuspension, CircuitBreaker, TokenBucket,
  Watchdog, createWatchdog,
  FingerprintGenerator, createFingerprintGenerator,
  SessionRotationManager, createSessionRotationManager,
  dismissScrapingWarning,
  PerRecipientLimiter, createPerRecipientLimiter,
  PerThreadRateLimiter,
};

export {
  PerformanceManager, createPerformanceManager, getGlobalPerformanceManager,
  HealthMetrics, createHealthMetrics,
  HealthServer, createHealthServer,
};

export { Command, CommandRegistry, createCommandRegistry };

export { attachNexusMethods, threadColors };

export {
  EXTERNAL_API_FACTORIES, EXTERNAL_API_FACTORIES_DEFAULT,
  CommandSystem,
  FCAError, ErrorHandler, defaultErrorHandler,
  DatabaseManager, getDatabaseInstance,
  FacebookSafetyManager, BotManager,
  randomDelay, calculateTypingTime, calculateReadingTime,
  RateLimiter, getRandomUserAgent, BehaviorTracker, ActivityScheduler,
  defaultUserAgent, randomUserAgent,
  ws3Compat, mostakimCompat,
  ws3ParseAndCheckLogin, ws3GenerateOfflineThreadingID, ws3GetGUID,
  ws3Log, ws3Warn, ws3Error,
  mostakimParseAndCheckLogin, mostakimGenerateOfflineThreadingID,
  mostakimGetGUID, mostakimGetType, mostakimIsReadableStream,
  mostakimGetFrom, mostakimGetSignatureID,
};

export {
  LRUCache, createFcaCaches,
  ThreadSendQueue,
  MessageDedup, attachDedup,
  EventReplayBuffer, attachReplayBuffer,
  attachThreadFilter,
  applyEnhancements,
  broadcast,
  EventBus, createEventBus, globalBus,
  ThreadCache, createThreadCache,
  generateTOTP, verifyTOTP, totpRemainingSeconds, waitForFreshTOTP,
  decompressResponse,
  buildSocksMqttAgent, patchCtxForSocks, attachSocksMqtt, rotateSocksProxy,
  extractDtsg, extractAndPatchCtx,
  disposableTimer, disposableMqttListener, disposableAbortController,
};

export {
  getChromeTlsOptions, applyChromeTlsFingerprint, CHROME_CIPHERS,
  publishLsRequestWithAck,
};

export {
  listenAsync, filterEvents, takeEvents,
  listenAsync as listenMqttAsync,
  filterEvents as filterMqttEvents,
};

export { DeltaParserPool, createDeltaParserPool };

export {
  diagChannels, emitMqttPublish, emitMqttReceive, emitDiagError,
  emitHttpRequest, emitHttpResponse, emitRateLimit, emitCircuitChange,
  startPerfObserver, stopPerfObserver, measureMqttPublish, perfMeasure,
};

export { ctxStore, getCtx, runWithCtx, bindCtx, requireCtx };

export { sendBroadcast, forwardMessage, sendMessageWithRetry, oldMessage };

export { advancedSessionGuard, acpUser, suggestFriend };

export {
  FcaError, FcaNetworkError, FcaHttpError,
  FcaMqttError, FcaMqttTimeoutError, FcaMqttNotInitializedError,
  FcaAuthError, FcaNotLoggedInError, FcaRateLimitError, FcaCircuitOpenError,
} from './errors.js';
