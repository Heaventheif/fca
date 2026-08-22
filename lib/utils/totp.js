/**
 * totp.js — مولّد رموز TOTP/HOTP مدمج بدون تبعيات خارجية
 *
 * يستخدم node:crypto المدمج فقط.
 * متوافق مع Google Authenticator / Authy (RFC 6238).
 *
 * Usage:
 *   import { generateTOTP, verifyTOTP } from './utils/totp.js';
 *   const code = generateTOTP('BASE32_SECRET');        // '123456'
 *   const ok   = verifyTOTP('BASE32_SECRET', '123456'); // true/false
 */
import { createHmac } from 'node:crypto';

// ─── Base32 decoder (RFC 4648 — no padding required) ──────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const B32_MAP   = new Uint8Array(256).fill(255);
for (let i = 0; i < B32_CHARS.length; i++) B32_MAP[B32_CHARS.charCodeAt(i)] = i;

function base32Decode(input) {
  const s     = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  const bytes = [];
  let   buf   = 0, bits = 0;

  for (let i = 0; i < s.length; i++) {
    const val = B32_MAP[s.charCodeAt(i)];
    if (val === 255) throw new Error(`totp: invalid base32 char "${s[i]}"`);
    buf  = (buf << 5) | val;
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 0xff); }
  }
  return Buffer.from(bytes);
}

// ─── HOTP (RFC 4226) ──────────────────────────────────────────────────────
function hotp(secretBytes, counter, digits = 6) {
  // counter as 8-byte big-endian
  const buf = Buffer.alloc(8);
  const lo  = counter >>> 0;
  const hi  = Math.floor(counter / 0x100000000) >>> 0;
  buf.writeUInt32BE(hi, 0);
  buf.writeUInt32BE(lo, 4);

  const hmac  = createHmac('sha1', secretBytes).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code   = (
    ((hmac[offset]     & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) <<  8) |
     (hmac[offset + 3] & 0xff)
  ) % (10 ** digits);

  return String(code).padStart(digits, '0');
}

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────
/**
 * توليد رمز TOTP حالي
 * @param {string} secret    - Base32 encoded secret
 * @param {object} [opts]
 * @param {number}   opts.period   - ثواني (default: 30)
 * @param {number}   opts.digits   - طول الرمز (default: 6)
 * @param {number}   opts.timeMs   - timestamp مخصص (default: Date.now())
 * @returns {string}
 */
export function generateTOTP(secret, opts = {}) {
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const timeMs = opts.timeMs ?? Date.now();

  const secretBytes = base32Decode(secret);
  const counter     = Math.floor(timeMs / 1000 / period);
  return hotp(secretBytes, counter, digits);
}

/**
 * التحقق من رمز TOTP مع نافذة تسامح ±steps خطوة
 * @param {string} secret
 * @param {string} token   - الرمز المراد التحقق منه
 * @param {object} [opts]
 * @param {number}   opts.window - خطوات التسامح (default: 1 = ±30s)
 * @returns {boolean}
 */
export function verifyTOTP(secret, token, opts = {}) {
  const period = opts.period ?? 30;
  const digits = opts.digits ?? 6;
  const window = opts.window ?? 1;
  const timeMs = opts.timeMs ?? Date.now();

  const secretBytes = base32Decode(secret);
  const counter     = Math.floor(timeMs / 1000 / period);

  for (let step = -window; step <= window; step++) {
    if (hotp(secretBytes, counter + step, digits) === String(token)) return true;
  }
  return false;
}

/**
 * الوقت المتبقي قبل انتهاء الرمز الحالي (بالثواني)
 * @param {number} [period=30]
 * @returns {number}
 */
export function totpRemainingSeconds(period = 30) {
  return period - (Math.floor(Date.now() / 1000) % period);
}

/**
 * انتظر توليد رمز جديد (نافذة آمنة ≥5 ثوان متبقية)
 * مفيد قبل تسجيل الدخول: تجنب استخدام رمز على وشك الانتهاء.
 * @param {number} [minRemaining=5]
 * @param {number} [period=30]
 */
export async function waitForFreshTOTP(minRemaining = 5, period = 30) {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  while (true) {
    const rem = totpRemainingSeconds(period);
    if (rem >= minRemaining) return rem;
    await sleep((minRemaining - rem + 1) * 1000);
  }
}

export default { generateTOTP, verifyTOTP, totpRemainingSeconds, waitForFreshTOTP };
