import o from './FacebookSafety.js';
import r from './StealthMode.js';
import t from './SingleSessionGuard.js';
import e from './SessionLock.js';
import { Watchdog as m, createWatchdog as i } from './watchdog.js';
export {
  o as FacebookSafety,
  e as SessionLock,
  t as SingleSessionGuard,
  r as StealthMode,
  m as Watchdog,
  i as createWatchdog,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-safety-nexus-index',
  meta: { category: 'safety', path: 'lib/safety/nexus-index.js' },
  setup(_ctx) {
    // provides: FacebookSafety, SessionLock, SingleSessionGuard, StealthMode, Watchdog, createWatchdog
  },
};
