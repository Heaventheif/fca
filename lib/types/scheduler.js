/**
 * @fileoverview Scheduler domain type definitions for fca-unofficial.
 */

/**
 * @typedef {object} FcaScheduledMessage
 * @property {string}        id          - Unique job ID
 * @property {string}        threadID    - Target thread
 * @property {string|object} message     - Message body (same as sendMessage arg 1)
 * @property {Date|number}   runAt       - When to send (Date or Unix ms)
 * @property {string}        [cronExpr]  - Cron expression for recurring jobs
 * @property {boolean}       [recurring] - Whether to repeat
 * @property {string}        status      - 'pending' | 'running' | 'done' | 'failed'
 */

/**
 * @typedef {object} FcaSchedulerDomain
 * @property {function(FcaScheduledMessage): string} schedule   - Returns job ID
 * @property {function(string): boolean}             cancel     - Cancel by ID
 * @property {function(): FcaScheduledMessage[]}     list       - All pending jobs
 * @property {function(): void}                      flush      - Run all due jobs now
 */

export const FcaSchedulerStatus = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  DONE:    'done',
  FAILED:  'failed',
});
