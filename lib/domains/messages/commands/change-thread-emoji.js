import { createChangeThreadEmojiCommand as e } from '../../threads/commands/change-thread-emoji.js';
import { createChangeThreadEmojiCommand as d } from '../../threads/commands/change-thread-emoji.js';
var m = { createChangeThreadEmojiCommand: e };
export { d as createChangeThreadEmojiCommand, m as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-change-thread-emoji',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/change-thread-emoji.js' },
  setup(_ctx) {
    // provides: createChangeThreadEmojiCommand
  },
};
