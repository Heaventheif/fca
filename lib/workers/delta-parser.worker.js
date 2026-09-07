/**
 * delta-parser.worker.js — Worker Thread لتحليل delta payloads
 *
 * BUG-FIX: parentPort كان null عند تشغيل الملف خارج Worker context
 * (مثل import-smoke.js) → TypeError: Cannot read properties of null (reading 'on')
 *
 * الإصلاح: Guard يتحقق من isMainThread قبل استخدام parentPort
 */
import { parentPort, workerData, isMainThread } from 'node:worker_threads';

// Guard حرج: لا تُشغّل كـ Worker logic إذا كنا في الـ main thread
if (isMainThread) {
  // هذا الملف يُستورد في import-smoke أو يُستخدم كـ module — لا تفعل شيئاً
  // الـ DeltaParserPool يُنشئ Worker منفصل بـ new Worker(WORKER_PATH)
  // فهذا الكود لا يصل إليه في السيناريو الطبيعي
} else {
  const { libPath } = workerData ?? {};
  let parseDeltaPayload;

  async function init() {
    try {
      if (libPath) {
        const mod = await import(libPath);
        parseDeltaPayload = mod.parseDeltaPayload ?? mod.default?.parseDeltaPayload;
      }
    } catch {
      parseDeltaPayload = null;
    }
  }

  init()
    .then(() => {
      parentPort.on('message', ({ id, raw, options }) => {
        try {
          let result;
          if (parseDeltaPayload) {
            result = parseDeltaPayload(raw, options);
          } else {
            result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          }
          parentPort.postMessage({ id, result });
        } catch (err) {
          parentPort.postMessage({ id, error: err.message });
        }
      });
    })
    .catch((err) => {
      // init فشل فشلاً غير متوقع — نُسجّل ونخرج بكود خطأ
      // الـ DeltaParserPool يلتقط حدث 'exit' ويُرجع reject لكل المهام المعلّقة
      process.stderr.write(`[delta-parser.worker] init failed: ${err?.message ?? err}\n`);
      process.exit(1);
    });
}

// ─── Plugin Descriptor ──────────────────────────────────────────
/** @type {import('./plugin-provider.js').FcaPlugin} */
export const $plugin = {
  name: 'fca-workers-delta-parser.worker',
  meta: { category: 'workers', path: 'lib/workers/delta-parser.worker.js' },
  setup(_ctx) {
    // see module exports
  },
};
