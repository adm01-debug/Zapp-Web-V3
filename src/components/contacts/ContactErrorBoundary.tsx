/**
 * ContactErrorBoundary.tsx
 * Error boundary for the entire Contacts Module.
 * Catches React rendering errors and shows a friendly recovery UI.
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getLogger } from '@/lib/logger';
const log = getLogger('ContactErrorBoundary');

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  children:    ReactNode;
  fallback?:   ReactNode;
  onReset?:    () => void;
}

interface State {
  hasError: boolean;
  error:    Error | null;
  errorId:  string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export class ContactErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: null };
  }

  static getDerivedStateFromError(error: Error): State {
    const errorId = `err_${Date.now().toString(36)}`;
    return { hasError: true, error, errorId };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('Uncaught error in contacts module', { error, componentStack: info.componentStack });

    // In production, you'd send this to your error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-8">
          <div className="max-w-md w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Algo deu errado</h2>
                <p className="text-sm text-muted-foreground">
                  Ocorreu um erro no módulo de contatos.
                </p>
              </div>
            </div>

            {/* Error details (dev mode) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <Alert variant="destructive" className="text-xs">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro de desenvolvimento</AlertTitle>
                <AlertDescription className=" break-all">
                  {this.state.error.message}
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <AlertDescription className="text-sm">
                Você pode tentar recarregar o módulo. Se o problema persistir,
                entre em contato com o suporte.
                {this.state.errorId && (
                  <span className="block mt-1 text-xs text-muted-foreground">
                    Código: {this.state.errorId}
                  </span>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="gap-2 flex-1">
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
                className="gap-2 flex-1"
              >
                <Home className="h-4 w-4" />
                Ir para início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// ── HOC wrapper ────────────────────────────────────────────────────────────

/**
 * Wrap any contacts component with an error boundary.
 * Usage: const SafeContactsView = withContactErrorBoundary(ContactsViewV3);
 */
export function withContactErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  onReset?: () => void
): React.FC<T> {
  return function WrappedWithErrorBoundary(props: T) {
    return (
      <ContactErrorBoundary onReset={onReset}>
        <Component {...props} />
      </ContactErrorBoundary>
    );
  };
}

export default ContactErrorBoundary;
