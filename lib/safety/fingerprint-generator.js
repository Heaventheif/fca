/**
 * fingerprint-generator.js — مولّد بصمة متصفح ديناميكي (2026-compatible)
 *
 * إصلاحات:
 *  - sec-ch-ua يستخدم not-brand rotation الصحيح (من stealth-profiles.js)
 *  - أُضيفت حقول: secChUaWow64, secChUaFullVersionList, secChUaBitness
 *  - CHROME_VERSIONS مُحدَّثة لـ 2026 (138–152)
 *  - تفاصيل بناء Chrome دقيقة (full build numbers) لا major فقط
 *  - secChUaPlatformVersion صحيح لكل نظام تشغيل
 */
import crypto from 'node:crypto';

// not-brand rotation — مطابق لـ Chromium brandbuildflags.gni
const NOT_BRAND = {
  138: { label: 'Not(A;Brand',  value: '8'  },
  140: { label: 'Not:A-Brand',  value: '8'  },
  143: { label: 'Not.A-Brand',  value: '8'  },
  146: { label: 'Not(A;Brand',  value: '99' },
  148: { label: 'Not:A-Brand',  value: '99' },
  150: { label: 'Not;A=Brand',  value: '99' },
  151: { label: 'Not=A?Brand',  value: '99' },
  152: { label: 'Not_A Brand',  value: '99' },
};
const CHROME_BUILDS = {
  138: '138.0.7204.101',
  140: '140.0.7312.56',
  143: '143.0.7465.89',
  146: '146.0.7635.102',
  148: '148.0.7741.82',
  150: '150.0.7838.74',
  151: '151.0.7891.93',
  152: '152.0.7947.67',
};
const CHROME_MAJORS = Object.keys(CHROME_BUILDS).map(Number);

const SCREEN_PROFILES = [
  { width: 1920, height: 1080, dpr: 1 },
  { width: 1920, height: 1200, dpr: 1 },
  { width: 2560, height: 1440, dpr: 1 },
  { width: 1366, height:  768, dpr: 1 },
  { width: 1440, height:  900, dpr: 2 },
  { width: 2560, height: 1600, dpr: 2 },
  { width: 1280, height:  800, dpr: 2 },
  { width: 3840, height: 2160, dpr: 2 },
];

const PLATFORM_PROFILES = [
  { platform: 'Win32',    os: '"Windows"',  arch: '"x86"', bitness: '"64"', wow64: '?0',  platformVersion: '"17.0.0"' },
  { platform: 'Win32',    os: '"Windows"',  arch: '"x86"', bitness: '"64"', wow64: '?0',  platformVersion: '"15.0.0"' },
  { platform: 'MacIntel', os: '"macOS"',    arch: '"arm"', bitness: '"64"', wow64: null,  platformVersion: '"16.2.0"' },
  { platform: 'MacIntel', os: '"macOS"',    arch: '"x86"', bitness: '"64"', wow64: null,  platformVersion: '"15.7.9"' },
];

const TIMEZONE_LOCALES = [
  { tz: 'America/New_York',    locale: 'en-US', offset: -5 },
  { tz: 'America/Chicago',     locale: 'en-US', offset: -6 },
  { tz: 'America/Los_Angeles', locale: 'en-US', offset: -8 },
  { tz: 'Europe/London',       locale: 'en-GB', offset:  0 },
  { tz: 'Europe/Paris',        locale: 'fr-FR', offset:  1 },
  { tz: 'Asia/Tokyo',          locale: 'ja-JP', offset:  9 },
  { tz: 'Asia/Dubai',          locale: 'ar-AE', offset:  4 },
  { tz: 'Australia/Sydney',    locale: 'en-AU', offset: 11 },
];

const pick   = arr => arr[Math.floor(Math.random() * arr.length)];
const randHex = n => crypto.randomBytes(n).toString('hex');
const randUUID = () =>
  `${randHex(8)}-${randHex(4)}-4${randHex(3)}-${(8|(Math.random()*4|0)).toString(16)}${randHex(3)}-${randHex(12)}`;

export class FingerprintGenerator {
  constructor(opts = {}) {
    this._opts    = opts;
    this._current = null;
  }

  generate() {
    const screen   = pick(SCREEN_PROFILES);
    const plat     = pick(PLATFORM_PROFILES);
    const tzLoc    = pick(TIMEZONE_LOCALES);
    const major    = pick(CHROME_MAJORS);
    const build    = CHROME_BUILDS[major];
    const nb       = NOT_BRAND[major] ?? { label: 'Not/A)Brand', value: '8' };

    const isMac = plat.platform === 'MacIntel';
    const ua = isMac
      ? `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${build} Safari/537.36`
      : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${build} Safari/537.36`;

    const secChUa             = `"Google Chrome";v="${major}", "Chromium";v="${major}", "${nb.label}";v="${nb.value}"`;
    const secChUaFullList     = `"Google Chrome";v="${build}", "Chromium";v="${build}", "${nb.label}";v="${nb.value}.0.0.0"`;

    const fp = {
      sessionId:   randUUID(),
      clientId:    randHex(16),
      deviceId:    randHex(20),
      tabId:       randHex(8),

      screenWidth:       screen.width,
      screenHeight:      screen.height,
      innerWidth:        screen.width  - Math.floor(Math.random() * 40),
      innerHeight:       screen.height - Math.floor(Math.random() * 120 + 60),
      devicePixelRatio:  screen.dpr,

      timezone:       tzLoc.tz,
      timezoneOffset: tzLoc.offset * -60,
      locale:         tzLoc.locale,

      platform:      plat.platform,
      chromeVersion: major,
      chromeBuild:   build,
      userAgent:     ua,

      hardwareConcurrency: pick([4, 6, 8, 10, 12, 16]),
      deviceMemory:        pick([4, 8, 16, 32]),
      connectionType:      pick(['wifi', '4g', 'ethernet']),
      colorDepth:          24,
      colorGamut:          'srgb',

      // ── Client Hints (الإصلاح الرئيسي) ──────────────────────────────────
      secChUa,
      secChUaFullVersionList: secChUaFullList,
      secChUaPlatform:        plat.os,
      secChUaMobile:          '?0',
      secChUaArch:            plat.arch,
      secChUaBitness:         plat.bitness,
      secChUaWow64:           plat.wow64,               // جديد: كان مفقوداً
      secChUaPlatformVersion: plat.platformVersion,     // جديد: كان مفقوداً

      generatedAt: Date.now(),
    };

    this._current = fp;
    return fp;
  }

  current() { return this._current ?? this.generate(); }
  rotate()  { return this.generate(); }

  applyToHeaders(headers, fp) {
    fp = fp ?? this.current();
    headers['User-Agent']                   = fp.userAgent;
    headers['sec-ch-ua']                    = fp.secChUa;
    headers['sec-ch-ua-full-version-list']  = fp.secChUaFullVersionList;
    headers['sec-ch-ua-platform']           = fp.secChUaPlatform;
    headers['sec-ch-ua-mobile']             = fp.secChUaMobile;
    headers['sec-ch-ua-arch']               = fp.secChUaArch;
    headers['sec-ch-ua-bitness']            = fp.secChUaBitness;
    if (fp.secChUaWow64)
      headers['sec-ch-ua-wow64']            = fp.secChUaWow64;
    headers['sec-ch-ua-platform-version']   = fp.secChUaPlatformVersion;
    headers['Accept-Language']              = fp.locale + ',en;q=0.9';
    return headers;
  }

  applyToCtx(ctx, fp) {
    fp = fp ?? this.current();
    if (ctx.globalOptions) ctx.globalOptions.userAgent = fp.userAgent;
    ctx._fingerprint = fp;
    return ctx;
  }
}

export function createFingerprintGenerator(opts) {
  return new FingerprintGenerator(opts);
}

export default FingerprintGenerator;

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-fingerprint-generator',
  meta: { category: 'safety', path: 'lib/safety/fingerprint-generator.js' },
  setup(_ctx) {
    // provides: FingerprintGenerator, createFingerprintGenerator
  },
};
