/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by fast-failing when API is degraded
 *
 * States:
 * - CLOSED: Normal operation, all requests pass through
 * - OPEN: API degraded, all requests fail immediately
 * - HALF_OPEN: Testing recovery, single request allowed through
 */

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureTime: number;
  successCount: number;
}

const circuitBreakerStates = new Map<string, CircuitBreakerState>();

const FAILURE_THRESHOLD = 5;      // Open circuit after 5 failures
const FAILURE_WINDOW_MS = 60_000;   // In 60 second window
const RECOVERY_TIMEOUT_MS = 30_000; // Try recovery after 30 seconds

/** Circuit Breaker Error class implementation. */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

function getState(key: string): CircuitBreakerState {
  if (!circuitBreakerStates.has(key)) {
    circuitBreakerStates.set(key, {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      successCount: 0,
    });
  }
  return circuitBreakerStates.get(key)!;
}

function updateState(key: string, newState: CircuitBreakerState): void {
  circuitBreakerStates.set(key, newState);
}

/** with Circuit Breaker function. */
export async function withCircuitBreaker<T>(
  key: string,
  fn: () => Promise<T>,
  options: { failureThreshold?: number; recoveryTimeoutMs?: number } = {}
): Promise<T> {
  const threshold = options.failureThreshold ?? FAILURE_THRESHOLD;
  const recoveryTimeout = options.recoveryTimeoutMs ?? RECOVERY_TIMEOUT_MS;

  const state = getState(key);
  const now = Date.now();

  // HALF_OPEN: Attempt recovery if enough time has passed
  if (state.state === 'OPEN' && now - state.lastFailureTime > recoveryTimeout) {
    state.state = 'HALF_OPEN';
    state.successCount = 0;
    updateState(key, state);
  }

  // OPEN or HALF_OPEN: Fast-fail immediately
  if (state.state === 'OPEN') {
    throw new CircuitBreakerError(`Circuit breaker OPEN for ${key}. Service degraded.`);
  }

  try {
    const result = await fn();

    // Success: Reset counters if HALF_OPEN
    if (state.state === 'HALF_OPEN') {
      state.state = 'CLOSED';
      state.failureCount = 0;
      state.successCount = 0;
      updateState(key, state);
    } else if (state.state === 'CLOSED') {
      // Decay failures over time
      if (now - state.lastFailureTime > FAILURE_WINDOW_MS) {
        state.failureCount = 0;
      }
    }

    return result;
  } catch (error) {
    const timeSinceLastFailure = now - state.lastFailureTime;

    // Reset counter if outside failure window
    if (timeSinceLastFailure > FAILURE_WINDOW_MS) {
      state.failureCount = 0;
    }

    state.failureCount++;
    state.lastFailureTime = now;

    // Threshold reached: Open circuit
    if (state.failureCount >= threshold) {
      state.state = 'OPEN';
      console.warn(`Circuit breaker OPENING for ${key} after ${state.failureCount} failures`);
    }

    updateState(key, state);
    throw error;
  }
}

/** get Circuit Breaker Status function. */
export function getCircuitBreakerStatus(key: string): CircuitBreakerState {
  return getState(key);
}

/** reset Circuit Breaker function. */
export function resetCircuitBreaker(key: string): void {
  circuitBreakerStates.set(key, {
    state: 'CLOSED',
    failureCount: 0,
    lastFailureTime: 0,
    successCount: 0,
  });
}
