import { on } from 'node:events';
import { EventEmitter } from 'node:events';

export async function* listenAsync(api, signal) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  let stopListen;

  
  const listenPromise = new Promise((_, reject) => {
    stopListen = api.listen((err, event) => {
      if (err) {
        emitter.emit('error', err);
        return;
      }
      if (event) {
        emitter.emit('event', event);
      }
    });
  });

  
  const onAbort = () => {
    emitter.emit('_done');
    if (typeof stopListen?.stopListening === 'function') {
      try {
        stopListen.stopListening();
      } catch {
        
      }
    }
  };

  if (signal) {
    if (signal.aborted) {
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    
    for await (const [event] of on(emitter, 'event', { signal })) {
      yield event;
    }
  } catch (err) {
    
    if (err?.name === 'AbortError' || signal?.aborted) return;
    throw err;
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort);
    onAbort();
  }
}

export async function* filterEvents(source, filter) {
  const predicate = typeof filter === 'string' ? (e) => e.type === filter : filter;

  for await (const event of source) {
    if (predicate(event)) yield event;
  }
}

export async function takeEvents(source, count) {
  const results = [];
  for await (const event of source) {
    results.push(event);
    if (results.length >= count) break;
  }
  return results;
}

export default { listenAsync, filterEvents, takeEvents };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-domains-realtime-async-listen',
  meta: { category: 'domain-realtime', path: 'lib/domains/realtime/async-listen.js' },
  setup(_ctx) {
    // provides: listenAsync, filterEvents, takeEvents
  },
};
