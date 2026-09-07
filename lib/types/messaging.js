export const FcaMessageTypes = Object.freeze({
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  FILE: 'file',
  STICKER: 'sticker',
});

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-messaging',
  meta: { category: 'types', path: 'lib/types/messaging.js' },
  setup(_ctx) {
    // provides: FcaMessageTypes
  },
};
