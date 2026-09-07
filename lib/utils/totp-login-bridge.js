import { generateTOTP, verifyTOTP, waitForFreshTOTP } from './totp.js';
import { login, loginAsync } from '../core/auth.js';

function isTotpSecret(val) {
  if (!val || typeof val !== 'string') return false;
  const clean = val.replace(/\s/g, '').toUpperCase();
  return /^[A-Z2-7]{10,}$/.test(clean); 
}

export function resolveTwoFactor(secret) {
  if (!secret) return '';
  if (isTotpSecret(secret)) return generateTOTP(secret);
  return String(secret); 
}

export { verifyTOTP }; 

export async function loginWithTOTP(credentials, opts = {}) {
  const creds = { ...credentials };

  if (creds.twofactor && isTotpSecret(creds.twofactor)) {
    creds.twofactor = generateTOTP(creds.twofactor);
  }

  return loginAsync(creds, opts);
}

export async function waitAndLoginWithTOTP(credentials, opts = {}, totpOpts = {}) {
  const creds = { ...credentials };
  const isSecret = creds.twofactor && isTotpSecret(creds.twofactor);

  if (isSecret) {
    const minRemaining = totpOpts.minRemaining ?? 8;
    const period = totpOpts.period ?? 30;
    await waitForFreshTOTP(minRemaining, period);
    creds.twofactor = generateTOTP(creds.twofactor, { period });
  }

  return loginAsync(creds, opts);
}

export function loginWithTOTPCallback(credentials, opts, callback) {
  if (typeof opts === 'function') {
    callback = opts;
    opts = {};
  }
  waitAndLoginWithTOTP(credentials, opts)
    .then((ctx) => callback(null, ctx.api))
    .catch((err) => callback(err instanceof Error ? err : new Error(String(err?.message ?? err))));
}

export default { resolveTwoFactor, loginWithTOTP, waitAndLoginWithTOTP, loginWithTOTPCallback };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-totp-login-bridge',
  meta: { category: 'utils', path: 'lib/utils/totp-login-bridge.js' },
  setup(_ctx) {
    // provides: resolveTwoFactor, loginWithTOTP, waitAndLoginWithTOTP, loginWithTOTPCallback, verifyTOTP
  },
};
