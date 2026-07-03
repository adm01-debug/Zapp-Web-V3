import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { log } from '@/lib/logger';
import { recordQueryEvent, type Severity } from '@/lib/clientTelemetry';
import { CHUNK_RELOAD_SESSION_KEY } from '@/lib/lazyWithRetry';

// ─────────────────────────────────────────────────────────────────────────────
// Chunk load error detection (inline to avoid any import chain that might
// itself fail if the module system is broken)
// ─────────────────────────────────────────────────────────────────────────────
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

function detectAndReloadOnChunkError(error: Error): boolean {
  const msg = (error?.message ?? '').toLowerCase();
  const isChunkError =
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('unable to preload css for');

  if (!isChunkError) return false;

  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) ?? '0');
    if (Date.now() - last > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now()));
      window.location.reload();
      return true;
    }
  } catch {
    window.location.reload();
    return true;
  }
  return false; // cooldown active — fall through to error UI
}

/**
 * Detects whether a thrown error originated from a slow/failing external
 * query (proxy timeout, statement timeout, abort, etc.) so we can emit a
 * telemetry event from the boundary instead of just logging it.
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
  const isQueryFailure = isTimeout || isProxy || isAbort || /rpc|supabase|fetch failed|network/.test(msg);

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

// Try to recover the correlationId an external call may have embedded
// in the thrown error message (e.g. "[cid=ab12cd34] ...").
function extractCorrelationId(error: Error): string | undefined {
  const m = /\bcid[=:]\s*([0-9a-f]{6,})/i.exec(error?.message || '');
  return m?.[1];
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKey?: string | number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  prevResetKey?: string | number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error, errorInfo: null };
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== undefined && props.resetKey !== state.prevResetKey) {
      return { hasError: false, error: null, errorInfo: null, prevResetKey: props.resetKey };
    }
    return null;
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // ── Safety net: auto-reload on stale chunk hash mismatch ─────────────────
    // This runs even if lazyWithRetry's own handler somehow missed it (e.g.
    // error propagated from a non-lazy-wrapped import).
    if (detectAndReloadOnChunkError(error)) {
      // Reload triggered — don't bother with state update or telemetry
      // since the page is about to be refreshed.
      return;
    }

    log.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });

    // Always emit a telemetry event so the panel surfaces UI render
    // failures alongside slow/timed-out external queries. This keeps the
    // "why did the screen blank?" answer in one place.
    try {
      const { isQueryFailure, severity, target } = classifyRenderFailure(error);
      recordQueryEvent({
        operation: 'select',
        source: isQueryFailure ? 'externalProxy' : 'lovableCloud',
        target,
        durationMs: 0,
        limit: null,
        offset: null,
        filters: null,
        recordCount: null,
        errorMessage: `[ErrorBoundary] ${error.message}`,
        severity,
        startedAt: performance.now(),
        correlationId: extractCorrelationId(error),
      });
    } catch {
      // Telemetry must never crash the boundary itself.
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

      // IMPORTANT: No framer-motion here! If framer-motion caused the error,
      // using it in the fallback would create an infinite crash loop.
      return (
        <div 
          className="min-h-screen flex items-center justify-center bg-background p-4"
          role="alert"
          aria-live="assertive"
        >
          <Card className="max-w-lg w-full shadow-2xl border-destructive/20">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-10 h-10 text-destructive" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Ops! Algo deu errado
              </CardTitle>
              <CardDescription className="text-muted-foreground mt-2">
                Encontramos um erro inesperado. Tente recarregar a página.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-sm bg-muted/50 rounded-lg p-3 border border-border">
                  <summary className="cursor-pointer font-medium text-foreground flex items-center gap-2">
                    <Bug className="w-4 h-4" />
                    Detalhes do erro (desenvolvimento)
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="text-destructive  text-xs break-all">
                      {this.state.error.message}
                    </p>
                    {this.state.errorInfo?.componentStack && (
                      <pre className="text-xs text-muted-foreground overflow-auto max-h-32 bg-background p-2 rounded">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={this.handleRetry}
                  className="flex-1"
                  variant="default"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Tentar novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Voltar ao início
                </Button>
              </div>

              <button
                onClick={this.handleReload}
                className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Ou recarregue a página completamente
              </button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC para envolver componentes com Error Boundary
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

// Hook-like component for functional error boundaries
export function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-lg">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-foreground">Erro ao carregar componente</h3>
          <p className="text-sm text-muted-foreground truncate">{error.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={resetErrorBoundary}>
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
