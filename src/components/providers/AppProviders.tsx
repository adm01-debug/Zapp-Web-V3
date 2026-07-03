
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/features/auth";
import { ThemeSync } from "@/hooks/useTheme";
import { HighContrastProvider } from "@/components/theme/HighContrastToggle";
import { AccessibleToastProvider } from "@/components/ui/accessible-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { ValidationProvider } from "@/components/providers/ValidationProvider";
import { useState, useRef, useEffect, useMemo } from "react";
import { getLogger } from "@/lib/logger";
import { isChunkLoadError, triggerChunkReload } from "@/lib/lazyWithRetry";


const log = getLogger('AppProviders');

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [errorKey, setErrorKey] = useState(0);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  // Memoize QueryClient to prevent recreation on re-renders
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 60, // 1 hour (formerly cacheTime)
        retry: (failureCount, error: any) => {
          // Don't retry for 401/403 errors (authentication/authorization)
          if (error?.status === 401 || error?.status === 403 || error?.code === 'PGRST301') return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
        // Critical: Deduplicate requests and use cache effectively
        placeholderData: (previousData) => previousData,
      },
      mutations: {
        retry: 1,
      },
    },
  }), []);

  useEffect(() => {
    log.info('AppProviders mounted');
    setErrorKey(prev => prev + 1);
    retryCountRef.current = 0;
  }, []);

  return (
    <ErrorBoundary
      resetKey={errorKey}
      onError={(error) => {
        log.error('ErrorBoundary caught:', error.message);

        // ── Chunk load errors (stale hash mismatch after deploy) ──────────────
        // Re-rendering via errorKey++ will NEVER fix this — the browser already
        // has a reference to a chunk URL that 404s. The only remedy is a hard
        // page reload so the browser fetches the new index.html and new hashes.
        if (isChunkLoadError(error)) {
          log.warn('Chunk load error detected — triggering hard reload to recover stale chunks');
          triggerChunkReload();
          return; // Skip the re-render retry loop entirely.
        }

        // ── Other render errors → bounded re-render retry ─────────────────────
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current += 1;
          log.warn(`Auto-retry ${retryCountRef.current}/${MAX_RETRIES}`);
          setTimeout(() => setErrorKey(prev => prev + 1), 2000 * retryCountRef.current);
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
