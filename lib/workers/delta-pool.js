import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'delta-parser.worker.js');

export class DeltaParserPool {
  
  constructor({ size = 2, libPath = null, taskTimeout = 5000 } = {}) {
    this._pending = new Map(); 
    this._counter = 0;
    this._next = 0;
    this._taskTimeout = taskTimeout;
    this._destroyed = false;

    this._workers = Array.from({ length: Math.max(1, size) }, (_, workerId) => {
      const w = new Worker(WORKER_PATH, { workerData: { libPath } });

      w.on('message', ({ id, result, error }) => {
        const task = this._pending.get(id);
        if (!task) return;
        this._pending.delete(id);
        clearTimeout(task.timer);
        if (error) task.reject(new Error(error));
        else task.resolve(result);
      });

      w.on('error', (err) => {
        
        for (const [id, task] of this._pending) {
          if (task.workerId !== workerId) continue;
          clearTimeout(task.timer);
          task.reject(err);
          this._pending.delete(id);
        }
      });

      w.on('exit', (code) => {
        if (code !== 0 && !this._destroyed) {
          
          for (const [id, task] of this._pending) {
            if (task.workerId !== workerId) continue;
            clearTimeout(task.timer);
            task.reject(new Error(`Worker ${workerId} exited unexpectedly (code ${code})`));
            this._pending.delete(id);
          }
        }
      });

      
      w._poolId = workerId;
      return w;
    });
  }

  
  parse(raw, options = {}) {
    if (this._destroyed) {
      return Promise.reject(new Error('DeltaParserPool has been destroyed'));
    }

    const id = ++this._counter;
    const workerIdx = this._next++ % this._workers.length;
    const worker = this._workers[workerIdx];
    const workerId = worker._poolId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`DeltaParserPool: task ${id} timed out after ${this._taskTimeout}ms`));
      }, this._taskTimeout);

      this._pending.set(id, { resolve, reject, timer, workerId });
      worker.postMessage({ id, raw, options });
    });
  }

  
  stats() {
    return {
      workers: this._workers.length,
      pending: this._pending.size,
      totalTasks: this._counter,
      destroyed: this._destroyed,
    };
  }

  
  async destroy() {
    this._destroyed = true;
    for (const [, task] of this._pending) {
      clearTimeout(task.timer);
      task.reject(new Error('DeltaParserPool destroyed'));
    }
    this._pending.clear();
    await Promise.allSettled(this._workers.map((w) => w.terminate()));
    this._workers.length = 0;
  }
}

export function createDeltaParserPool(options) {
  return new DeltaParserPool(options);
}

export default { DeltaParserPool, createDeltaParserPool };

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-workers-delta-pool',
  meta: { category: 'workers', path: 'lib/workers/delta-pool.js' },
  setup(_ctx) {
    // provides: DeltaParserPool, createDeltaParserPool
  },
};
