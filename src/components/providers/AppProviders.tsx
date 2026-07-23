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
import { tanstackRetry } from '@/lib/errors/queryErrors';

const log = getLogger('AppProviders');

/** App Providers component for the providers section. */
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
            // tanstackRetry e a fonte unica da verdade para retry semantico.
            // Erros permanentes (401/403/42501/42P01/permission denied) nunca
            // sao retentados. Erros transientes: max 2 tentativas.
            retry: tanstackRetry,
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
