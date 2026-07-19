import { getLogger } from '@/lib/logger';
import * as Sentry from '@sentry/react';

const log = getLogger('structuredErrorLogging');

/**
 * Structured Error Logging (MELHORIA #10)
 *
 * Provides comprehensive error logging with categorization, context tracking,
 * correlation IDs, and pattern detection for production debugging.
 *
 * Features:
 * - Error categorization (network, auth, validation, database, etc.)
 * - Request context preservation (URL, method, headers)
 * - Error rate tracking with time windows
 * - Stack trace extraction and normalization
 * - Correlation ID propagation
 * - Error pattern detection and alerting
 * - Structured fields for log aggregation
 */

/** Error Category enum. */
export enum ErrorCategory {
  NETWORK = 'network',
  AUTH = 'auth',
  VALIDATION = 'validation',
  DATABASE = 'database',
  PARSING = 'parsing',
  TIMEOUT = 'timeout',
  UNAUTHORIZED = 'unauthorized',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMITED = 'rate_limited',
  INTERNAL = 'internal',
  UNKNOWN = 'unknown',
}

/** Error Severity enumeration. */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/** Error Context interface definition. */
export interface ErrorContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  method?: string;
  statusCode?: number;
  requestBody?: unknown;
  responseBody?: unknown;
  headers?: Record<string, string>;
  userAgent?: string;
  timestamp: number;
}

/** Structured Error interface definition. */
export interface StructuredError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  stack?: string;
  context: ErrorContext;
  originalError: Error | null;
  isDuplicate: boolean;
}

interface ErrorRateEntry {
  timestamp: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
}

class StructuredErrorLogger {
  private errorRateWindow = 60000; // 1 minute
  private errorRateHistory: ErrorRateEntry[] = [];
  private errorPatterns: Map<string, { count: number; lastSeen: number }> = new Map();
  private errorPatternThreshold = 5; // Alert after 5 occurrences
  private maxHistorySize = 1000;

  /**
   * Categorize error based on message, code, and context.
   */
  categorizeError(error: Error | unknown, statusCode?: number): ErrorCategory {
    const msg = this.getErrorMessage(error).toLowerCase();

    // HTTP status code hints
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      msg.includes('unauthorized') ||
      msg.includes('permission')
    ) {
      return ErrorCategory.AUTH;
    }
    if (statusCode === 404 || msg.includes('not found') || msg.includes('not exist')) {
      return ErrorCategory.NOT_FOUND;
    }
    if (statusCode === 409 || msg.includes('conflict')) {
      return ErrorCategory.CONFLICT;
    }
    if (statusCode === 429 || msg.includes('rate limit')) {
      return ErrorCategory.RATE_LIMITED;
    }
    if (statusCode && statusCode >= 500) {
      return ErrorCategory.INTERNAL;
    }

    // Message patterns
    if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }
    if (msg.includes('json') || msg.includes('parse') || msg.includes('syntax')) {
      return ErrorCategory.PARSING;
    }
    if (msg.includes('validation') || msg.includes('invalid') || msg.includes('required')) {
      return ErrorCategory.VALIDATION;
    }
    if (msg.includes('database') || msg.includes('query') || msg.includes('transaction')) {
      return ErrorCategory.DATABASE;
    }
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return ErrorCategory.TIMEOUT;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity based on category and context.
   */
  determineSeverity(
    category: ErrorCategory,
    statusCode?: number,
    isDuplicate?: boolean
  ): ErrorSeverity {
    // Duplicates are always low severity
    if (isDuplicate) return ErrorSeverity.LOW;

    // Category-based severity
    switch (category) {
      case ErrorCategory.INTERNAL:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.NETWORK:
        return ErrorSeverity.CRITICAL;
      case ErrorCategory.AUTH:
      case ErrorCategory.RATE_LIMITED:
        return ErrorSeverity.HIGH;
      case ErrorCategory.NOT_FOUND:
      case ErrorCategory.CONFLICT:
        return ErrorSeverity.MEDIUM;
      case ErrorCategory.VALIDATION:
      case ErrorCategory.PARSING:
        return ErrorSeverity.LOW;
      default:
        return statusCode && statusCode >= 500 ? ErrorSeverity.CRITICAL : ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Extract error message safely.
   */
  private getErrorMessage(error: Error | unknown): string {
    if (!error) return 'Unknown error';
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }
    return String(error);
  }

  /**
   * Extract stack trace from error.
   */
  private getStackTrace(error: Error | unknown): string | undefined {
    if (error instanceof Error && error.stack) {
      return this.normalizeStackTrace(error.stack);
    }
    return undefined;
  }

  /**
   * Normalize stack trace for pattern matching and storage.
   */
  private normalizeStackTrace(stack: string): string {
    return stack
      .split('\n')
      .slice(0, 10) // Limit to first 10 frames
      .map((line) => line.trim())
      .join('\n');
  }

  /**
   * Check if error is a duplicate within pattern detection.
   */
  private isDuplicateError(key: string): boolean {
    const pattern = this.errorPatterns.get(key);
    if (!pattern) return false;

    const age = Date.now() - pattern.lastSeen;
    return age < this.errorRateWindow; // Duplicate if seen within window
  }

  /**
   * Record error pattern and check for alerts.
   */
  private recordErrorPattern(key: string): void {
    const pattern = this.errorPatterns.get(key);
    if (!pattern) {
      this.errorPatterns.set(key, { count: 1, lastSeen: Date.now() });
      return;
    }

    pattern.count++;
    pattern.lastSeen = Date.now();

    if (pattern.count === this.errorPatternThreshold) {
      log.warn(
        `Error pattern detected: ${key} (${pattern.count} occurrences in ${this.errorRateWindow}ms)`
      );
    }
  }

  /**
   * Update error rate tracking.
   */
  private recordErrorRate(category: ErrorCategory, severity: ErrorSeverity): void {
    const now = Date.now();
    this.errorRateHistory.push({ timestamp: now, category, severity });

    // Cleanup old entries
    this.errorRateHistory = this.errorRateHistory.filter(
      (e) => now - e.timestamp < this.errorRateWindow
    );

    if (this.errorRateHistory.length > this.maxHistorySize) {
      this.errorRateHistory = this.errorRateHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Log structured error with full context.
   */
  logError(
    error: Error | unknown,
    options?: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      correlationId?: string;
      userId?: string;
      sessionId?: string;
      url?: string;
      method?: string;
      statusCode?: number;
      requestBody?: unknown;
      responseBody?: unknown;
      headers?: Record<string, string>;
    }
  ): StructuredError {
    const correlationId = options?.correlationId || this.generateCorrelationId();
    const category = options?.category || this.categorizeError(error, options?.statusCode);
    const severity = options?.severity || this.determineSeverity(category, options?.statusCode);
    const message = this.getErrorMessage(error);
    const stack = this.getStackTrace(error);
    const errorKey = `${category}:${message.slice(0, 50)}`;
    const isDuplicate = this.isDuplicateError(errorKey);

    this.recordErrorPattern(errorKey);
    this.recordErrorRate(category, severity);

    const structuredError: StructuredError = {
      id: `err_${correlationId}`,
      category,
      severity,
      code: this.extractErrorCode(error),
      message,
      stack,
      context: {
        correlationId,
        userId: options?.userId,
        sessionId: options?.sessionId,
        url: options?.url || (typeof window !== 'undefined' ? window.location.href : undefined),
        method: options?.method,
        statusCode: options?.statusCode,
        requestBody: this.sanitize(options?.requestBody),
        responseBody: this.sanitize(options?.responseBody),
        headers: this.sanitizeHeaders(options?.headers),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        timestamp: Date.now(),
      },
      originalError: error instanceof Error ? error : null,
      isDuplicate,
    };

    // Log based on severity
    const logMsg = `[${structuredError.id}] ${message}`;
    const logContext = {
      category,
      severity,
      isDuplicate,
      ...structuredError.context,
    };

    switch (severity) {
      case ErrorSeverity.CRITICAL:
        log.error(logMsg, logContext);
        break;
      case ErrorSeverity.HIGH:
        log.error(logMsg, logContext);
        break;
      case ErrorSeverity.MEDIUM:
        log.warn(logMsg, logContext);
        break;
      default:
        log.debug(logMsg, logContext);
    }

    // Report to Sentry for critical errors
    if (severity === ErrorSeverity.CRITICAL && !isDuplicate && import.meta.env.PROD) {
      Sentry.captureException(error instanceof Error ? error : new Error(message), {
        extra: structuredError.context as unknown as Record<string, unknown>,
        tags: { category, severity } as unknown as Record<string, string>,
      });
    }

    return structuredError;
  }

  /**
   * Extract error code from various error types.
   */
  private extractErrorCode(error: Error | unknown): string {
    if (!error) return 'UNKNOWN';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      // Common error code patterns
      const match = msg.match(/(?:code|errno|code:)\s*([A-Z0-9_]+)/i);
      if (match) return match[1];
      if (msg.includes('econnrefused')) return 'ECONNREFUSED';
      if (msg.includes('etimedout')) return 'ETIMEDOUT';
      if (msg.includes('enotfound')) return 'ENOTFOUND';
    }
    return 'UNKNOWN';
  }

  /**
   * Sanitize sensitive data from context.
   */
  private sanitize(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data)) return data.map((item) => this.sanitize(item));

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret')
      ) {
        sanitized[key] = '***MASKED***';
      } else if (lowerKey.includes('email') && typeof value === 'string') {
        sanitized[key] = this.maskEmail(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Sanitize headers, removing auth tokens.
   */
  private sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return undefined;
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('authorization') ||
        lowerKey.includes('token') ||
        lowerKey.includes('cookie')
      ) {
        sanitized[key] = '***MASKED***';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /**
   * Mask email for privacy.
   */
  private maskEmail(email: string): string {
    if (!email.includes('@')) return email;
    const [local, domain] = email.split('@');
    if (local.length <= 2) return `***@${domain}`;
    return `${local.substring(0, 2)}***@${domain}`;
  }

  /**
   * Generate correlation ID for error tracking.
   */
  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get error rate statistics.
   */
  getErrorRateStats() {
    const now = Date.now();
    const recentErrors = this.errorRateHistory.filter(
      (e) => now - e.timestamp < this.errorRateWindow
    );

    const bySeverity = {
      critical: recentErrors.filter((e) => e.severity === ErrorSeverity.CRITICAL).length,
      high: recentErrors.filter((e) => e.severity === ErrorSeverity.HIGH).length,
      medium: recentErrors.filter((e) => e.severity === ErrorSeverity.MEDIUM).length,
      low: recentErrors.filter((e) => e.severity === ErrorSeverity.LOW).length,
    };

    const byCategory: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
    for (const category of Object.values(ErrorCategory)) {
      byCategory[category as ErrorCategory] = recentErrors.filter(
        (e) => e.category === category
      ).length;
    }

    return {
      totalInWindow: recentErrors.length,
      bySeverity,
      byCategory,
      topPatterns: Array.from(this.errorPatterns.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([key, { count }]) => ({ key, count })),
    };
  }

  /**
   * Clear error history (for testing or maintenance).
   */
  clearHistory(): void {
    this.errorRateHistory = [];
    this.errorPatterns.clear();
  }
}

// Singleton instance
const structuredErrorLogger = new StructuredErrorLogger();

/** log Structured Error function. */
export function logStructuredError(
  error: Error | unknown,
  options?: Parameters<typeof structuredErrorLogger.logError>[1]
): StructuredError {
  return structuredErrorLogger.logError(error, options);
}

/** get Error Rate Stats function. */
export function getErrorRateStats() {
  return structuredErrorLogger.getErrorRateStats();
}

/** clear Error History function. */
export function clearErrorHistory() {
  structuredErrorLogger.clearHistory();
}

/** Default export. */
export default structuredErrorLogger;