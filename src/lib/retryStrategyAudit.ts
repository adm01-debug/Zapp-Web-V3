import { getLogger } from '@/lib/logger';
import { logStructuredError } from '@/lib/structuredErrorLogging';

const log = getLogger('retryStrategyAudit');

/**
 * Retry Strategy Audit (MELHORIA #12)
 *
 * Comprehensive audit and enforcement of retry strategies across the application.
 * Prevents retry storms, ensures exponential backoff, and tracks retry effectiveness.
 *
 * Features:
 * - Standardized retry configuration with sensible defaults
 * - Circuit breaker pattern to prevent cascading failures
 * - Retry budget tracking to prevent exhaustion
 * - Per-operation retry metrics and monitoring
 * - Exponential backoff with jitter to prevent thundering herd
 * - Deadline enforcement for long-running retry loops
 * - Adaptive retry strategies based on error types
 */

/** Retryable Error Type enum. */
export enum RetryableErrorType {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  TEMPORARY_FAILURE = 'temporary_failure',
  UNAVAILABLE = 'unavailable',
  NOT_RETRYABLE = 'not_retryable',
}

/** Retry Config interface definition. */
export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
  timeoutMs?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

/** Retry Metrics interface definition. */
export interface RetryMetrics {
  operationName: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  circuitBreakerTrips: number;
  averageDelayMs: number;
  totalDurationMs: number;
  lastAttemptTime: number;
  successRate: number;
}

/** Retry Policy Context interface definition. */
export interface RetryPolicyContext {
  error: Error;
  attemptNumber: number;
  totalAttempts: number;
  elapsedTimeMs: number;
  timeoutMs?: number;
}

/** Retry Policy type alias. */
export type RetryPolicy = (context: RetryPolicyContext) => boolean;

/**
 * Standard retry configuration preset for transient network errors
 */
export const RETRY_CONFIG_TRANSIENT: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.2,
};

/**
 * Standard retry configuration for API errors with rate limiting
 */
export const RETRY_CONFIG_API: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  circuitBreakerThreshold: 10,
  circuitBreakerResetMs: 60000,
};

/**
 * Standard retry configuration for database operations
 */
export const RETRY_CONFIG_DATABASE: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitterFactor: 0.15,
};

/**
 * Standard retry configuration for long-running async operations
 */
export const RETRY_CONFIG_ASYNC: RetryConfig = {
  maxAttempts: 10,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 1.5,
  jitterFactor: 0.25,
  timeoutMs: 300000,
};

/**
 * Classify error type for determining retry strategy
 */
export function classifyError(error: Error | unknown): RetryableErrorType {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code = (error as { code?: string })?.code?.toUpperCase() || '';

  // Network errors
  if (
    msg.includes('network') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET'
  ) {
    return RetryableErrorType.NETWORK;
  }

  // Timeout errors
  if (
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    code === 'ETIMEDOUT' ||
    code === 'TIMEOUT'
  ) {
    return RetryableErrorType.TIMEOUT;
  }

  // Rate limit errors
  if (msg.includes('rate limit') || msg.includes('429') || code === 'RATE_LIMIT') {
    return RetryableErrorType.RATE_LIMIT;
  }

  // Service unavailable
  if (msg.includes('unavailable') || msg.includes('503') || msg.includes('service')) {
    return RetryableErrorType.UNAVAILABLE;
  }

  // Temporary failures
  if (msg.includes('temporary') || msg.includes('transient')) {
    return RetryableErrorType.TEMPORARY_FAILURE;
  }

  // Non-retryable errors
  return RetryableErrorType.NOT_RETRYABLE;
}

/**
 * Determine if error should be retried
 */
export function isRetryable(error: Error | unknown): boolean {
  const errorType = classifyError(error);
  return errorType !== RetryableErrorType.NOT_RETRYABLE;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateRetryDelay(config: RetryConfig, attemptNumber: number): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attemptNumber);
  const clamped = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter to prevent thundering herd
  const jitterAmount = clamped * config.jitterFactor;
  const jitter = Math.random() * jitterAmount * 2 - jitterAmount;

  return Math.max(0, clamped + jitter);
}

/**
 * Circuit breaker to prevent cascading failures
 */
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half_open' = 'closed';

  constructor(
    private threshold: number,
    private resetTimeMs: number
  ) {}

  canExecute(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.resetTimeMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }

    // half_open state
    return true;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      log.warn(`Circuit breaker opened after ${this.failureCount} failures`, {
        threshold: this.threshold,
      });
    }
  }

  getState(): string {
    return this.state;
  }
}

/**
 * Retry strategy executor with comprehensive tracking
 */
export class RetryExecutor {
  private metricsMap = new Map<string, RetryMetrics>();
  private circuitBreakerMap = new Map<string, CircuitBreaker>();
  private retryBudgetRemainingMs: number;

  constructor(
    private config: RetryConfig,
    private operationName: string,
    retryBudgetMs: number = 300000 // 5 minutes default
  ) {
    this.retryBudgetRemainingMs = retryBudgetMs;

    const metrics: RetryMetrics = {
      operationName,
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      circuitBreakerTrips: 0,
      averageDelayMs: 0,
      totalDurationMs: 0,
      lastAttemptTime: Date.now(),
      successRate: 0,
    };
    this.metricsMap.set(operationName, metrics);

    if (config.circuitBreakerThreshold) {
      this.circuitBreakerMap.set(
        operationName,
        new CircuitBreaker(config.circuitBreakerThreshold, config.circuitBreakerResetMs || 60000)
      );
    }
  }

  async execute<T>(fn: () => Promise<T>, shouldRetry?: RetryPolicy): Promise<T> {
    const startTime = Date.now();
    const circuitBreaker = this.circuitBreakerMap.get(this.operationName);
    const metrics = this.metricsMap.get(this.operationName)!;

    if (circuitBreaker && !circuitBreaker.canExecute()) {
      metrics.circuitBreakerTrips++;
      throw new Error(
        `Circuit breaker open for ${this.operationName} (state: ${circuitBreaker.getState()})`
      );
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      metrics.totalAttempts++;

      // Check retry budget
      if (Date.now() - startTime > this.retryBudgetRemainingMs) {
        throw new Error(
          `Retry budget exhausted for ${this.operationName} after ${metrics.totalAttempts} attempts`
        );
      }

      // Check timeout
      if (this.config.timeoutMs && Date.now() - startTime > this.config.timeoutMs) {
        throw new Error(
          `Timeout exceeded for ${this.operationName} after ${metrics.totalAttempts} attempts`
        );
      }

      try {
        const result = await fn();
        metrics.successCount++;
        circuitBreaker?.recordSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        metrics.failureCount++;
        metrics.lastAttemptTime = Date.now();

        const isLastAttempt = attempt === this.config.maxAttempts - 1;
        const shouldRetryError =
          !shouldRetry ||
          shouldRetry({
            error: lastError,
            attemptNumber: attempt,
            totalAttempts: this.config.maxAttempts,
            elapsedTimeMs: Date.now() - startTime,
            timeoutMs: this.config.timeoutMs,
          });

        if (isLastAttempt || !shouldRetryError || !isRetryable(lastError)) {
          circuitBreaker?.recordFailure();
          throw lastError;
        }

        const delay = calculateRetryDelay(this.config, attempt);
        metrics.averageDelayMs = (metrics.averageDelayMs * attempt + delay) / (attempt + 1);

        log.debug(
          `Retrying ${this.operationName} (attempt ${attempt + 1}/${this.config.maxAttempts}) after ${delay}ms`,
          {
            error: lastError.message,
          }
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    metrics.totalDurationMs = Date.now() - startTime;
    metrics.successRate =
      metrics.totalAttempts > 0 ? metrics.successCount / metrics.totalAttempts : 0;

    circuitBreaker?.recordFailure();

    logStructuredError(lastError || new Error('Unknown retry failure'), {
      url: typeof window !== 'undefined' ? window.location.href : undefined,
    });

    throw lastError || new Error(`Failed to execute ${this.operationName}`);
  }

  getMetrics(): RetryMetrics | undefined {
    return this.metricsMap.get(this.operationName);
  }

  getAllMetrics(): RetryMetrics[] {
    return Array.from(this.metricsMap.values());
  }
}

/**
 * Global retry metrics tracker
 */
class RetryMetricsTracker {
  private executors = new Map<string, RetryExecutor>();

  registerExecutor(operationName: string, executor: RetryExecutor): void {
    this.executors.set(operationName, executor);
  }

  getMetrics(operationName: string): RetryMetrics | undefined {
    return this.executors.get(operationName)?.getMetrics();
  }

  getAllMetrics(): Map<string, RetryMetrics> {
    const metrics = new Map<string, RetryMetrics>();
    this.executors.forEach((executor, name) => {
      const m = executor.getMetrics();
      if (m) metrics.set(name, m);
    });
    return metrics;
  }

  getHealthStatus(): { healthy: string[]; degraded: string[] } {
    const healthy: string[] = [];
    const degraded: string[] = [];

    this.executors.forEach((executor, name) => {
      const metrics = executor.getMetrics();
      if (metrics && metrics.successRate < 0.5) {
        degraded.push(name);
      } else {
        healthy.push(name);
      }
    });

    return { healthy, degraded };
  }
}

/** retry Metrics Tracker constant. */
export const retryMetricsTracker = new RetryMetricsTracker();

/** Default export. */
export default {
  classifyError,
  isRetryable,
  calculateRetryDelay,
  RetryExecutor,
  CircuitBreaker,
  retryMetricsTracker,
  RETRY_CONFIG_TRANSIENT,
  RETRY_CONFIG_API,
  RETRY_CONFIG_DATABASE,
  RETRY_CONFIG_ASYNC,
};
