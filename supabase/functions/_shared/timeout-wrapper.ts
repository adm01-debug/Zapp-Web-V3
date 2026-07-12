/**
 * Timeout Wrapper Utility
 * Prevents indefinite API hangs using Promise.race pattern
 *
 * Configurable timeouts by action type:
 * - auto-tag: 30 seconds (quick classification)
 * - suggest-reply: 60 seconds (more complex)
 * - churn-analysis: 45 seconds (medium complexity)
 * - conversation-summary: 50 seconds
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

const ACTION_TIMEOUTS: Record<string, number> = {
  'auto-tag': 30_000,           // 30 seconds
  'suggest-reply': 60_000,      // 60 seconds
  'churn-analysis': 45_000,     // 45 seconds
  'conversation-summary': 50_000, // 50 seconds
  'enhance-message': 25_000,    // 25 seconds
  'classify-emoji': 20_000,     // 20 seconds
  'classify-sticker': 20_000,   // 20 seconds
};

/**
 * Wrap a promise with a timeout
 * @param promise The promise to timeout
 * @param timeoutMs Timeout in milliseconds
 * @param label Optional label for error message
 * @returns Promise that resolves/rejects with timeout enforced
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`Request timeout after ${timeoutMs}ms${label ? `: ${label}` : ''}`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Wrap API call with action-specific timeout
 * @param actionName Name of the AI action
 * @param apiFn Function that returns the API promise
 * @param overrideTimeoutMs Optional timeout override
 * @returns Promise with timeout enforced
 */
export async function callAiWithTimeout<T>(
  actionName: string,
  apiFn: () => Promise<T>,
  overrideTimeoutMs?: number
): Promise<T> {
  const timeoutMs = overrideTimeoutMs ?? ACTION_TIMEOUTS[actionName] ?? 30_000;

  try {
    return await withTimeout(apiFn(), timeoutMs, actionName);
  } catch (error) {
    if (error instanceof TimeoutError) {
      console.warn(`[TIMEOUT] ${actionName}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get timeout for a specific action
 */
export function getTimeoutForAction(actionName: string): number {
  return ACTION_TIMEOUTS[actionName] ?? 30_000;
}

/**
 * Set custom timeout for an action
 */
export function setTimeoutForAction(actionName: string, timeoutMs: number): void {
  ACTION_TIMEOUTS[actionName] = timeoutMs;
}
