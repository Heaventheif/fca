import crypto from 'crypto';

const NOT_BRAND = {
  138: { label: 'Not(A;Brand', value: '8' },
  139: { label: 'Not)A;Brand', value: '8' },
  140: { label: 'Not:A-Brand', value: '8' },
  141: { label: 'Not.A-Brand', value: '8' },
  142: { label: 'Not=A?Brand', value: '8' },
  143: { label: 'Not_A Brand', value: '8' },
  144: { label: 'Not;A=Brand', value: '8' },
  145: { label: 'Not A;Brand', value: '8' },
  146: { label: 'Not(A;Brand', value: '99' },
  147: { label: 'Not/A)Brand', value: '99' },
  148: { label: 'Not:A-Brand', value: '99' },
  149: { label: 'Not.A-Brand', value: '99' },
  150: { label: 'Not;A=Brand', value: '99' },
  151: { label: 'Not=A?Brand', value: '99' },
  152: { label: 'Not_A Brand', value: '99' },
  153: { label: 'Not A;Brand', value: '8' },
  154: { label: 'Not(A;Brand', value: '8' },
  155: { label: 'Not/A)Brand', value: '8' },
};
function nb(major) {
  return NOT_BRAND[major] ?? { label: 'Not/A)Brand', value: '8' };
}

const CB = {
  138: '138.0.7204.101',
  140: '140.0.7312.56',
  143: '143.0.7465.89',
  146: '146.0.7635.102',
  148: '148.0.7741.82',
  150: '150.0.7838.74',
  151: '151.0.7891.93',
  152: '152.0.7947.67',
};

function secChUa(major, brand = 'Google Chrome') {
  const { label, value } = nb(major);
  return `"${brand}";v="${major}", "Chromium";v="${major}", "${label}";v="${value}"`;
}

function secChUaFull(major, build, brand = 'Google Chrome') {
  const { label, value } = nb(major);
  return `"${brand}";v="${build}", "Chromium";v="${build}", "${label}";v="${value}.0.0.0"`;
}

export const STEALTH_PROFILES = [
  
  {
    id: 'chrome_win_138',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[138]} Safari/537.36`,
    secChUa: secChUa(138),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(138, CB[138]),
    secChUaPlatformVersion: '"15.0.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_win_140',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[140]} Safari/537.36`,
    secChUa: secChUa(140),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(140, CB[140]),
    secChUaPlatformVersion: '"17.0.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_win_146',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[146]} Safari/537.36`,
    secChUa: secChUa(146),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(146, CB[146]),
    secChUaPlatformVersion: '"17.0.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_win_150',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[150]} Safari/537.36`,
    secChUa: secChUa(150),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(150, CB[150]),
    secChUaPlatformVersion: '"17.0.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_win_152',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[152]} Safari/537.36`,
    secChUa: secChUa(152),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(152, CB[152]),
    secChUaPlatformVersion: '"17.0.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_mac_intel_143',
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[143]} Safari/537.36`,
    secChUa: secChUa(143),
    secChUaMobile: '?0',
    secChUaPlatform: '"macOS"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: null,
    secChUaFullVersionList: secChUaFull(143, CB[143]),
    secChUaPlatformVersion: '"15.7.9"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'chrome_mac_arm_152',
    userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[152]} Safari/537.36`,
    secChUa: secChUa(152),
    secChUaMobile: '?0',
    secChUaPlatform: '"macOS"',
    secChUaArch: '"arm"',
    secChUaBitness: '"64"',
    secChUaWow64: null,
    secChUaFullVersionList: secChUaFull(152, CB[152]),
    secChUaPlatformVersion: '"16.2.0"',
    acceptLanguage: 'en-US,en;q=0.9',
    isFirefox: false,
  },
  
  {
    id: 'edge_win_151',
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CB[151]} Safari/537.36 Edg/151.0.3892.61`,
    secChUa: secChUa(151, 'Microsoft Edge'),
    secChUaMobile: '?0',
    secChUaPlatform: '"Windows"',
    secChUaArch: '"x86"',
    secChUaBitness: '"64"',
    secChUaWow64: '?0',
    secChUaFullVersionList: secChUaFull(151, CB[151], 'Microsoft Edge'),
    secChUaPlatformVersion: '"17.0.0"',
    acceptLanguage: 'en-US,en;q=0.9,en-GB;q=0.8',
    isFirefox: false,
  },
  
  {
    id: 'firefox_win_141',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0',
    secChUa: null,
    secChUaMobile: null,
    secChUaPlatform: null,
    secChUaArch: null,
    secChUaBitness: null,
    secChUaWow64: null,
    secChUaFullVersionList: null,
    secChUaPlatformVersion: null,
    acceptLanguage: 'en-US,en;q=0.5',
    isFirefox: true,
  },
  
  {
    id: 'firefox_mac_145',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0',
    secChUa: null,
    secChUaMobile: null,
    secChUaPlatform: null,
    secChUaArch: null,
    secChUaBitness: null,
    secChUaWow64: null,
    secChUaFullVersionList: null,
    secChUaPlatformVersion: null,
    acceptLanguage: 'en-US,en;q=0.5',
    isFirefox: true,
  },
];

export function pickSessionProfile(ctx) {
  if (ctx && ctx._stealthProfile) return ctx._stealthProfile;
  const profile = STEALTH_PROFILES[Math.floor(Math.random() * STEALTH_PROFILES.length)];
  if (ctx) ctx._stealthProfile = profile;
  return profile;
}

export function getFacebookMqttClientId(userID, ctx) {
  if (ctx && ctx._fbMqttClientId) return ctx._fbMqttClientId;
  const rand = crypto.randomBytes(4).toString('hex');
  const ts = Date.now().toString(36);
  const id = `/3:${userID}:${rand}${ts}`;
  if (ctx) ctx._fbMqttClientId = id;
  return id;
}

export function getRandomWsReqStart() {
  return Math.floor(Math.random() * 9000) + 1000;
}

export function getMqttReconnectDelay(attempt) {
  const base = Math.min(1000 * Math.pow(2, Math.max(0, attempt)), 30000);
  const jitter = 1 + (Math.random() - 0.5) * 0.6; 
  return Math.max(1000, Math.round(base * jitter));
}

export default {
  STEALTH_PROFILES,
  pickSessionProfile,
  getFacebookMqttClientId,
  getRandomWsReqStart,
  getMqttReconnectDelay,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-stealth-profiles',
  meta: { category: 'safety', path: 'lib/safety/stealth-profiles.js' },
  setup(_ctx) {
    // provides: STEALTH_PROFILES, pickSessionProfile, getFacebookMqttClientId, getRandomWsReqStart, getMqttReconnectDelay
  },
};
