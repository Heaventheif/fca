import { createHmac } from 'node:crypto';

const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32_MAP = new Uint8Array(256).fill(255);
for (let i = 0; i < B32_CHARS.length; i++) B32_MAP[B32_CHARS.charCodeAt(i)] = i;

function base32Decode(input) {
  const s = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const bytes = [];
  let buf = 0,
    bits = 0;

  for (let i = 0; i < s.length; i++) {
    const val = B32_MAP[s.charCodeAt(i)];
    if (val === 255) throw new Error(`totp: invalid base32 char "${s[i]}"`);
    buf = (buf << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretBytes, counter, digits = 6) {
  
  const buf = Buffer.alloc(8);
  const lo = counter >>> 0;
  const hi = Math.floor(counter / 0x100000000) >>> 0;
  buf.writeUInt32BE(hi, 0);
  buf.writeUInt32BE(lo, 4);

  const hmac = createHmac('sha1', secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    10 ** digits;

  return String(code).padStart(digits, '0');
}

export function generateTOTP(secret, opts = {}) {
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const timeMs = opts.timeMs ?? Date.now();

  const secretBytes = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / period);
  return hotp(secretBytes, counter, digits);
}

export function verifyTOTP(secret, token, opts = {}) {
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const window = opts.window ?? 1;
  const timeMs = opts.timeMs ?? Date.now();

  const secretBytes = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / period);

  for (let step = -window; step <= window; step++) {
    if (hotp(secretBytes, counter + step, digits) === String(token)) return true;
  }
  return false;
}

export function totpRemainingSeconds(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}

export async function waitForFreshTOTP(minRemaining = 5, period = 30) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  while (true) {
    const rem = totpRemainingSeconds(period);
    if (rem >= minRemaining) return rem;
    await sleep((minRemaining - rem + 1) * 1000);
  }
}

export default { generateTOTP, verifyTOTP, totpRemainingSeconds, waitForFreshTOTP };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-totp',
  meta: { category: 'utils', path: 'lib/utils/totp.js' },
  setup(_ctx) {
    // provides: generateTOTP, verifyTOTP, totpRemainingSeconds, waitForFreshTOTP
  },
};
