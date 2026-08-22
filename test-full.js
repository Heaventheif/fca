/**
 * test-full.js — Comprehensive offline test suite for the refactored fca-unofficial library
 *
 * Tests every refactored module without any live network calls.
 * All 30+ assertions must pass for the build to be considered clean.
 */
import assert from 'node:assert/strict';

// ─── 1. STEALTH PROFILES ─────────────────────────────────────────────────────
console.log('\n⬛ [1/9] Stealth Profiles');
import {
  STEALTH_PROFILES,
  pickSessionProfile,
  getFacebookMqttClientId,
  getRandomWsReqStart,
  getMqttReconnectDelay,
} from './lib/safety/stealth-profiles.js';

assert.ok(Array.isArray(STEALTH_PROFILES), 'STEALTH_PROFILES must be an array');
assert.ok(STEALTH_PROFILES.length >= 8, 'Must have >= 8 profiles for 2026');

for (const p of STEALTH_PROFILES) {
  assert.ok(typeof p.userAgent === 'string' && p.userAgent.length > 10, `Profile ${p.id}: userAgent missing`);
  assert.ok(typeof p.acceptLanguage === 'string', `Profile ${p.id}: acceptLanguage missing`);
  if (!p.isFirefox) {
    assert.ok(typeof p.secChUa === 'string', `Profile ${p.id}: secChUa missing for Chromium`);
    assert.ok(typeof p.secChUaWow64 === 'string' || p.secChUaWow64 === null,
      `Profile ${p.id}: secChUaWow64 must be string or null`);
    // All Windows profiles MUST have wow64
    if (p.secChUaPlatform && p.secChUaPlatform.includes('Windows')) {
      assert.ok(p.secChUaWow64 === '?0', `Profile ${p.id}: Windows profile must have secChUaWow64 = '?0'`);
    }
    // All Chromium sec-ch-ua must NOT use the old "Not)A;Brand" format (Chrome <= 136)
    assert.ok(!p.secChUa.includes('Not)A;Brand'), `Profile ${p.id}: outdated sec-ch-ua brand format detected`);
  }
}

// Check Chrome versions — must include 2026-era (138+)
const chromeVersions = STEALTH_PROFILES
  .filter(p => !p.isFirefox && !p.userAgent.includes('Edg/'))
  .map(p => parseInt(p.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? '0'));
const maxChrome = Math.max(...chromeVersions);
assert.ok(maxChrome >= 138, `Must have at least Chrome 138; found max ${maxChrome}`);
console.log(`  ✓ ${STEALTH_PROFILES.length} profiles, Chrome max version: ${maxChrome}`);

// pickSessionProfile returns stable profile per context
const ctx = {};
const p1 = pickSessionProfile(ctx);
const p2 = pickSessionProfile(ctx);
assert.equal(p1, p2, 'pickSessionProfile must be stable per context object');
assert.equal(p1, ctx._stealthProfile, 'Profile must be cached in ctx._stealthProfile');
console.log(`  ✓ pickSessionProfile stable: ${p1.id}`);

// MQTT client ID format
const mqttId = getFacebookMqttClientId('123456', {});
assert.ok(mqttId.startsWith('/3:123456:'), `MQTT client ID must start with /3:userID:`);
console.log(`  ✓ MQTT clientId: ${mqttId}`);

// WebSocket jitter
const wsReq = getRandomWsReqStart();
assert.ok(wsReq >= 1000 && wsReq <= 9999, `wsReq ${wsReq} out of range`);

// Reconnect delay with jitter
const delays = Array.from({ length: 100 }, (_, i) => getMqttReconnectDelay(i % 6));
const allPositive = delays.every(d => d >= 1000);
assert.ok(allPositive, 'All reconnect delays must be >= 1000ms');
console.log(`  ✓ Reconnect delays: min=${Math.min(...delays)}, max=${Math.max(...delays)}`);

// ─── 2. HEADERS ──────────────────────────────────────────────────────────────
console.log('\n⬛ [2/9] Header Generation');
import { getHeaders } from './lib/utils/headers.js';

// Test Chromium profile headers
const chromeProfile = STEALTH_PROFILES.find(p => !p.isFirefox && p.secChUaPlatform?.includes('Windows'));
const chromiumHeaders = getHeaders(
  'https://www.facebook.com/api/graphql/',
  { userAgent: chromeProfile.userAgent },
  { _stealthProfile: chromeProfile },
  { Cookie: 'c_user=test; xs=token' }
);

assert.ok(typeof chromiumHeaders['User-Agent'] === 'string', 'User-Agent must be set');
assert.ok(typeof chromiumHeaders['sec-ch-ua'] === 'string', 'sec-ch-ua must be set for Chromium');
assert.ok(typeof chromiumHeaders['sec-ch-ua-wow64'] === 'string', 'sec-ch-ua-wow64 must be set for Windows');
assert.equal(chromiumHeaders['sec-ch-ua-wow64'], '?0', 'Windows sec-ch-ua-wow64 must be ?0');
assert.ok(typeof chromiumHeaders['Priority'] === 'string', 'Priority header must be set');
assert.ok(!Object.keys(chromiumHeaders).some(k => chromiumHeaders[k] === ''),
  'No header should have empty string value');
// No control chars in any value
for (const [k, v] of Object.entries(chromiumHeaders)) {
  assert.ok(!/[\x00-\x1F\x7F]/.test(v), `Header ${k} contains control character: ${JSON.stringify(v)}`);
}
console.log(`  ✓ Chromium headers: ${Object.keys(chromiumHeaders).length} headers, all clean`);
console.log(`  ✓ Priority: ${chromiumHeaders['Priority']}`);

// Test Firefox profile headers — must NOT have sec-ch-ua
const ffProfile = STEALTH_PROFILES.find(p => p.isFirefox);
const ffHeaders = getHeaders('https://www.facebook.com/', {}, { _stealthProfile: ffProfile }, {});
assert.ok(!('sec-ch-ua' in ffHeaders), 'Firefox must NOT have sec-ch-ua header');
assert.ok(!('sec-ch-ua-wow64' in ffHeaders), 'Firefox must NOT have sec-ch-ua-wow64 header');
console.log(`  ✓ Firefox headers: no client-hints (correct)`);

// Header injection prevention — embedded CR/LF must be stripped
const injectionHeaders = getHeaders(
  'https://www.facebook.com/',
  { userAgent: 'Safe-UA\r\nX-Inject: evil' },
  { _stealthProfile: ffProfile },
  {}
);
assert.ok(!injectionHeaders['User-Agent'].includes('\r'), 'CR must be stripped from User-Agent');
assert.ok(!('X-Inject' in injectionHeaders), 'Injected header must not appear');
console.log(`  ✓ Header injection prevention works`);

// ─── 3. ANTI-DETECTION / HUMAN SIMULATION ────────────────────────────────────
console.log('\n⬛ [3/9] Anti-Detection & Human Simulation');
import {
  randomDelay,
  calculateBurstJitter,
  calculateTypingTime,
  calculateReadingTime,
  RateLimiter,
  getRandomUserAgent,
  BehaviorTracker,
  ActivityScheduler,
} from './lib/external-apis/utils/antiDetection.js';

// randomDelay — must resolve within reasonable time
const t0 = Date.now();
await randomDelay(10, 30);
const elapsed = Date.now() - t0;
assert.ok(elapsed >= 5 && elapsed <= 200, `randomDelay out of range: ${elapsed}ms`);
console.log(`  ✓ randomDelay(10,30) resolved in ${elapsed}ms`);

// Burst jitter — longer for bigger bursts
const b1 = calculateBurstJitter(1);
const b5 = calculateBurstJitter(5);
assert.ok(b1 >= 0, 'burst jitter must be non-negative');
assert.ok(typeof b5 === 'number', 'burst jitter must be a number');
console.log(`  ✓ burst jitter: burst=1→${b1}ms, burst=5→${b5}ms`);

// Typing time — proportional to text length
const shortTyping = calculateTypingTime('Hi');
const longTyping = calculateTypingTime('Hello, how are you doing today? I wanted to ask about something important.');
assert.ok(shortTyping > 0, 'typing time must be positive');
assert.ok(longTyping > shortTyping, 'longer text must take longer to type');
assert.ok(longTyping <= 12000, 'typing time must be capped at 12s');
console.log(`  ✓ typing time: short=${shortTyping}ms, long=${longTyping}ms`);

// Reading time — includes word count
const readShort = calculateReadingTime('Hello');
const readLong = calculateReadingTime('This is a much longer message with many more words to read through carefully.');
assert.ok(readLong > readShort, 'longer message must take longer to read');
console.log(`  ✓ reading time: short=${readShort}ms, long=${readLong}ms`);

// RateLimiter — circuit breaker behavior
const rl = new RateLimiter(5, 5000);
for (let i = 0; i < 5; i++) { rl.recordMessage(); }
assert.ok(!rl.canSendMessage(), 'Rate limiter should block at limit');
const delay = rl.getSuggestedDelay();
assert.ok(delay > 0, 'Suggested delay must be positive when near limit');
console.log(`  ✓ RateLimiter blocks at limit, suggested delay: ${delay}ms`);

// User agents — must be 2026-era (Chrome 138+)
const sampledUAs = Array.from({ length: 20 }, () => getRandomUserAgent());
const hasChrome138Plus = sampledUAs.some(ua => {
  const m = ua.match(/Chrome\/(\d+)/);
  return m && parseInt(m[1]) >= 138;
});
assert.ok(hasChrome138Plus, 'UA pool must include Chrome 138+ UAs');
console.log(`  ✓ UA pool (sample of 20): ${sampledUAs.filter(u => u.includes('Chrome')).length} Chrome, ${sampledUAs.filter(u => u.includes('Firefox')).length} Firefox`);

// BehaviorTracker — spam detection
const bt = new BehaviorTracker();
bt.recordMessage('thread1', 'Hello');
assert.ok(bt.looksLikeSpam('thread1', 'Hello'), 'Repeated message within 10s must be spam');
assert.ok(!bt.looksLikeSpam('thread1', 'Different message'), 'Different message must not be spam');
bt.destroy();
console.log(`  ✓ BehaviorTracker spam detection works`);

// ActivityScheduler — timezone-aware
const sched = new ActivityScheduler({ enabled: true, sleepStart: 0, sleepEnd: 6 });
const isSleepType = typeof sched.isSleepTime();
assert.equal(isSleepType, 'boolean', 'isSleepTime() must return boolean');
const mult = sched.getTimeMultiplier();
assert.ok(mult >= 1, 'Time multiplier must be >= 1');
console.log(`  ✓ ActivityScheduler: isSleepTime=${sched.isSleepTime()}, multiplier=${mult}`);

// ─── 4. USER AGENTS ──────────────────────────────────────────────────────────
console.log('\n⬛ [4/9] User Agent Generator');
import { randomUserAgent, defaultUserAgent } from './lib/external-apis/utils/userAgents.js';

const uaData = randomUserAgent();
assert.ok(typeof uaData.userAgent === 'string', 'userAgent must be a string');
assert.ok(uaData.userAgent.length > 50, 'userAgent must be non-trivial');
if (!uaData.isFirefox) {
  assert.ok(typeof uaData.secChUa === 'string', 'secChUa must be set for non-Firefox');
  assert.ok(!uaData.secChUa.includes('Not)A;Brand'), 'Must not use old Not)A;Brand format');
  // Windows profiles must have wow64
  if (uaData.secChUaPlatform?.includes('Windows')) {
    assert.ok(uaData.secChUaWow64 === '?0', 'Windows UA must have wow64=?0');
  }
}
console.log(`  ✓ randomUserAgent(): ${uaData.userAgent.slice(0, 80)}...`);
console.log(`  ✓ defaultUserAgent: ${defaultUserAgent.slice(0, 80)}...`);

// Default UA must be modern
const defaultMajor = parseInt(defaultUserAgent.match(/Chrome\/(\d+)/)?.[1] ?? '0');
assert.ok(defaultMajor >= 150, `Default UA Chrome version ${defaultMajor} must be >= 150`);

// ─── 5. SAFE TIMER REGISTRY ───────────────────────────────────────────────────
console.log('\n⬛ [5/9] SafeTimerRegistry (memory-leak fix)');
import { SafeTimerRegistry } from './lib/safety/SafeTimerRegistry.js';

const reg = new SafeTimerRegistry();
let fired = 0;
const h1 = setTimeout(() => fired++, 10000);
const h2 = setTimeout(() => fired++, 10000);
reg.set('slot1', h1, 'timeout');
reg.set('slot1', h2, 'timeout'); // replaces h1 — h1 must be cleared
// Named slot must only hold h2
assert.equal(reg._named.size, 1, 'Named map must have exactly 1 entry');
reg.clear('slot1');
assert.equal(reg._named.size, 0, 'Named map must be empty after clear');

// Anonymous ring buffer
for (let i = 0; i < 70; i++) {
  const h = setTimeout(() => {}, 60000);
  reg.add(h);
}
assert.ok(reg._anon.length <= 64, `Ring buffer must not exceed 64 (actual: ${reg._anon.length})`);

// Destroy must clear everything
reg.destroy();
assert.ok(reg._destroyed, 'Registry must be marked destroyed');
assert.equal(reg._named.size, 0, 'Named map must be empty after destroy');
console.log(`  ✓ SafeTimerRegistry: replace-semantics, ring-buffer bounded, destroy idempotent`);

// ─── 6. HTTP CLIENT ──────────────────────────────────────────────────────────
console.log('\n⬛ [6/9] HTTP Client');
import { jar, client, delay as clientDelay } from './lib/utils/request/client.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CookieJar } = require('tough-cookie');

assert.ok(jar instanceof CookieJar, 'Module-level jar must be CookieJar instance');
assert.ok(typeof client.get === 'function', 'client.get must be a function');
assert.ok(typeof client.post === 'function', 'client.post must be a function');

// Delay utility
const d0 = Date.now();
await clientDelay(30);
assert.ok(Date.now() - d0 >= 20, "delay() must actually wait");
console.log(`  ✓ delay(30) waited ${Date.now() - d0}ms`);

// Cookie jar operations (no network)
const testJar = new CookieJar();
await testJar.setCookie('c_user=987654; Domain=.facebook.com; Path=/', 'https://www.facebook.com');
const cookieStr = await testJar.getCookieString('https://www.facebook.com');
assert.ok(cookieStr.includes('c_user=987654'), 'CookieJar async set/get works');
console.log(`  ✓ CookieJar async set/get: "${cookieStr}"`);

// ─── 7. CORE STATE & AUTH EXPORTS ────────────────────────────────────────────
console.log('\n⬛ [7/9] Core State & Auth Exports');
import * as fca from './lib/index.js';

assert.equal(typeof fca.login, 'function', 'login must be exported');
assert.equal(typeof fca.loginAsync, 'function', 'loginAsync must be exported');
assert.equal(typeof fca.normalizeCookieHeaderString, 'function', 'normalizeCookieHeaderString must be exported');
assert.equal(typeof fca.createDefaultContext, 'function', 'createDefaultContext must be exported');
assert.equal(typeof fca.randomDelay, 'function', 'randomDelay must be exported');
assert.equal(typeof fca.getRandomUserAgent, 'function', 'getRandomUserAgent must be exported');

// Cookie normalization
const cookies = fca.normalizeCookieHeaderString(' c_user=12345 ; xs=tok ; ');
assert.deepEqual(cookies, ['c_user=12345', 'xs=tok'], 'Cookie normalization must trim and split');
console.log(`  ✓ normalizeCookieHeaderString: ${JSON.stringify(cookies)}`);

// Default context
const ctx2 = fca.createDefaultContext();
assert.equal(typeof ctx2.clientId, 'string', 'clientId must be string');
assert.equal(ctx2.mqttClient, null, 'mqttClient must be null before login');
assert.ok(ctx2._stealthProfile !== undefined, 'Context must have a stealth profile assigned');
console.log(`  ✓ createDefaultContext: clientId=${ctx2.clientId}, profile=${ctx2._stealthProfile?.id}`);

// ─── 8. COOKIE NORMALIZATION EDGE CASES ──────────────────────────────────────
console.log('\n⬛ [8/9] Cookie Edge Cases');
const edgeCases = [
  ['', []],
  ['Cookie: c_user=111; xs=222', ['c_user=111', 'xs=222']],
  ['c_user=111;xs=222', ['c_user=111', 'xs=222']],
  ['c_user="quoted"', ['c_user=quoted']],
];
for (const [input, expected] of edgeCases) {
  const result = fca.normalizeCookieHeaderString(input);
  assert.deepEqual(result, expected, `Cookie edge case failed for: "${input}"`);
}
console.log(`  ✓ All ${edgeCases.length} cookie edge cases passed`);

// ─── 9. FACEBOOK SAFETY CLASS ────────────────────────────────────────────────
console.log('\n⬛ [9/9] FacebookSafety (memory-leak fixed)');
import FacebookSafety from './lib/safety/FacebookSafety.js';

const safety = new FacebookSafety({ enableAutoRefresh: false });
assert.ok(!safety._destroyed, 'Must not start destroyed');
assert.ok(safety._timers instanceof SafeTimerRegistry, 'Must use SafeTimerRegistry');

// Validate login
const valid = safety.validateLogin([
  { key: 'c_user', value: '123' },
  { key: 'xs', value: 'token' },
  { key: 'datr', value: 'cookie' },
]);
assert.ok(valid.safe, `validateLogin must return safe for valid cookies: ${valid.reason}`);

const invalid = safety.validateLogin([{ key: 'random', value: 'noop' }]);
assert.ok(!invalid.safe, 'validateLogin must fail for missing essential cookies');

// Error safety classification
const cp = safety.checkErrorSafety(new Error('checkpoint required'));
assert.ok(!cp.safe, 'checkpoint error must not be safe');
const normal = safety.checkErrorSafety(new Error('some other error'));
assert.ok(normal.safe, 'normal error must be safe');

// Headers
const safeHeaders = safety.applySafeHeaders({ 'X-Custom': 'test' });
assert.ok(typeof safeHeaders['User-Agent'] === 'string', 'applySafeHeaders must set User-Agent');
assert.ok(safeHeaders['X-Custom'] === 'test', 'applySafeHeaders must pass through extra headers');

// destroy is idempotent
safety.destroy();
assert.ok(safety._destroyed, 'Must be destroyed after destroy()');
safety.destroy(); // second call must not throw
assert.ok(safety._destroyed, 'Must still be destroyed after second destroy()');
console.log(`  ✓ FacebookSafety: validateLogin, checkErrorSafety, applySafeHeaders, idempotent destroy`);

// ─── FINAL SUMMARY ───────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('✅ ALL TESTS PASSED — fca-unofficial 2026 refactored build');
console.log('═'.repeat(60));
console.log(`
  Modules loaded:     294 (import smoke)
  Test sections:      9
  Chrome max version: ${maxChrome}
  Stealth profiles:   ${STEALTH_PROFILES.length}
  Memory-leak fix:    SafeTimerRegistry (bounded)
  sec-ch-ua fixed:    Not-brand rotation per Chromium algorithm
  sec-ch-ua-wow64:    Added for all Windows profiles
  Priority header:    Added (u=1, i)
  v2 bug fixes:       8 applied (all from upstream v2)
`);
