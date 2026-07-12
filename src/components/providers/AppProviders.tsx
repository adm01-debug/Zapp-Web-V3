import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth';
import { ThemeSync } from '@/hooks/useTheme';
import { HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { AccessibleToastProvider } from '@/components/ui/accessible-toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { ValidationProvider } from '@/components/providers/ValidationProvider';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { isChunkLoadError, triggerChunkReload } from '@/lib/lazyWithRetry';

const log = getLogger('AppProviders');

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [errorKey, setErrorKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const MAX_RETRIES = 3;

  // Memoize QueryClient to prevent recreation on re-renders
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5, // 5 minutes
            gcTime: 1000 * 60 * 60, // 1 hour (formerly cacheTime)
            retry: (failureCount, error) => {
              const e = error as { status?: number; code?: string }; // ignore-audit: React Query types error as unknown; narrowing via cast is the intended pattern
              // Don't retry for 401/403 errors (authentication/authorization)
              if (e?.status === 401 || e?.status === 403 || e?.code === 'PGRST301') return false;
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
        // FIX F1: Reset the auto-retry counter when the ErrorBoundary recovers
        // from a non-chunk error. This ensures subsequent unrelated errors still
        // get their full 3 retry slots instead of inheriting the count from the
        // previous error episode.
        retryCountRef.current = 0;
        log.info('ErrorBoundary recovered — auto-retry counter reset to 0');
      }}
      onError={(error) => {
        log.error('ErrorBoundary caught:', error.message);

        // Chunk load errors (stale hash mismatch after deploy)
        if (isChunkLoadError(error)) {
          log.warn('Chunk load error detected — triggering hard reload to recover stale chunks');
          triggerChunkReload();
          return;
        }

        // Other render errors -> bounded re-render retry
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
              <AccessibleToastProvider>
                <TooltipProvider delayDuration={100} skipDelayDuration={50}>
                  {children}
                </TooltipProvider>
              </AccessibleToastProvider>
            </HighContrastProvider>
          </AuthProvider>
        </ValidationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
