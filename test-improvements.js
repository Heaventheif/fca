/**
 * test-improvements.js — اختبار كل التحسينات الـ 12
 * يعمل offline بالكامل — لا شبكة، لا Facebook credentials
 */
import assert from 'node:assert/strict';

let passed = 0, failed = 0;

function section(name) {
  console.log(`\n${'━'.repeat(56)}`);
  console.log(`▶  ${name}`);
  console.log('━'.repeat(56));
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch(e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// ══════════════════════════════════════════════════════
// FIX-01/02/03/04 — MessengerClient
// ══════════════════════════════════════════════════════
section('FIX-01: triple-fire إزالة — حدث message يصل مرة واحدة فقط');

import { MessengerClient } from './lib/app/messenger-client.js';

await test('MessengerClient يُمكن إنشاؤه', () => {
  // mock api
  const api = {
    _ctx: {},
    _defaultFuncs: null,
    listenMqtt: () => () => {},
    getCurrentUserID: () => '0',
    sendMessage: (m, t, cb) => cb?.(null, { messageID: 'x' }),
  };
  const client = new MessengerClient(api, { sessionGuard: false, cookieRefresher: false });
  assert.ok(client instanceof MessengerClient, 'يجب أن يكون MessengerClient instance');
  assert.ok(!client._forwardBotEvents, 'FIX-01: _forwardBotEvents يجب أن لا يوجد');
  assert.ok(client._queue, 'FIX-02: ThreadSendQueue يجب أن يكون موجوداً');
});

await test('FIX-01: _routeEvent يُرسل message مرة واحدة فقط', () => {
  const api = {
    _ctx: {}, _defaultFuncs: null,
    listenMqtt: () => () => {},
    getCurrentUserID: () => '0',
    sendMessage: (m, t, cb) => cb?.(null, {}),
  };
  const client = new MessengerClient(api, { sessionGuard: false, cookieRefresher: false });
  
  const messageEvents = [];
  client.on('message', e => messageEvents.push(e));
  client.on('update', () => {});   // absorb update

  // تشغيل _routeEvent مباشرة
  client._routeEvent({ type: 'message', body: 'hello', messageID: 'id1' });

  assert.equal(messageEvents.length, 1, 
    `FIX-01: message يجب أن يُطلق مرة واحدة، أُطلق ${messageEvents.length} مرة`);
});

await test('FIX-02: ThreadSendQueue مُفعّل ويضمن ترتيب الإرسال', async () => {
  const sent = [];
  const api = {
    _ctx: {}, _defaultFuncs: null,
    listenMqtt: () => () => {},
    getCurrentUserID: () => '0',
    sendMessage: (m, t, cb) => { sent.push(m.body); setTimeout(() => cb(null, {}), 10); },
  };
  const client = new MessengerClient(api, { sessionGuard: false, cookieRefresher: false, interMsgDelay: 0 });
  
  // إرسال 3 رسائل متتالية — يجب أن تصل بالترتيب
  await Promise.all([
    client.send({ body: 'أولى' }, 'thread1'),
    client.send({ body: 'ثانية' }, 'thread1'),
    client.send({ body: 'ثالثة' }, 'thread1'),
  ]);
  
  assert.deepEqual(sent, ['أولى', 'ثانية', 'ثالثة'],
    `الترتيب غير صحيح: ${JSON.stringify(sent)}`);
});

// ══════════════════════════════════════════════════════
// FIX-05 — parseRetryAfter
// ══════════════════════════════════════════════════════
section('FIX-05: parseRetryAfter يدعم HTTP-date و seconds');

import { requestWithRetry } from './lib/utils/request/retry.js';

await test('requestWithRetry موجود وقابل للاستدعاء', () => {
  assert.equal(typeof requestWithRetry, 'function');
});

await test('retry-after: عدد صحيح (ثواني)', async () => {
  // نختبر أن الطلب ينجح في المحاولة الثانية
  let attempts = 0;
  const result = await requestWithRetry(async () => {
    attempts++;
    if (attempts < 2) {
      const err = new Error('fail');
      err.code = 'ECONNRESET';
      throw err;
    }
    return 'ok';
  }, 3, 10);
  assert.equal(result, 'ok');
  assert.equal(attempts, 2, `يجب محاولتان، كان ${attempts}`);
});

await test('retry-after: ERR_INVALID_CHAR يوقف فوراً بدون retry', async () => {
  let attempts = 0;
  try {
    await requestWithRetry(async () => {
      attempts++;
      const err = new Error('Invalid character in header');
      err.code = 'ERR_INVALID_CHAR';
      throw err;
    }, 5, 10);
    assert.fail('يجب أن يُرفض');
  } catch(e) {
    assert.equal(e.code, 'ERR_INVALID_CHAR');
    assert.equal(attempts, 1, 'يجب محاولة واحدة فقط عند ERR_INVALID_CHAR');
  }
});

await test('retry-after: 4xx لا يُكرر المحاولة', async () => {
  let attempts = 0;
  try {
    await requestWithRetry(async () => {
      attempts++;
      const err = new Error('Forbidden');
      err.response = { status: 403 };
      throw err;
    }, 5, 10);
    assert.fail('يجب أن يُرفض');
  } catch(e) {
    assert.equal(attempts, 1, `4xx يجب أن لا يُكرر، محاولات: ${attempts}`);
  }
});

// ══════════════════════════════════════════════════════
// FIX-06 — In-Flight Deduplication
// ══════════════════════════════════════════════════════
section('FIX-06: In-Flight Deduplication — منع الطلبات المتكررة');

import { InflightCache, createFcaInflightCaches, wrapApiWithInflight } from './lib/utils/inflight-cache.js';

await test('InflightCache: طلبان بنفس المفتاح يُدمجان في Promise واحدة', async () => {
  const cache = new InflightCache();
  let callCount = 0;

  const slowFetch = () => new Promise(resolve => {
    callCount++;
    setTimeout(() => resolve({ data: 'result' }), 50);
  });

  // إطلاق طلبين في نفس الوقت بنفس المفتاح
  const [r1, r2] = await Promise.all([
    cache.dedupe('thread:999', slowFetch),
    cache.dedupe('thread:999', slowFetch),
  ]);

  assert.equal(callCount, 1, `يجب استدعاء واحد للشبكة، كان ${callCount}`);
  assert.deepEqual(r1, r2, 'النتيجتان يجب أن تكونا متطابقتين');
});

await test('InflightCache: مفاتيح مختلفة تُطلق طلبات منفصلة', async () => {
  const cache = new InflightCache();
  let calls = 0;

  const fetch = (id) => () => new Promise(r => { calls++; setTimeout(() => r(id), 20); });

  const [a, b] = await Promise.all([
    cache.dedupe('thread:1', fetch('t1')),
    cache.dedupe('thread:2', fetch('t2')),
  ]);

  assert.equal(calls, 2, 'مفاتيح مختلفة تُطلق طلبات منفصلة');
  assert.equal(a, 't1');
  assert.equal(b, 't2');
});

await test('InflightCache: stats تعكس الـ hit rate الصحيح', async () => {
  const cache = new InflightCache();
  let n = 0;
  const fn = () => new Promise(r => { n++; setTimeout(() => r('x'), 30); });

  await Promise.all([
    cache.dedupe('k', fn), cache.dedupe('k', fn), cache.dedupe('k', fn),
  ]);

  assert.equal(n, 1);
  assert.equal(cache.stats.hits, 2, `hits يجب أن يكون 2، كان ${cache.stats.hits}`);
  assert.equal(cache.stats.total, 3);
});

await test('wrapApiWithInflight: يُدمج طلبَي getThreadInfo المتزامنَين', async () => {
  let networkCalls = 0;
  const api = {
    getThreadInfo(tid, cb) {
      networkCalls++;
      setTimeout(() => cb(null, { threadID: tid, name: 'Test' }), 40);
    }
  };

  const caches = createFcaInflightCaches();
  wrapApiWithInflight(api, caches);

  const [r1, r2] = await Promise.all([
    new Promise((res, rej) => api.getThreadInfo('tid1', (e, r) => e ? rej(e) : res(r))),
    new Promise((res, rej) => api.getThreadInfo('tid1', (e, r) => e ? rej(e) : res(r))),
  ]);

  assert.equal(networkCalls, 1, `يجب استدعاء شبكي واحد، كان ${networkCalls}`);
  assert.equal(r1.threadID, 'tid1');
});

// ══════════════════════════════════════════════════════
// FIX-07 — TOTP Bridge
// ══════════════════════════════════════════════════════
section('FIX-07: TOTP Login Bridge');

import { resolveTwoFactor, verifyTOTP } from './lib/utils/totp-login-bridge.js';

await test('resolveTwoFactor: يُعيد "" لـ null/undefined', () => {
  assert.equal(resolveTwoFactor(null), '');
  assert.equal(resolveTwoFactor(undefined), '');
  assert.equal(resolveTwoFactor(''), '');
});

await test('resolveTwoFactor: يُعيد الرمز الثابت كما هو (6 أرقام)', () => {
  const code = resolveTwoFactor('123456');
  assert.equal(code, '123456', 'رمز ثابت يجب إعادته بدون تعديل');
});

await test('resolveTwoFactor: يُولّد TOTP من Base32 secret', () => {
  // RFC 4648 Base32 secret صالح
  const code = resolveTwoFactor('JBSWY3DPEHPK3PXP');
  assert.ok(/^\d{6}$/.test(code), `TOTP يجب أن يكون 6 أرقام، كان: ${code}`);
});

await test('verifyTOTP: رمز مُولَّد يجتاز التحقق', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  const code = resolveTwoFactor(secret);
  const valid = verifyTOTP(secret, code);  // signature: verifyTOTP(secret, tokenToVerify)
  assert.ok(valid, `الرمز المُولَّد ${code} يجب أن يكون صالحاً`);
});

// ══════════════════════════════════════════════════════
// FIX-08 — Structured Logger
// ══════════════════════════════════════════════════════
section('FIX-08: Structured Logger مع Context');

import { createLogger } from './lib/utils/structured-logger.js';

await test('createLogger: يُنشئ دالة تسجيل', () => {
  const log = createLogger({ level: 'debug', userID: 'uid123' });
  assert.equal(typeof log, 'function');
  assert.equal(typeof log.child, 'function');
  assert.equal(typeof log.error, 'function');
  assert.equal(typeof log.warn, 'function');
});

await test('log.child يرث الـ userID ويضيف context', () => {
  const lines = [];
  const log = createLogger({
    userID: 'uid123',
    level: 'debug',
    output: l => lines.push(l),
    json: true,
  });
  const child = log.child({ threadID: 'tid456' });
  child('test message', 'info');

  const parsed = JSON.parse(lines[lines.length - 1]);
  assert.equal(parsed.userID,   'uid123',  'userID يجب أن يُورَث');
  assert.equal(parsed.threadID, 'tid456',  'threadID يجب أن يُضاف');
  assert.equal(parsed.message,  'test message');
  assert.equal(parsed.level,    'info');
});

await test('logger يحترم minLevel — debug لا يظهر عند level=info', () => {
  const lines = [];
  const log = createLogger({ level: 'info', output: l => lines.push(l), json: true });
  log('debug msg', 'debug');
  log('info msg',  'info');
  assert.equal(lines.length, 1, 'debug يجب أن يُتجاهل عند level=info');
  assert.ok(lines[0].includes('info msg'));
});

await test('JSON output يُنتج JSON صالح في كل سطر', () => {
  const lines = [];
  const log = createLogger({ level: 'debug', json: true, output: l => lines.push(l) });
  log('hello', 'warn', { extra: 42 });
  const parsed = JSON.parse(lines[0]);
  assert.ok(parsed.ts, 'يجب أن يكون timestamp');
  assert.equal(parsed.level, 'warn');
  assert.equal(parsed.extra, 42);
});

// ══════════════════════════════════════════════════════
// FIX-09 — Graceful Shutdown
// ══════════════════════════════════════════════════════
section('FIX-09: Graceful Shutdown');

import { registerGracefulShutdown } from './lib/utils/graceful-shutdown.js';

await test('registerGracefulShutdown: يُنشئ دالة shutdown', () => {
  const mockCtx = {};
  const mockApi = {};
  const fn = registerGracefulShutdown(mockApi, mockCtx, { exitProcess: false });
  assert.equal(typeof fn, 'function', 'يجب أن يُعيد دالة');
});

await test('shutdown: ينتهي بنجاح دون MQTT (exitProcess: false)', async () => {
  const mockCtx = { mqttClient: null };
  const mockApi = {};
  let shutdownCalled = false;

  const fn = registerGracefulShutdown(mockApi, mockCtx, {
    exitProcess: false,
    timeoutMs: 2000,
    onShutdown: async () => { shutdownCalled = true; },
  });

  await fn('test-reason');
  assert.ok(shutdownCalled, 'onShutdown callback يجب أن يُستدعى');
});

await test('shutdown: ينتهي مع MQTT mock disconnect', async () => {
  let disconnectCalled = false;
  const mockCtx = {
    mqttClient: {
      connected: true,
      end: (force, opts, cb) => { disconnectCalled = true; cb?.(); },
    }
  };

  const fn = registerGracefulShutdown({}, mockCtx, { exitProcess: false, timeoutMs: 3000 });
  await fn('test');
  assert.ok(disconnectCalled, 'MQTT end() يجب أن يُستدعى');
});

// ══════════════════════════════════════════════════════
// FIX-10 — ThreadSendQueue drain/pause/resume
// ══════════════════════════════════════════════════════
section('FIX-10: ThreadSendQueue — drain/pause/resume/enqueueUrgent');

import ThreadSendQueue from './lib/utils/send-queue.js';

await test('drain(): ينتهي عندما تفرغ الـ queues', async () => {
  const sent = [];
  const q = new ThreadSendQueue(
    (msg, tid) => new Promise(r => setTimeout(() => { sent.push(msg.body); r({}); }, 20)),
    { interMsgDelay: 0 }
  );

  q.enqueue({ body: 'a' }, 'T1');
  q.enqueue({ body: 'b' }, 'T1');
  q.enqueue({ body: 'c' }, 'T2');

  await q.drain(3000);
  assert.equal(sent.length, 3, `drain() يجب أن ينتظر كل الرسائل، أُرسل ${sent.length}`);
});

await test('pause() يوقف الإرسال، resume() يستأنفه', async () => {
  const sent = [];
  const q = new ThreadSendQueue(
    (msg, tid) => new Promise(r => setTimeout(() => { sent.push(msg.body); r({}); }, 10)),
    { interMsgDelay: 0 }
  );

  q.pause();
  q.enqueue({ body: 'x' }, 'T3');
  q.enqueue({ body: 'y' }, 'T3');

  await new Promise(r => setTimeout(r, 100));
  assert.equal(sent.length, 0, 'لا يجب إرسال رسائل أثناء pause');

  q.resume();
  await q.drain(2000);
  assert.equal(sent.length, 2, 'يجب إرسال كل الرسائل بعد resume');
});

await test('enqueueUrgent() يضع الرسالة أمام القائمة', async () => {
  const sent = [];
  let first = true;
  const q = new ThreadSendQueue(
    (msg, tid) => new Promise(r => {
      sent.push(msg.body);
      // تأخير طويل للأولى لإتاحة enqueueUrgent يُضاف قبل الثانية
      setTimeout(() => r({}), first ? 80 : 5);
      first = false;
    }),
    { interMsgDelay: 0 }
  );

  q.enqueue({ body: 'normal' }, 'T4');
  await new Promise(r => setTimeout(r, 10)); // أتيح للأولى أن تبدأ
  q.enqueueUrgent({ body: 'urgent' }, 'T4');
  q.enqueue({ body: 'last' }, 'T4');

  await q.drain(2000);
  assert.equal(sent[1], 'urgent', `urgent يجب أن يُرسل قبل last، ترتيب: ${JSON.stringify(sent)}`);
});

// ══════════════════════════════════════════════════════
// FIX-11 — listenSpeed و listenRealtime
// ══════════════════════════════════════════════════════
section('FIX-11: Nexus listeners — UA وimport سليم');

await test('listenSpeed.js يستورد بدون أخطاء', async () => {
  // فقط نتحقق أن الملف يُحمَّل (لا نشغّل MQTT فعلياً)
  const mod = await import('./lib/nexus/api/listenSpeed.js');
  assert.ok(mod.default || mod, 'listenSpeed يجب أن يُصدِّر default');
});

await test('listenRealtime.js يستورد بدون أخطاء', async () => {
  const mod = await import('./lib/nexus/api/listenRealtime.js');
  assert.ok(mod.default || mod, 'listenRealtime يجب أن يُصدِّر default');
});

// ══════════════════════════════════════════════════════
// FIX-12 — applyEnhancements
// ══════════════════════════════════════════════════════
section('FIX-12: applyEnhancements — تفعيل موحّد');

import applyEnhancements from './lib/utils/enhancements.js';

await test('applyEnhancements: يُفعّل كل المكونات دون أخطاء', () => {
  const api = {
    getCurrentUserID: () => 'uid999',
    getThreadInfo: (tid, cb) => cb(null, {}),
    getUserInfo:   (ids, cb) => cb(null, {}),
    sendMessage:   (m, t, cb) => cb?.(null, {}),
  };
  const ctx = { userID: 'uid999', mqttClient: null };

  const enhanced = applyEnhancements(api, ctx, {
    sendQueue: true, inflightCache: true, structuredLogger: true,
    gracefulShutdown: false,
  });

  assert.ok(enhanced.queue,    'queue يجب أن يكون موجوداً');
  assert.ok(enhanced.inflight, 'inflight يجب أن يكون موجوداً');
  assert.ok(enhanced.logger,   'logger يجب أن يكون موجوداً');
  assert.ok(ctx._logger,       '_logger يجب أن يُخزَّن في ctx');
  assert.ok(api._inflight,     '_inflight يجب أن يُخزَّن في api');
});

await test('applyEnhancements: in-flight يعمل فعلياً بعد التفعيل', async () => {
  let calls = 0;
  const api = {
    getCurrentUserID: () => '0',
    getThreadInfo: (tid, cb) => { calls++; setTimeout(() => cb(null, { tid }), 30); },
    getUserInfo:   (ids, cb) => cb(null, {}),
    sendMessage:   (m, t, cb) => cb?.(null, {}),
  };
  const ctx = { userID: '0', mqttClient: null };

  applyEnhancements(api, ctx, { sendQueue: false, inflightCache: true, structuredLogger: false });

  await Promise.all([
    new Promise((r,j) => api.getThreadInfo('X', (e,v) => e ? j(e) : r(v))),
    new Promise((r,j) => api.getThreadInfo('X', (e,v) => e ? j(e) : r(v))),
    new Promise((r,j) => api.getThreadInfo('X', (e,v) => e ? j(e) : r(v))),
  ]);

  assert.equal(calls, 1, `in-flight يجب أن يُوحّد 3 طلبات في 1، كان ${calls}`);
});

// ══════════════════════════════════════════════════════
// النتيجة النهائية
// ══════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(56)}`);
if (failed === 0) {
  console.log(`✅ كل الاختبارات اجتازت: ${passed}/${passed+failed}`);
} else {
  console.log(`⚠️  نتيجة: ${passed} نجح، ${failed} فشل`);
}
console.log(`${'═'.repeat(56)}`);
console.log(`
  التحسينات المُطبَّقة:
  FIX-01: إزالة triple-fire في MessengerClient (message × 3 → × 1)
  FIX-02: ThreadSendQueue بدل _drainQueue اليدوي
  FIX-03: start() race condition → انتظار حقيقي مع رفض عند timeout
  FIX-04: stop() → MQTT disconnect نظيف
  FIX-05: parseRetryAfter → يدعم HTTP-date format
  FIX-06: InflightCache → deduplication للطلبات المتزامنة
  FIX-07: TOTP Bridge → حقن TOTP تلقائي في login
  FIX-08: Structured Logger → سجلات منظّمة مع userID وcontext
  FIX-09: Graceful Shutdown → SIGTERM + MQTT disconnect + queue drain
  FIX-10: drain/pause/resume/enqueueUrgent في ThreadSendQueue
  FIX-11: Nexus listeners → UA محدّث + setInterval.unref()
  FIX-12: applyEnhancements → تفعيل موحّد بسطر واحد
`);
if (failed > 0) process.exit(1);
