export const FcaThreadFolders = Object.freeze({
  INBOX: 'inbox',
  PENDING: 'pending',
  OTHER: 'other',
  SPAM: 'spam',
});

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-threads',
  meta: { category: 'types', path: 'lib/types/threads.js' },
  setup(_ctx) {
    // provides: FcaThreadFolders
  },
};
