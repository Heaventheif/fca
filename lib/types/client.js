export const FcaApiShape = Object.freeze({ _type: 'FcaApi' });

export const FcaClientShape = Object.freeze({ _type: 'FcaClient' });

export const FcaLoginInputShape = Object.freeze({ _type: 'FcaLoginInput' });

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-client',
  meta: { category: 'types', path: 'lib/types/client.js' },
  setup(_ctx) {
    // provides: FcaApiShape, FcaClientShape, FcaLoginInputShape
  },
};
