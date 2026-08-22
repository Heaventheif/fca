/**
 * userAgents.js — 2026-updated browser User-Agent strings and Client-Hints helpers
 *
 * Audit fixes:
 *  - Added Chrome 140–152 UAs with correct build numbers and not-brand rotation
 *  - Added Firefox 139–145 modern Gecko UAs
 *  - sec-ch-ua values now use correct per-version not-brand rotation
 *  - Removed outdated Chrome 135 (released late 2024, minor market share by 2026)
 */

// Not-brand rotation table (mirrors stealth-profiles.js)
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
function nb(major) {
  return NOT_BRAND[major] ?? { label: 'Not/A)Brand', value: '8' };
}

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

const OS_PROFILES = [
  { key: 'windows_11_24h2', ua: '(Windows NT 10.0; Win64; x64)', platform: '"Windows"', platformVersion: '"17.0.0"', arch: '"x86"', bitness: '"64"', wow64: '?0' },
  { key: 'windows_11_22h2', ua: '(Windows NT 10.0; Win64; x64)', platform: '"Windows"', platformVersion: '"15.0.0"', arch: '"x86"', bitness: '"64"', wow64: '?0' },
  { key: 'macos_sequoia_arm', ua: '(Macintosh; Intel Mac OS X 10_15_7)', platform: '"macOS"', platformVersion: '"16.2.0"', arch: '"arm"', bitness: '"64"', wow64: null },
  { key: 'macos_sonoma_intel', ua: '(Macintosh; Intel Mac OS X 10_15_7)', platform: '"macOS"', platformVersion: '"15.7.9"', arch: '"x86"', bitness: '"64"', wow64: null },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a fully-randomized, internally-consistent browser fingerprint.
 * All returned values are ready to insert directly into request headers.
 */
export function randomUserAgent() {
  // 12% chance of Firefox (realistic market share vs Chrome/Edge)
  if (Math.random() < 0.12) {
    const ffVersions = [139, 140, 141, 145, 147];
    const v = pick(ffVersions);
    const os = Math.random() < 0.65 ? '(Windows NT 10.0; Win64; x64' : '(Macintosh; Intel Mac OS X 10.15';
    const suffix = os.includes('Windows') ? `; rv:${v}.0)` : `; rv:${v}.0)`;
    return {
      userAgent: `Mozilla/5.0 ${os}${suffix} Gecko/20100101 Firefox/${v}.0`,
      secChUa: null,
      secChUaFullVersionList: null,
      secChUaPlatform: null,
      secChUaPlatformVersion: null,
      secChUaMobile: null,
      secChUaArch: null,
      secChUaBitness: null,
      secChUaWow64: null,
      isFirefox: true,
    };
  }

  const chromeMajors = Object.keys(CHROME_BUILDS).map(Number);
  // Weight newer versions higher (reflects real-world usage)
  const weights = chromeMajors.map((v, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;
  let major = chromeMajors[0];
  for (let i = 0; i < chromeMajors.length; i++) {
    rand -= weights[i];
    if (rand <= 0) { major = chromeMajors[i]; break; }
  }

  const build = CHROME_BUILDS[major];
  const os = pick(OS_PROFILES);
  const { label, value } = nb(major);
  const isEdge = Math.random() < 0.07; // ~7% Edge
  const brand = isEdge ? 'Microsoft Edge' : 'Google Chrome';
  const edgeSuffix = isEdge ? ` Edg/${build.replace(/\.\d+$/, '.0')}` : '';

  const secChUaStr = `"${brand}";v="${major}", "Chromium";v="${major}", "${label}";v="${value}"`;
  const secChUaFullStr = `"${brand}";v="${build}", "Chromium";v="${build}", "${label}";v="${value}.0.0.0"`;

  return {
    userAgent: `Mozilla/5.0 ${os.ua} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${build} Safari/537.36${edgeSuffix}`,
    secChUa: secChUaStr,
    secChUaFullVersionList: secChUaFullStr,
    secChUaPlatform: os.platform,
    secChUaPlatformVersion: os.platformVersion,
    secChUaMobile: '?0',
    secChUaArch: os.arch,
    secChUaBitness: os.bitness,
    secChUaWow64: os.wow64,
    isFirefox: false,
  };
}

/** Stable default UA — used when no per-request override is specified */
export const defaultUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7947.67 Safari/537.36';

export default { randomUserAgent, defaultUserAgent };
