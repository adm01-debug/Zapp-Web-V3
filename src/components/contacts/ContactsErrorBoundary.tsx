/**
 * ContactsErrorBoundary.tsx
 * React Error Boundary for the contacts module.
 * Catches runtime errors in ContactsView and displays a friendly fallback.
 *
 * Usage:
 *   <ContactsErrorBoundary onReset={() => loadContacts()}>
 *     <ContactsView />
 *   </ContactsErrorBoundary>
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw, Bug } from 'lucide-react';

const log = getLogger('ContactsErrorBoundary');

interface Props {
  children:  ReactNode;
  onReset?:  () => void;
  fallback?: ReactNode;
}

interface State {
  hasError:  boolean;
  error:     Error | null;
  errorInfo: ErrorInfo | null;
  errorId:   string;
}

export class ContactsErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError:  false,
      error:     null,
      errorInfo: null,
      errorId:   '',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId:  `err-${Date.now()}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // Log to console in development
    if (import.meta.env.DEV) {
      log.error('Uncaught error in contacts module', { error, componentStack: errorInfo.componentStack });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorId: '' });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-6 h-full gap-4" role="alert">
          <Alert variant="destructive" className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro no módulo de contatos</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p className="text-sm">
                Ocorreu um erro inesperado ao carregar os contatos.
              </p>
              {import.meta.env.DEV && this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer flex items-center gap-1 opacity-70">
                    <Bug className="h-3 w-3" />
                    Detalhes técnicos (dev mode)
                  </summary>
                  <pre className="text-xs mt-1 p-2 bg-destructive/10 rounded overflow-auto max-h-32">
                    {this.state.error.message}
                    {'\n\n'}
                    {this.state.errorInfo?.componentStack?.slice(0, 300)}
                  </pre>
                </details>
              )}
            </AlertDescription>
          </Alert>

          <Button onClick={this.handleReset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>

          <p className="text-xs text-muted-foreground">
            ID: {this.state.errorId}
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ContactsErrorBoundary;
