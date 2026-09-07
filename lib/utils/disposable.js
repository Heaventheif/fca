export function disposableTimer(ms, fn) {
  const id = setTimeout(fn, ms);
  return {
    [Symbol.dispose]() {
      clearTimeout(id);
    },
  };
}

export function disposableInterval(ms, fn) {
  const id = setInterval(fn, ms);
  return {
    [Symbol.dispose]() {
      clearInterval(id);
    },
  };
}

export function disposableMqttListener(client, event, handler) {
  client.on(event, handler);
  return {
    [Symbol.dispose]() {
      try {
        client.removeListener(event, handler);
      } catch {
        
      }
    },
  };
}

export function disposableListener(emitter, event, handler) {
  emitter.on(event, handler);
  return {
    [Symbol.dispose]() {
      try {
        emitter.removeListener(event, handler);
      } catch {
        
      }
    },
  };
}

export function disposableAbortController(timeoutMs) {
  const controller = new AbortController();
  let timerId;
  if (timeoutMs)
    timerId = setTimeout(
      () => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  return {
    controller,
    signal: controller.signal,
    [Symbol.dispose]() {
      if (timerId) clearTimeout(timerId);
      if (!controller.signal.aborted) controller.abort();
    },
  };
}

export default {
  disposableTimer,
  disposableInterval,
  disposableMqttListener,
  disposableListener,
  disposableAbortController,
};

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-utils-disposable',
  meta: { category: 'utils', path: 'lib/utils/disposable.js' },
  setup(_ctx) {
    // provides: disposableTimer, disposableInterval, disposableMqttListener, disposableListener, disposableAbortController
  },
};
