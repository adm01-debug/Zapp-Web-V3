/**
 * Runtime guards for ChatInputArea props that can legitimately arrive as
 * `undefined` from parent hooks (e.g. `queue` before the sender hook mounts,
 * or `attempts` before the first retry). Centralized so both the component
 * and its tests share one source of truth.
 */

export interface QueueAttempt {
  duration?: number;
}

export interface QueueItemLike {
  id: string;
  status: 'sending' | 'failed' | 'confirmed' | 'pending';
  progress?: number;
  attempts?: QueueAttempt[] | null;
}

/** Safe length for a possibly-undefined queue. */
export function getQueueLength(queue: readonly QueueItemLike[] | null | undefined): number {
  return Array.isArray(queue) ? queue.length : 0;
}

/** Always returns an array — never `undefined`/`null`. */
export function normalizeAttempts(
  attempts: QueueItemLike['attempts']
): QueueAttempt[] {
  return Array.isArray(attempts) ? attempts : [];
}

/** Duration of the last attempt, or `undefined` if none/invalid. */
export function getLastAttemptDuration(
  attempts: QueueItemLike['attempts']
): number | undefined {
  const list = normalizeAttempts(attempts);
  if (list.length === 0) return undefined;
  const last = list[list.length - 1];
  return typeof last?.duration === 'number' ? last.duration : undefined;
}
