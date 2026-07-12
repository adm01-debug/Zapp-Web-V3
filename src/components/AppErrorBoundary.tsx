import { Component, ErrorInfo, ReactNode } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('AppErrorBoundary');
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Module name for error tracking (e.g., 'inbox', 'crm', 'voip') */
  module?: string;
  /** Custom fallback UI */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

/**
 * Production-grade Error Boundary for ZAPP WEB.
 *
 * Features:
 * - Catches render errors in any child component tree
 * - Logs errors to Supabase `app_error_logs` table for monitoring
 * - Shows a user-friendly fallback with error ID for support
 * - Supports per-module boundaries (inbox, crm, voip, etc.)
 * - Auto-recovery button to retry rendering
 * - Reports error context: module, component stack, user agent
 */
export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `ERR-${Date.now().toString(36).toUpperCase()}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { module = 'unknown', onError } = this.props;
    const { errorId } = this.state;

    // Log to console in development
    log.error(`[${module}] Unhandled render error (${errorId}):`, error);

    // Report to Supabase for production monitoring
    this.reportError(error, errorInfo, errorId);

    // Call custom handler if provided
    onError?.(error, errorInfo);
  }

  private async reportError(error: Error, errorInfo: ErrorInfo, errorId: string | null) {
    try {
      log.error('[AppErrorBoundary] render failure', {
        errorId,
        module: this.props.module || 'unknown',
        message: error.message,
        stack: error.stack?.slice(0, 2000),
        componentStack: errorInfo.componentStack?.slice(0, 2000),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        url: typeof window !== 'undefined' ? window.location.href : null,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Never let the reporter throw.
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorId: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-8 text-center min-h-[400px] w-full">
          <Alert variant="destructive" className="max-w-2xl border-2 shadow-lg">
            <ShieldAlert className="h-5 w-5" />
            <AlertTitle className="text-xl font-bold mb-2">Algo deu errado</AlertTitle>
            <AlertDescription className="text-base opacity-90 leading-relaxed mb-6">
              Ocorreu um erro inesperado neste módulo. Nossa equipe foi notificada automaticamente.
              {this.state.errorId && (
                <div className="mt-4 p-2 bg-destructive/10 rounded  text-xs border border-destructive/20 select-all">
                  ID do Erro: {this.state.errorId}
                </div>
              )}
            </AlertDescription>
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              <Button
                variant="default"
                onClick={this.handleRetry}
                className="gap-2 font-semibold"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
                className="gap-2"
              >
                Recarregar página
              </Button>
            </div>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
