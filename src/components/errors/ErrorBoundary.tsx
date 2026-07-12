import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { log } from '@/lib/logger';
import { recordQueryEvent, type Severity } from '@/lib/clientTelemetry';
import { isChunkLoadError, triggerChunkReload } from '@/lib/lazyWithRetry';

/**
 * Returns true and triggers a hard reload when `error` is a chunk-load failure
 * that falls outside the 30-second cooldown window.
 *
 * Implementation note: this is intentionally a thin wrapper around the two
 * lazyWithRetry helpers so that all cooldown logic lives in a single place:
 *
 *   isChunkLoadError  — classifies the error by message patterns
 *   triggerChunkReload — applies the cooldown guard and calls window.location.reload()
 *
 * Any change to the guard formula, cooldown duration, or clock-skew tolerance
 * only needs to happen in lazyWithRetry.ts; this function picks it up for free.
 */
function detectAndReloadOnChunkError(error: Error): boolean {
  if (!isChunkLoadError(error)) return false;
  return triggerChunkReload();
}

/**
 * Classifies a render failure for telemetry.
 *
 * FIX F5: The previous pattern /rpc|supabase|fetch failed|network/ was too
 * broad. Matching any message containing "supabase" incorrectly classified
 * auth errors ("supabase auth: 401") and storage errors as query failures,
 * polluting the telemetry panel.
 *
 * New strategy:
 *  - \brpc\b    -- word-boundary so we don't catch "corrupted", "deprecated", etc.
 *  - postgrest   -- PostgREST-specific errors from the DB proxy layer
 *  - fetch failed / network request failed / econnrefused -- specific network errors
 *  - supabase + query-keyword  -- e.g. "supabase query timeout", "supabase rpc"
 *
 * Auth errors ("supabase auth: 401"), storage errors ("supabase storage..."),
 * and generic "network" mentions are no longer false positives.
 */
function classifyRenderFailure(error: Error): {
  isQueryFailure: boolean;
  severity: Severity;
  target: string;
} {
  const msg = (error?.message || '').toLowerCase();
  const isTimeout =
    error?.name === 'TimeoutError' ||
    /timeout|timed out|statement timeout|canceling statement|proxy_timeout/.test(msg);
  const isProxy = /external db proxy|external-db-proxy|query timed out|external_proxy/.test(msg);
  const isAbort = error?.name === 'AbortError' || /aborted/.test(msg);
  // Tightened: specific DB/network patterns only.
  const isQueryPattern =
    /\brpc\b|postgrest|fetch failed|network request failed|econnrefused/.test(msg) ||
    /supabase.*(query|timeout|rpc|function|pg_)/.test(msg);
  const isQueryFailure = isTimeout || isProxy || isAbort || isQueryPattern;

  let severity: Severity = 'error';
  if (isTimeout) severity = 'timeout';
  else if (/very slow|>=\s*4000|4000ms/.test(msg)) severity = 'very_slow';
  else if (/slow|>=\s*1500|1500ms/.test(msg)) severity = 'slow';

  return {
    isQueryFailure,
    severity,
    target: isTimeout ? 'render:timeout' : isProxy ? 'externalProxy:render' : 'render:error',
  };
}

function extractCorrelationId(error: Error): string | undefined {
  const m = /\bcid[=:]\s*([0-9a-f]{6,})/i.exec(error?.message || '');
  return m?.[1];
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Called when the boundary transitions from error state back to a clean
   * state (i.e. after a resetKey change clears the error). Use this to reset
   * external counters such as auto-retry counts in AppProviders.
   */
  onReset?: () => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  prevResetKey?: string | number;
  isStackOverflow?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const isStackOverflow = error?.message?.includes('Maximum call stack size exceeded');
    return {
      hasError: true,
      error,
      errorInfo: null,
      isStackOverflow,
    };
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: null, errorInfo: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  /**
   * FIX F1: Notify the parent when the boundary recovers from an error.
   *
   * React calls componentDidUpdate after every render with the previous state,
   * so the transition prevState.hasError=true -> this.state.hasError=false fires
   * exactly once per recovery (when getDerivedStateFromProps clears the error
   * due to a resetKey change OR when handleRetry resets the state manually).
   */
  public componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (prevState.hasError && !this.state.hasError) {
      this.props.onReset?.();
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (detectAndReloadOnChunkError(error)) {
      return;
    }

    log.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });

    try {
      const { isQueryFailure, severity, target } = classifyRenderFailure(error);
      const isStackOverflow = error?.message?.includes('Maximum call stack size exceeded');

      recordQueryEvent({
        operation: 'select',
        source: isQueryFailure ? 'externalProxy' : 'lovableCloud',
        target: isStackOverflow ? 'render:stack_overflow' : target,
        durationMs: 0,
        limit: null,
        offset: null,
        filters: null,
        recordCount: null,
        errorMessage: `[ErrorBoundary] ${error.message}`,
        severity: isStackOverflow ? 'error' : severity,
        startedAt: performance.now(),
        correlationId: extractCorrelationId(error),
      });
    } catch (telemetryError) {
      // Telemetry must never crash the boundary itself.
      log.warn('Failed to record error telemetry:', telemetryError);
    }

    this.props.onError?.(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // FIX F2: When the error is a stale-chunk hash mismatch, the correct
      // action is a hard reload (not a re-render retry). Show a dedicated
      // "Recarregar Pagina" primary button so the user is not confused by
      // "Tentar novamente" which would just re-trigger the same 404 errors.
      const isChunkErr = this.state.error ? isChunkLoadError(this.state.error) : false;
      const isStackOverflow = this.state.isStackOverflow;

      const errorTitle = isChunkErr
        ? 'Atualiza\u00e7\u00e3o dispon\u00edvel'
        : isStackOverflow
          ? 'Erro de recurs\u00e3o infinita'
          : 'Ops! Algo deu errado';

      const errorDescription = isChunkErr
        ? 'A p\u00e1gina foi atualizada no servidor. Recarregue para obter a vers\u00e3o mais recente.'
        : isStackOverflow
          ? 'Detectamos uma recurs\u00e3o infinita. A p\u00e1gina ser\u00e1 recarregada para recuperar.'
          : 'Encontramos um erro inesperado. Tente recarregar a p\u00e1gina.';

      return (
        <div
          className="flex min-h-screen items-center justify-center bg-background p-4"
          role="alert"
          aria-live="assertive"
        >
          <Card className="w-full max-w-lg border-destructive/20 shadow-2xl">
            <CardHeader className="pb-2 text-center">
              <div className="mx-auto mb-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">{errorTitle}</CardTitle>
              <CardDescription className="mt-2 text-muted-foreground">
                {errorDescription}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                  <summary className="flex cursor-pointer items-center gap-2 font-medium text-foreground">
                    <Bug className="h-4 w-4" />
                    Detalhes do erro (desenvolvimento)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="break-all text-xs text-destructive">{this.state.error.message}</p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="max-h-32 overflow-auto rounded bg-background p-2 text-xs text-muted-foreground">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                {isChunkErr || isStackOverflow ? (
                  <Button onClick={this.handleReload} className="flex-1" variant="default">
                    <RotateCw className="mr-2 h-4 w-4" />
                    {isStackOverflow ? 'Recarregar e Recuperar' : 'Recarregar P\u00e1gina'}
                  </Button>
                ) : (
                  <Button onClick={this.handleRetry} className="flex-1" variant="default">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar novamente
                  </Button>
                )}
                {!isStackOverflow && (
                  <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                    <Home className="mr-2 h-4 w-4" />
                    Voltar ao in\u00edcio
                  </Button>
                )}
              </div>

              {!isChunkErr && (
                <button
                  onClick={this.handleReload}
                  className="w-full text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  Ou recarregue a p\u00e1gina completamente
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-foreground">Erro ao carregar componente</h3>
          <p className="truncate text-sm text-muted-foreground">{error.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
