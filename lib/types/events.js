export const FCA_EVENT = Object.freeze({
  
  MESSAGE: 'message',
  MESSAGE_CREATE: 'messageCreate',
  MESSAGE_REPLY: 'message_reply',
  MESSAGE_DELETE: 'messageDelete', 
  MESSAGE_SEEN: 'message_seen',

  
  MESSAGE_REACTION_ADD: 'messageReactionAdd', 

  
  TYPING_START: 'typingStart',
  TYPING_STOP: 'typingStop',

  
  THREAD_UPDATE: 'threadUpdate', 
  EVENT: 'event', 

  
  PRESENCE: 'presence',

  
  READY: 'ready',
  SHARD_READY: 'shardReady',
  ERROR: 'error',

  
  UPDATE: 'update',
  RAW: 'raw',
});

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-types-events',
  meta: { category: 'types', path: 'lib/types/events.js' },
  setup(_ctx) {
    // provides: FCA_EVENT
  },
};
