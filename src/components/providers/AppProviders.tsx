import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth';
import { ThemeSync } from '@/hooks/useTheme';
import { HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { ValidationProvider } from '@/components/providers/ValidationProvider';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { isChunkLoadError, triggerChunkReload } from '@/lib/lazyWithRetry';

const log = getLogger('AppProviders');

/**
 * Classifica se um erro de query eh permanente (nao adianta retry).
 *
 * Coberturas:
 *  - HTTP 401 / 403 em edge functions ou PostgREST (status no erro)
 *  - PGRST301 - GoTrue "JWT expired"
 *  - 42501 - PostgreSQL permission denied (chega via code, nao via status)
 *  - Mensagem textual contendo permission denied / must be owner
 *
 * Sem esta lista, erros de permissao de banco (code='42501') nao tem
 * campo `status` e escapariam do filtro anterior, gerando retries.
 */
function isPermanentQueryError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;

  if (e['status'] === 401 || e['status'] === 403) return true;
  if (e['code'] === 'PGRST301') return true;
  if (e['code'] === '42501') return true;

  const msg = ((e['message'] as string) ?? '').toLowerCase();
  if (msg.includes('permission denied') || msg.includes('must be owner')) return true;
  if (msg.includes('insufficient privilege')) return true;

  return false;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [errorKey, setErrorKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const MAX_RETRIES = 3;

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 60,
            retry: (failureCount, error) => {
              if (isPermanentQueryError(error)) return false;
              return failureCount < 2;
            },
          },
        },
      }),
    []
  );

  useEffect(() => {
    log.info('AppProviders mounted');
    setErrorKey((prev) => prev + 1);
    retryCountRef.current = 0;
  }, []);

  return (
    <ErrorBoundary
      resetKey={errorKey}
      onReset={() => {
        retryCountRef.current = 0;
        log.info('ErrorBoundary recovered - auto-retry counter reset to 0');
      }}
      onError={(error) => {
        log.error('ErrorBoundary caught:', error.message);

        if (isChunkLoadError(error)) {
          log.warn('Chunk load error detected - triggering hard reload to recover stale chunks');
          triggerChunkReload();
          return;
        }

        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          log.warn(`Auto-retry ${retryCountRef.current}/${MAX_RETRIES}`);
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(
            () => setErrorKey((prev) => prev + 1),
            2000 * retryCountRef.current
          );
        } else {
          log.error('Max retries reached. Manual intervention required.');
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ValidationProvider>
          <AuthProvider>
            <ThemeSync />
            <HighContrastProvider>
              <TooltipProvider delayDuration={100} skipDelayDuration={50}>
                {children}
              </TooltipProvider>
            </HighContrastProvider>
          </AuthProvider>
        </ValidationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
