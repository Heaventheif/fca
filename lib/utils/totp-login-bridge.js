/**
 * totp-login-bridge.js — ربط TOTP تلقائياً بعملية تسجيل الدخول
 *
 * FIX-07: totp.js موجود في المكتبة لكن login-helper لا يستخدمه.
 *          هذا الملف يُوفّر:
 *
 *  1. resolveTwoFactor(secret) — يُعيد رمز TOTP/ثابت حسب الإدخال
 *  2. loginWithTOTP(appState, opts) — login عادي لكن يحقن TOTP تلقائياً
 *  3. waitAndLoginWithTOTP(appState, opts) — ينتظر نافذة آمنة (≥8s) قبل الدخول
 *
 * Supported secret formats:
 *   - Base32 TOTP secret:   "JBSWY3DPEHPK3PXP"
 *   - Fixed code:           "123456"  (6 أرقام — يُستخدم كما هو)
 *   - null/undefined:       لا 2FA
 */

import { generateTOTP, verifyTOTP, waitForFreshTOTP } from './totp.js';
import { login, loginAsync } from '../core/auth.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * يحدد إذا كان الـ secret هو TOTP Base32 أم رمز ثابت
 * TOTP secrets: Base32 فقط (A-Z 2-7)، عادةً 16-32 حرف
 * Fixed codes: أرقام فقط ≤ 8 أرقام
 */
function isTotpSecret(val) {
  if (!val || typeof val !== 'string') return false;
  const clean = val.replace(/\s/g, '').toUpperCase();
  return /^[A-Z2-7]{10,}$/.test(clean);   // Base32 — أقل من 10 → رمز ثابت
}

/**
 * حل قيمة twofactor:
 *   - إذا كانت TOTP secret → أولّد الرمز الحالي
 *   - إذا كانت رمز ثابت (6-8 أرقام) → أعدها كما هي
 *   - null/undefined → ""
 *
 * @param {string|null} secret
 * @returns {string}  رمز جاهز للإرسال
 */
export function resolveTwoFactor(secret) {
  if (!secret) return '';
  if (isTotpSecret(secret)) return generateTOTP(secret);
  return String(secret);   // رمز ثابت أو نص مخصص
}

/**
 * تحقق من صحة رمز TOTP مقابل السر المعروف
 * (مفيد في تشغيل الاختبارات — لا علاقة بـ Facebook مباشرة)
 */
export { verifyTOTP }; // signature: verifyTOTP(secret, code, opts)

/**
 * Login عادي مع حقن TOTP تلقائي
 *
 * @param {object} credentials  { appState?, Cookie?, email?, password?, twofactor? }
 *                              twofactor يمكن أن يكون TOTP secret أو رمز ثابت
 * @param {object} opts         globalOptions
 * @returns {Promise<{api}>}
 */
export async function loginWithTOTP(credentials, opts = {}) {
  const creds = { ...credentials };

  if (creds.twofactor && isTotpSecret(creds.twofactor)) {
    creds.twofactor = generateTOTP(creds.twofactor);
  }

  return loginAsync(creds, opts);
}

/**
 * Login مع انتظار نافذة TOTP آمنة (≥minRemaining ثانية متبقية)
 * يمنع استخدام رمز على وشك الانتهاء يُسبب "invalid code" من Facebook.
 *
 * @param {object} credentials
 * @param {object} opts
 * @param {object} totpOpts    { minRemaining: 8, period: 30 }
 */
export async function waitAndLoginWithTOTP(credentials, opts = {}, totpOpts = {}) {
  const creds = { ...credentials };
  const isSecret = creds.twofactor && isTotpSecret(creds.twofactor);

  if (isSecret) {
    const minRemaining = totpOpts.minRemaining ?? 8;
    const period       = totpOpts.period       ?? 30;
    await waitForFreshTOTP(minRemaining, period);
    creds.twofactor = generateTOTP(creds.twofactor, { period });
  }

  return loginAsync(creds, opts);
}

/**
 * Callback-based wrapper (للتوافق مع الكود القديم)
 */
export function loginWithTOTPCallback(credentials, opts, callback) {
  if (typeof opts === 'function') { callback = opts; opts = {}; }
  waitAndLoginWithTOTP(credentials, opts)
    .then(ctx => callback(null, ctx.api))
    .catch(err => callback(err instanceof Error ? err : new Error(String(err?.message ?? err))));
}

export default { resolveTwoFactor, loginWithTOTP, waitAndLoginWithTOTP, loginWithTOTPCallback };
