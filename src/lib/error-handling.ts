/**
 * Centralized error handling and reporting
 *
 * Provides consistent error logging, user-friendly messages, and Sentry integration
 * for frontend applications. All errors flow through here for visibility.
 */

import * as Sentry from '@sentry/react';

export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export interface ErrorContext {
  context?: string;
  operation?: string;
  userId?: string;
  severity?: ErrorSeverity;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  shouldReport?: boolean;
}

/**
 * Log error with consistent formatting and optional Sentry reporting
 */
export function logError(
  error: unknown,
  ctx: ErrorContext = {}
): { message: string; originalError: unknown } {
  const {
    context = 'app',
    operation = 'unknown',
    userId,
    severity = 'error',
    tags = {},
    extra = {},
    shouldReport = true,
  } = ctx;

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Console logging
  const logFn = severity === 'fatal' ? console.error : console[severity] || console.log;
  logFn(`[${context}] ${operation}: ${message}`, {
    stack,
    userId,
    tags,
    extra,
  });

  // Sentry reporting (if enabled)
  if (shouldReport) {
    Sentry.captureException(error, {
      level: severity,
      tags: {
        context,
        operation,
        ...tags,
      },
      extra: {
        userId,
        ...extra,
      },
    });
  }

  return { message, originalError: error };
}

/**
 * User-friendly error message (safe to show in UI)
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof Error) {
    // Filter sensitive error details
    const msg = error.message.toLowerCase();
    if (msg.includes('network') || msg.includes('timeout')) {
      return 'Erro de conexão. Verifique sua internet e tente novamente.';
    }
    if (msg.includes('unauthorized') || msg.includes('forbidden')) {
      return 'Você não tem permissão para realizar esta ação.';
    }
    if (msg.includes('not found')) {
      return 'O item solicitado não foi encontrado.';
    }
    if (msg.includes('invalid') || msg.includes('validation')) {
      return 'Os dados fornecidos são inválidos.';
    }
  }

  return 'Ocorreu um erro inesperado. Tente novamente ou contate o suporte.';
}

/**
 * Safely execute async operation with automatic error handling
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  ctx: ErrorContext = {}
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await fn();
    return { data, error: null };
  } catch (err) {
    const { message } = logError(err, ctx);
    return { data: null, error: getUserFriendlyMessage(err) };
  }
}

/**
 * Type-safe wrapper for async callbacks (commonly used in React handlers)
 */
export function withErrorBoundary<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  ctx: Omit<ErrorContext, 'operation'> & { operation: string }
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      logError(err, ctx);
      // Don't throw — let the component decide how to handle (toast, state, etc)
    }
  }) as T;
}

/**
 * Validate Supabase response and log errors
 */
export function validateSupabaseResponse<T>(
  response: { data: T | null; error: unknown | null },
  ctx: ErrorContext = {}
): { data: T | null; hasError: boolean } {
  if (response.error) {
    logError(response.error, {
      ...ctx,
      extra: { ...ctx.extra, supabaseError: true },
    });
    return { data: null, hasError: true };
  }
  return { data: response.data, hasError: false };
}

/**
 * Assert value is not null/undefined, throw with context
 */
export function assertExists<T>(
  value: T | null | undefined,
  message: string,
  ctx?: ErrorContext
): asserts value is T {
  if (!value) {
    const err = new Error(message);
    logError(err, { ...ctx, severity: 'warning' });
    throw err;
  }
}