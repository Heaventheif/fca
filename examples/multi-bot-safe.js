/**
 * multi-bot-safe.js — Example: running multiple bot accounts safely
 *
 * Demonstrates the correct pattern after Fix 1 (createRequestCore isolation).
 * Each bot gets its own isolated CookieJar — no cross-contamination.
 *
 * Run:
 *   export FCA_JSON_STORE_KEY="strong-random-key-here"
 *   node examples/multi-bot-safe.js
 */

import { login } from '../lib/core/auth.js';
import { FCA_EVENT } from '../lib/types/events.js';

const BOTS = [
  { label: 'Bot A', appState: [] },
  { label: 'Bot B', appState: [] },
];

const SHARED_OPTIONS = { logLevel: 'warn', listenEvents: false, autoReconnect: true };

async function launchBot({ label, appState }) {
  console.log(`[${label}] Connecting…`);
  // Each login() call creates an isolated context with its own CookieJar
  const ctx = await login({ appState }, SHARED_OPTIONS);
  const api  = ctx.api;
  const uid  = typeof api.getCurrentUserID === 'function' ? api.getCurrentUserID() : ctx.fbid;
  console.log(`[${label}] Logged in as UID: ${uid}`);

  const listener = api.listenMqtt();
  listener.on(FCA_EVENT.MESSAGE, (event) => {
    api.sendMessage(`[${label}] Echo: ${event.body}`, event.threadID).catch(console.error);
  });
  listener.on(FCA_EVENT.ERROR, (err) => console.error(`[${label}] Error:`, err.message));

  return { label, uid, stop: () => api.stopListening?.() };
}

async function main() {
  if (BOTS.every(b => b.appState.length === 0)) {
    console.log('Demo mode — replace BOTS[].appState with real exported cookies.');
    return;
  }
  const bots = await Promise.all(BOTS.map(launchBot));
  console.log(`✅ ${bots.length} bots running. Ctrl+C to stop.`);
  process.once('SIGINT', () => { bots.forEach(b => b.stop()); process.exit(0); });
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
