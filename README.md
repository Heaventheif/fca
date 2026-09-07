# fca-main — Production Build

> نسخة إنتاجية من مكتبة **fca-unofficial** مُهيّأة للنشر المباشر.  
> ESM-only · Node ≥ 20.10 · Bun ≥ 1.0 · MQTT-based · Plugin architecture

---

## محتويات

- [متطلبات التشغيل](#متطلبات-التشغيل)
- [التثبيت](#التثبيت)
- [الاستخدام الأساسي](#الاستخدام-الأساسي)
- [الإعداد — fca-config.json](#الإعداد--fca-configjson)
- [نظام البلاجين](#نظام-البلاجين)
- [طبقات الأمان والحماية من الحظر](#طبقات-الأمان-والحماية-من-الحظر)
- [قاعدة البيانات](#قاعدة-البيانات)
- [صحة النظام — Health Server](#صحة-النظام--health-server)
- [Remote Control](#remote-control)
- [Domains API — قائمة الأوامر الكاملة](#domains-api--قائمة-الأوامر-الكاملة)
- [هيكل المشروع](#هيكل-المشروع)
- [التغييرات عن النسخة الأصلية](#التغييرات-عن-النسخة-الأصلية)

---

## متطلبات التشغيل

| البيئة | الإصدار المطلوب |
|--------|----------------|
| Node.js | ≥ 20.10.0 |
| Bun | ≥ 1.0.0 |

**التبعيات المُضمَّنة:**

```
mqtt ^4.3.8        — اتصال MQTT مع Messenger
tough-cookie ^6.0.1 — إدارة الكوكيز
ws ^8.21.0          — WebSocket
postgres ^3.4.7     — قاعدة بيانات PostgreSQL (اختياري)
https-proxy-agent   — دعم الـ proxy
socks-proxy-agent   — دعم SOCKS5
form-data           — رفع المرفقات
```

---

## التثبيت

```bash
# من الـ zip مباشرة
unzip fca-main-production.zip
cd fca-main-production
npm install

# أو إذا كنت تستخدم Bun
bun install
```

---

## الاستخدام الأساسي

### 1. تسجيل الدخول بـ appState (الطريقة الموصى بها)

```js
import fca, { loginAsync } from './lib/index.js';

const appState = JSON.parse(fs.readFileSync('appstate.json', 'utf8'));

const ctx = await loginAsync({ appState });
const api = ctx.api;

api.listenMqtt((err, event) => {
  if (err) return console.error(err);
  if (event.type === 'message') {
    api.sendMessage({ body: `مرحباً! استلمت: ${event.body}` }, event.threadID);
  }
});
```

### 2. استخدام MessengerClient (الواجهة العالية المستوى)

```js
import { loginAsync, MessengerClient } from './lib/index.js';

const ctx    = await loginAsync({ appState });
const client = new MessengerClient(ctx.api, {
  commandPrefix:      '/',
  ownerIDs:           ['100xxxxxx'],
  healthServerPort:   10000,        // Health endpoint على هذا المنفذ
  appStatePath:       './appstate.json',
});

// تسجيل أمر
client.addCommand('ping', async (ctx) => {
  await ctx.reply('pong 🏓');
});

// الاستماع لرسائل عادية
client.on('message', (event) => {
  console.log(`[${event.threadID}] ${event.senderID}: ${event.body}`);
});

await client.start();
```

### 3. تسجيل الدخول بالإيميل وكلمة المرور

```js
import { login } from './lib/index.js';

login({ email: 'user@example.com', password: 'pass' }, (err, api) => {
  if (err) return console.error(err);
  // ...
});
```

---

## الإعداد — fca-config.json

أنشئ `fca-config.json` في جذر المشروع. المكتبة تقرأه تلقائياً عند التشغيل.

```json
{
  "mqtt": {
    "enabled": true,
    "reconnectInterval": 3600
  },
  "loginTimeoutMs": 20000,
  "processErrorHandlers": true,
  "autoLogin": false,
  "antiDetection": {
    "enabled": true,
    "requestDelayMin": 800,
    "requestDelayMax": 2500,
    "userAgentPool": []
  },
  "antiGetInfo": {
    "AntiGetThreadInfo": false,
    "AntiGetUserInfo": false
  },
  "remoteControl": {
    "enabled": true,
    "url": "ws://your-remote-server:PORT",
    "token": "your-secret-token",
    "autoReconnect": true
  }
}
```

| المفتاح | الافتراضي | الوصف |
|---------|-----------|-------|
| `mqtt.enabled` | `true` | تفعيل اتصال MQTT الفوري |
| `mqtt.reconnectInterval` | `3600` | إعادة الاتصال كل ن ثانية |
| `loginTimeoutMs` | `20000` | مهلة تسجيل الدخول بالميلليثانية |
| `processErrorHandlers` | `false` | التقاط `unhandledRejection` و`uncaughtException` |
| `autoLogin` | `false` | إعادة تسجيل الدخول التلقائية عند انتهاء الجلسة |
| `antiDetection.enabled` | `false` | تأخيرات عشوائية بين الطلبات |
| `remoteControl.enabled` | **`true`** | تفعيل Remote Control عبر WebSocket |
| `remoteControl.url` | `""` | عنوان خادم التحكم عن بُعد |
| `remoteControl.token` | `""` | رمز المصادقة |

> **ملاحظة:** في هذا البناء `remoteControl.enabled` = `true` بالإعداد الافتراضي. إذا لم تستخدم Remote Control، أضف `"url": ""` وسيتجاهله النظام تلقائياً.

---

## نظام البلاجين

كل ملف في `lib/` يُصدّر `$plugin` descriptor ويمكن تسجيله في `PluginSystem`.

### تسجيل جميع البلاجينات

```js
import { registerAll, listCategories } from './lib/plugin-provider.js';
import { createPluginSystem }          from './lib/app/plugin-system.js';

const ps = createPluginSystem(client);

// تسجيل الكل
await registerAll(ps);

// أو تسجيل فئة محددة فقط
await registerAll(ps, { categories: ['safety', 'database'] });

// أو باستثناء بلاجين معين
await registerAll(ps, { exclude: ['fca-workers-delta-pool'] });

// عرض الفئات المتاحة
console.log(listCategories());
// ['app', 'compat', 'core', 'database', 'domain-account', 'domain-messages', ...]
```

### فئات البلاجينات (342 بلاجن)

| الفئة | الوصف |
|-------|-------|
| `app` | MessengerClient, MessengerBot, PluginSystem, create-client |
| `core` | auth, mqtt, config, state, request, auth-helpers |
| `safety` | FacebookSafety, StealthMode, circuit-breaker, watchdog, ... |
| `database` | jsonStore, mongoStore, postgresStore |
| `domain-messages` | send, delete, edit, react, pin, forward, upload, ... |
| `domain-threads` | createGroup, addUsers, setTitle, changeColor, ... |
| `domain-users` | getUserInfo, getFriendsList, getUserID |
| `domain-account` | changeAvatar, changeBio, logout, follow, ... |
| `compat` | legacy-promise, callbackify, api-registry |
| `performance` | HealthServer, HealthMetrics, PerformanceManager |
| `observability` | channels, perf-observer |

---

## طبقات الأمان والحماية من الحظر

### FacebookSafety (الطبقة الرئيسية)

```js
import FacebookSafety from './lib/safety/FacebookSafety.js';

const safety = new FacebookSafety({
  enableSafeHeaders:      true,  // هيدرات آمنة تحاكي المتصفح
  enableHumanBehavior:    true,  // تأخيرات عشوائية بنمط بشري
  enableAntiDetection:    true,  // تجنّب كشف البوت
  enableAutoRefresh:      true,  // تجديد الجلسة تلقائياً
  ultraLowBanMode:        true,  // وضع الحماية القصوى
  enableUAContinuity:     true,  // User-Agent ثابت للجلسة
  bypassRegionLock:       true,  // تجاوز القيود الجغرافية
});
```

### StealthMode

```js
import { StealthMode } from './lib/safety/StealthMode.js';

const stealth = new StealthMode({
  maxRequestsPerMinute: 15,      // حد الطلبات في الدقيقة
  dailyRequestLimit:    1200,    // حد الطلبات اليومية
  statePath: './stealth-state.json', // حفظ الحالة بين التشغيلات
});
```

### Circuit Breaker

```js
import { CircuitBreaker } from './lib/safety/circuit-breaker.js';

const breaker = new CircuitBreaker({
  failureThreshold: 5,   // عدد الأخطاء قبل الفتح
  resetTimeoutMs:   30000,
});
```

### ملخص وحدات الأمان

| الوحدة | الوظيفة |
|--------|---------|
| `FacebookSafety` | تنسيق شامل لجميع طبقات الأمان |
| `StealthMode` | تحديد المعدل + محاكاة الإيقاع البشري |
| `FingerprintGenerator` | توليد بصمة متصفح ثابتة وواقعية |
| `CircuitBreaker` | قطع الاتصال عند تراكم الأخطاء |
| `SessionGuard` | منع التداخل بين الجلسات |
| `SingleSessionGuard` | تأمين جلسة واحدة في الوقت الواحد |
| `SessionLock` | قفل الجلسة بين العمليات |
| `CookieRefresher` | تجديد الكوكيز تلقائياً |
| `AntiSuspension` | منع تعليق الحساب بأنماط واقعية |
| `Watchdog` | مراقبة الاتصال وإعادة التشغيل |
| `SessionRotationManager` | تدوير الجلسات بشكل دوري |
| `PerRecipientLimiter` | تحديد المعدل لكل مستقبل |
| `PerThreadRateLimiter` | تحديد المعدل لكل محادثة |
| `TokenBucket` | خوارزمية Token Bucket للتحكم في المعدل |
| `backup-crypto` | تشفير نسخ الجلسة الاحتياطية |
| `dismiss-scraping-warning` | تجاوز تحذيرات الـ scraping تلقائياً |

---

## قاعدة البيانات

المكتبة تدعم ثلاثة backends، يُختار الواحد في الإعداد:

### JSON (افتراضي — للتطوير)

```js
import { jsonStore } from './lib/database/jsonStore.js';
// يُخزّن في ملفات .json محلياً
```

### MongoDB

```js
import { mongoStore } from './lib/database/mongoStore.js';
// الاتصال عبر MONGODB_URI في متغيرات البيئة
```

### PostgreSQL

```js
import { postgresStore } from './lib/database/postgresStore.js';
// الاتصال عبر DATABASE_URL في متغيرات البيئة
```

---

## صحة النظام — Health Server

في هذا البناء، **Health Server يعمل دائماً** تلقائياً عند إنشاء `MessengerClient`.

```
GET http://localhost:10000/health
```

```json
{
  "status": "ok",
  "uptime": 3600,
  "mqttConnected": true,
  "messagesProcessed": 1024,
  "errors": 0
}
```

تغيير المنفذ:

```js
const client = new MessengerClient(api, {
  healthServerPort: 8080,
  // أو عبر متغير البيئة: HEALTH_PORT=8080
});
```

---

## Remote Control

يتيح التحكم في البوت عن بُعد عبر WebSocket. **مُفعَّل بالإعداد الافتراضي** في هذا البناء.

```json
"remoteControl": {
  "enabled": true,
  "url": "ws://control-server:9000",
  "token": "super-secret",
  "autoReconnect": true
}
```

عند تشغيل البوت ستظهر رسالة:
```
[fca-main] WARNING: remoteClient is ACTIVE — session data will be sent to ws://...
```

لتعطيله: اضبط `"enabled": false` في `fca-config.json`.

---

## Domains API — قائمة الأوامر الكاملة

### الرسائل (`domains/messages`)

| الأمر | الوصف |
|-------|-------|
| `sendMessage(msg, threadID)` | إرسال رسالة (نص، مرفق، sticker، reply) |
| `editMessage(body, messageID)` | تعديل رسالة مُرسَلة |
| `deleteMessage(messageIDs)` | حذف رسائل |
| `unsendMessage(messageID)` | سحب رسالة |
| `forwardAttachment(attachmentID, userIDs)` | إعادة توجيه مرفق |
| `uploadAttachment(attachments)` | رفع مرفق والحصول على معرّفه |
| `setMessageReaction(reaction, messageID)` | إضافة/إزالة reaction |
| `pinMessage(messageID, threadID)` | تثبيت رسالة |
| `searchMessage(query, threadID)` | البحث في الرسائل |
| `shareLink(url, threadID)` | مشاركة رابط |
| `shareContact(userID, threadID)` | مشاركة جهة اتصال |
| `markAsRead(threadID)` | تحديد كمقروء |
| `markAsReadAll()` | تحديد الكل كمقروء |
| `markAsSeen(threadID)` | تحديد كمشاهَد |
| `markAsDelivered(threadID, messageID)` | تأكيد الاستلام |
| `sendTypingIndicator(threadID)` | إظهار مؤشر الكتابة |
| `getMessage(messageID)` | جلب رسالة بالمعرّف |
| `resolvePhotoUrl(facebookUrl)` | استخراج URL حقيقي للصور |
| `getEmojiUrl(emoji, size)` | رابط صورة Emoji |
| `getThreadColors()` | ألوان المحادثة المتاحة |

### المحادثات (`domains/threads`)

| الأمر | الوصف |
|-------|-------|
| `getThreadInfo(threadID)` | معلومات المحادثة |
| `getThreadList(limit, cursor, tags)` | قائمة المحادثات |
| `getThreadHistory(threadID, amount)` | سجل الرسائل |
| `getThreadPictures(threadID, offset, limit)` | صور المحادثة |
| `createNewGroup(message, participantIDs)` | إنشاء مجموعة |
| `addUsersToGroup(userIDs, threadID)` | إضافة أعضاء |
| `removeUserFromGroup(userID, threadID)` | إزالة عضو |
| `changeAdminStatus(threadID, userID, adminStatus)` | تعيين/إزالة مشرف |
| `setTitle(newTitle, threadID)` | تغيير اسم المجموعة |
| `changeGroupImage(image, threadID)` | تغيير صورة المجموعة |
| `changeNickname(nickname, threadID, participantID)` | تغيير لقب عضو |
| `changeThreadColor(color, threadID)` | تغيير لون المحادثة |
| `changeThreadEmoji(emoji, threadID)` | تغيير إيموجي المحادثة |
| `createPoll(title, threadID, options)` | إنشاء استطلاع |
| `deleteThread(threadID)` | حذف محادثة |
| `muteThread(threadID, muteSeconds)` | كتم المحادثة |
| `changeArchivedStatus(threadID, archived)` | أرشفة محادثة |
| `handleMessageRequest(threadID, accept)` | قبول/رفض طلب رسالة |
| `searchForThread(name)` | البحث عن محادثة بالاسم |
| `getThemePictures()` | صور الثيمات المتاحة |
| `getThreadColors()` | ألوان الثيمات |
| `createThemeAI(threadID, options)` | إنشاء ثيم بالذكاء الاصطناعي |

### المستخدمون (`domains/users`)

| الأمر | الوصف |
|-------|-------|
| `getUserInfo(userIDs)` | معلومات مستخدم بالمعرّف |
| `getUserInfoV2(userIDs)` | نسخة محسّنة من getUserInfo |
| `getUserID(name)` | البحث عن مستخدم بالاسم |
| `getFriendsList()` | قائمة الأصدقاء |

### الحساب (`domains/account`)

| الأمر | الوصف |
|-------|-------|
| `getCurrentUserID()` | معرّف الحساب الحالي |
| `changeAvatar(image)` | تغيير الصورة الشخصية |
| `changeBio(bio)` | تغيير السيرة الذاتية |
| `changeBlockedStatus(userID, block)` | حظر/إلغاء حظر مستخدم |
| `follow(userID)` | متابعة مستخدم |
| `unfriend(userID)` | إلغاء الصداقة |
| `handleFriendRequest(userID, accept)` | قبول/رفض طلب صداقة |
| `setPostReaction(reactionID, postID)` | reaction على منشور |
| `setProfileGuard(enabled)` | حماية الملف الشخصي |
| `refreshFbDtsg()` | تجديد رمز DTSG |
| `logout()` | تسجيل الخروج |
| `enableAutoSaveAppState(path, intervalMs)` | حفظ appState تلقائياً |
| `addExternalModule(module)` | إضافة وحدة خارجية |

---

## هيكل المشروع

```
lib/
├── index.js                  ← نقطة الدخول الرئيسية
├── plugin-provider.js        ← مسجِّل البلاجينات المركزي (342 plugin)
├── errors.js                 ← تعريفات الأخطاء
│
├── app/                      ← واجهة التطبيق العالية المستوى
│   ├── messenger-client.js   ← MessengerClient (الواجهة الرئيسية)
│   ├── messenger-bot.js      ← MessengerBot
│   ├── create-client.js      ← createFcaClient
│   ├── plugin-system.js      ← PluginSystem
│   ├── conduit-layer.js      ← طبقة MQTT/HTTP
│   └── messenger-context.js  ← MessengerContext
│
├── core/                     ← منطق الدخول والإعداد
│   ├── auth.js               ← login, loginAsync, loginLegacy
│   ├── auth-helpers.js       ← مساعدات المصادقة
│   ├── config.js             ← loadConfig, resolveConfig
│   ├── mqtt.js               ← listenMqtt
│   ├── state.js              ← createDefaultContext
│   ├── request.js            ← createRequestHelper
│   ├── login-helper.impl.js  ← تنفيذ تسجيل الدخول الكامل
│   ├── login-helper.js       ← واجهة login-helper
│   └── thread-info-realtime-sync.js
│
├── safety/                   ← 19 وحدة للأمان والحماية من الحظر
│   ├── FacebookSafety.js     ← المُنسِّق الرئيسي
│   ├── StealthMode.js        ← تحديد المعدل البشري
│   ├── fingerprint-generator.js
│   ├── circuit-breaker.js
│   ├── watchdog.js
│   └── ...
│
├── domains/                  ← منطق الأعمال مُقسَّم حسب النطاق
│   ├── messages/             ← 19 أمر + 4 استعلامات
│   ├── threads/              ← 15 أمر + 7 استعلامات
│   ├── users/                ← 4 استعلامات
│   ├── account/              ← 13 أمر
│   ├── realtime/             ← listener, middleware, parse-delta
│   ├── scheduler/            ← جدولة المهام
│   ├── http/                 ← HTTP commands/queries
│   └── media/               ← create-post, search-stickers
│
├── database/                 ← 3 backends
│   ├── jsonStore.js
│   ├── mongoStore.js
│   └── postgresStore.js
│
├── performance/              ← مراقبة الصحة
│   ├── health-server.js      ← HTTP /health endpoint
│   ├── health-metrics.js     ← مقاييس الأداء
│   └── manager.js            ← PerformanceManager
│
├── remote/
│   └── remoteClient.js       ← التحكم عن بُعد عبر WebSocket
│
├── transport/                ← طبقة النقل
│   ├── http/                 ← facebook, graphql, mercury, threads
│   └── realtime/             ← mqtt connect, publish, stream, topics
│
├── utils/                    ← أدوات مساعدة
│   ├── human-timing.js       ← توليد تأخيرات بشرية (Poisson, LogNormal)
│   ├── send-queue.js         ← طابور إرسال الرسائل
│   ├── message-dedup.js      ← منع تكرار الرسائل
│   ├── event-bus.js          ← EventBus
│   ├── lru-cache.js          ← LRU Cache
│   ├── broadcast.js          ← البث لعدة threads
│   ├── format/               ← message, attachment, cookie, delta
│   ├── request/              ← HTTP client, retry, proxy, decompress
│   └── loginParser/          ← تحليل استجابات الدخول
│
├── observability/            ← القنوات التشخيصية
│   ├── channels.js           ← emitMqttPublish, emitHttpRequest, ...
│   └── perf.js               ← startPerfObserver, measure
│
├── session/                  ← إدارة السياق
│   ├── context-store.js      ← getCtx, runWithCtx, bindCtx
│   ├── session.js
│   └── capability-resolver.js
│
├── nexus/                    ← واجهة Nexus الموسّعة
│   ├── index.js
│   ├── utils.js
│   └── api/                  ← follow, getUID, listenRealtime, ...
│
├── workers/                  ← معالجة Delta في Worker threads
│   ├── delta-parser.worker.js
│   └── delta-pool.js
│
├── types/                    ← تعريفات الأنواع
│   ├── index.js
│   ├── core.js
│   ├── client.js
│   ├── events.js
│   ├── messaging.js
│   ├── threads.js
│   └── scheduler.js
│
├── compat/                   ← توافق مع الواجهات القديمة
│   ├── api-registry.js
│   ├── callbackify.js
│   └── legacy-promise.js
│
├── external-apis/            ← واجهات التوافق مع المكتبات الخارجية
│   ├── messaging/            ← sendMessage, sendBroadcast, ...
│   ├── threads/              ← getThreadHistory, getThreadInfo, ...
│   ├── users/                ← getUserInfo, getUID, ...
│   ├── action/               ← changeAvatar, follow, logout, ...
│   ├── safety/               ← FacebookSafetyManager
│   ├── utils/                ← ws3Compat, mostakimCompat, antiDetection
│   ├── command/              ← CommandSystem
│   ├── database/             ← DatabaseManager
│   ├── error/                ← ErrorHandler
│   └── app/                  ← botManager
│
└── func/
    ├── logger.js             ← نظام السجلات
    └── logAdapter.js         ← محوّل السجلات
```

---

## التغييرات عن النسخة الأصلية

| التغيير | التفاصيل |
|---------|---------|
| ✅ حُذف `update-check.js` | إزالة فحص التحديثات + تنظيف جميع مراجعه في `auth.js` و`index.js` |
| ✅ حُذفت ملفات غير إنتاجية | `examples/`, `README.md` الأصلي, `fca-config.example.json`, `import-smoke.js` |
| ✅ `remoteControl.enabled = true` | مُفعَّل افتراضياً في `config.js` — يحتاج `url` صحيح للعمل |
| ✅ `healthServer` دائماً مُفعَّل | `MessengerClient` يُشغّل Health Server تلقائياً بدون شرط |
| ✅ نظام البلاجين مُضاف | كل ملف يُصدّر `$plugin`، و`plugin-provider.js` يُوفّر `registerAll()` |
| ✅ `package.json` مُضاف | ESM كامل، Node/Bun engines مُحدَّدان |

---

## متغيرات البيئة

| المتغير | الوصف |
|---------|-------|
| `FCA_EMAIL` | بريد الحساب (بديل عن الإعداد) |
| `FCA_PASSWORD` | كلمة المرور |
| `FCA_2FA` | رمز المصادقة الثنائية |
| `HEALTH_PORT` | منفذ Health Server (افتراضي: `10000`) |
| `DATABASE_URL` | اتصال PostgreSQL |
| `MONGODB_URI` | اتصال MongoDB |

---

## الأخطاء

```js
import {
  FcaError,
  FcaNetworkError,
  FcaHttpError,
  FcaMqttError,
  FcaMqttTimeoutError,
  FcaAuthError,
  FcaNotLoggedInError,
  FcaRateLimitError,
  FcaCircuitOpenError,
} from './lib/index.js';

try {
  await client.start();
} catch (err) {
  if (err instanceof FcaAuthError)       console.error('خطأ في تسجيل الدخول');
  if (err instanceof FcaRateLimitError)  console.error('تجاوزت حد المعدل');
  if (err instanceof FcaCircuitOpenError) console.error('Circuit Breaker مفتوح');
}
```

---

## الترخيص

MIT
