export const FcaSchedulerStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-scheduler',
  meta: { category: 'types', path: 'lib/types/scheduler.js' },
  setup(_ctx) {
    // provides: FcaSchedulerStatus
  },
};
