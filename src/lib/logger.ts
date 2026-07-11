// Centralized logging utility with correlation IDs and structured output
// Logs are automatically filtered in production builds
import * as Sentry from "@sentry/react";

const isDev = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  module?: string;
  correlationId?: string;
  [key: string]: unknown;
}

// Session-level correlation ID for tracing across the app lifetime
const sessionId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Per-request tag generator — counter-based, for log output only.
// NOT cryptographically random. For security-grade correlation IDs,
// use generateCorrelationId from @/lib/correlationId instead.
let requestCounter = 0;
export function generateRequestTag(prefix = 'req'): string {
  return `${prefix}_${++requestCounter}_${Date.now().toString(36)}`;
}

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

  /** Log with explicit request tag for output correlation (NOT for security purposes). */
  withRequestTag(tag: string) {
    const self = this;
    return {
      debug: (msg: string, ...a: unknown[]) => self.debug(`[tag:${tag}] ${msg}`, ...a),
      info: (msg: string, ...a: unknown[]) => self.info(`[tag:${tag}] ${msg}`, ...a),
      warn: (msg: string, ...a: unknown[]) => self.warn(`[tag:${tag}] ${msg}`, ...a),
      error: (msg: string, ...a: unknown[]) => self.error(`[tag:${tag}] ${msg}`, ...a),
    };
  }

  /**
   * @deprecated Use withRequestTag() for log output correlation.
   * For security-grade IDs, import generateCorrelationId from '@/lib/correlationId'.
   */
  withCorrelation(correlationId: string) {
    return this.withRequestTag(correlationId);
  }
}

// Factory function to create module-specific loggers
export function createLogger(module: string): Logger {
  return new Logger(module);
}

// Default logger for quick usage
export const logger = new Logger('App');

// Shorthand export for convenience
export const log = logger;
const loggers: Record<string, Logger> = {};

export function getLogger(module: string): Logger {
  if (!loggers[module]) {
    loggers[module] = new Logger(module);
  }
  return loggers[module];
}

// Performance logging
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
