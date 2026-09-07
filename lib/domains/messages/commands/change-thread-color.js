import { createChangeThreadColorCommand as e } from '../../threads/commands/change-thread-color.js';
import { createChangeThreadColorCommand as m } from '../../threads/commands/change-thread-color.js';
var r = { createChangeThreadColorCommand: e };
export { m as createChangeThreadColorCommand, r as default };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-messages-commands-change-thread-color',
  meta: { category: 'domain-messages', path: 'lib/domains/messages/commands/change-thread-color.js' },
  setup(_ctx) {
    // provides: createChangeThreadColorCommand
  },
};
