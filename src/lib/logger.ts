/* eslint-disable no-console */
// Centralized logging utility with correlation IDs and structured output
// Logs are automatically filtered in production builds
import * as Sentry from '@sentry/react';

const isDev = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Session-level correlation ID for tracing across the app lifetime
const sessionId: string = (() => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
})();

// Per-request tag generator — counter-based, for log output only.
// NOT cryptographically random. For security-grade correlation IDs,
// use generateCorrelationId from @/lib/correlationId instead.
let requestCounter = 0;
/** generate Request Tag function. */
export function generateRequestTag(prefix = 'req'): string {
  return `${prefix}_${++requestCounter}_${Date.now().toString(36)}`;
}

/**
 * @deprecated Renamed to generateRequestTag() to clarify this uses a predictable
 * counter, NOT crypto.randomUUID. For security-grade IDs, import
 * generateCorrelationId from '@/lib/correlationId' instead.
 *
 * This alias is kept for backward compatibility with callers that were already
 * importing from '@/lib/logger'. It will be removed in a future cleanup.
 */
export const generateCorrelationId = generateRequestTag;

/** Returns the session-scoped correlation ID generated at page load. */
export function getSessionId(): string {
  return sessionId;
}

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.module}] [sid:${sessionId.slice(0, 8)}] ${message}`;
  }

  private addToSentryBreadcrumb(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!import.meta.env.PROD) return;
    Sentry.addBreadcrumb({
      category: 'log',
      message: `${this.module}: ${message}`,
      level: level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info',
      data: args.length > 0 ? { args: JSON.stringify(args) } : undefined,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    if (!isDev && (level === 'debug' || level === 'info')) {
      return false;
    }
    return true;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) console.debug(this.formatMessage('debug', message), ...args);
    this.addToSentryBreadcrumb('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) console.info(this.formatMessage('info', message), ...args);
    this.addToSentryBreadcrumb('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) console.warn(this.formatMessage('warn', message), ...args);
    this.addToSentryBreadcrumb('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) console.error(this.formatMessage('error', message), ...args);
    this.addToSentryBreadcrumb('error', message, ...args);
    if (import.meta.env.PROD) {
      Sentry.captureException(new Error(`${this.module}: ${message}`), { extra: { args } });
    }
  }

  /** Log with explicit correlation ID for request tracing */
  withCorrelation(correlationId: string) {
    return {
      debug: (msg: string, ...a: unknown[]) => this.debug(`[cid:${correlationId}] ${msg}`, ...a),
      info: (msg: string, ...a: unknown[]) => this.info(`[cid:${correlationId}] ${msg}`, ...a),
      warn: (msg: string, ...a: unknown[]) => this.warn(`[cid:${correlationId}] ${msg}`, ...a),
      error: (msg: string, ...a: unknown[]) => this.error(`[cid:${correlationId}] ${msg}`, ...a),
    };
  }

}

// Factory function to create module-specific loggers
/** create Logger function. */
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// Default logger for quick usage
/** logger constant. */
export const logger = new Logger('App');

// Shorthand export for convenience
/** log constant. */
export const log = logger;
const loggers: Record<string, Logger> = {};

/** get Logger function. */
export function getLogger(module: string): Logger {
  if (!loggers[module]) {
    loggers[module] = new Logger(module);
  }
  return loggers[module];
}

// Performance logging
/** log Performance function. */
export function logPerformance(label: string, fn: () => void): void {
  if (!isDev) {
    fn();
    return;
  }

  const start = performance.now();
  fn();
  const end = performance.now();
  console.debug(`[PERF] [sid:${sessionId.slice(0, 8)}] ${label}: ${(end - start).toFixed(2)}ms`);
}

// Async performance logging
/** log Async Performance function. */
export async function logAsyncPerformance<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isDev) {
    return fn();
  }

  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  console.debug(`[PERF] [sid:${sessionId.slice(0, 8)}] ${label}: ${(end - start).toFixed(2)}ms`);
  return result;
}
