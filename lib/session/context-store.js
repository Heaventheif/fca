import { AsyncLocalStorage } from 'node:async_hooks';

export const ctxStore = new AsyncLocalStorage();

export function getCtx() {
  return ctxStore.getStore() ?? null;
}

export function runWithCtx(ctx, fn) {
  return ctxStore.run(ctx, fn);
}

export function bindCtx(ctx, fn) {
  return function (...args) {
    return ctxStore.run(ctx, () => fn.apply(this, args));
  };
}

export function requireCtx() {
  const ctx = ctxStore.getStore();
  if (!ctx) {
    throw new Error(
      'requireCtx() called outside a ctxStore.run() scope. ' +
        'تأكد من تشغيل الكود داخل runWithCtx(ctx, fn).'
    );
  }
  return ctx;
}

export default {
  ctxStore,
  getCtx,
  runWithCtx,
  bindCtx,
  requireCtx,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-session-context-store',
  meta: { category: 'session', path: 'lib/session/context-store.js' },
  setup(_ctx) {
    // provides: ctxStore, getCtx, runWithCtx, bindCtx, requireCtx
  },
};
