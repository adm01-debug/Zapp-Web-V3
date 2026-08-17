import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/features/auth';
import { ThemeSync } from '@/hooks/useTheme';
import { HighContrastProvider } from '@/components/theme/HighContrastToggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { ValidationProvider } from '@/components/providers/ValidationProvider';
import { useState, useRef, useEffect, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import {
  isChunkLoadError,
  triggerChunkReload,
  resetChunkReloadGuard,
} from '@/lib/lazyWithRetry';
import { tanstackRetry } from '@/lib/errors/queryErrors';
import { supabase } from '@/integrations/supabase/client';
import { loadFeatureFlags } from '@/lib/featureFlags';
import { GamificationProvider } from '@/components/gamification/GamificationProvider';

const log = getLogger('AppProviders');

/**
 * Terminal state for chunk recovery: the automatic reload budget is spent and a
 * stale bundle is still in memory. Rendering a plain, dependency-free screen is
 * deliberate — the provider tree that failed to mount is exactly what we cannot
 * rely on here, so this uses no context, no lazy import and no UI-kit component.
 */
function StaleBundleNotice() {
  return (
    <div
      role="alert"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center"
    >
      <h1 className="text-xl font-semibold text-foreground">Nova versao disponivel</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Esta aba esta rodando uma versao antiga do app e nao conseguiu se atualizar
        sozinha. Clique abaixo para recarregar e voltar ao atendimento.
      </p>
      <button
        type="button"
        onClick={() => {
          resetChunkReloadGuard();
          window.location.reload();
        }}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Atualizar agora
      </button>
    </div>
  );
}

/** App Providers component for the providers section. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const [errorKey, setErrorKey] = useState(0);
  const [staleBundle, setStaleBundle] = useState(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const MAX_RETRIES = 3;

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // FIX 2026-07-28: staleTime aumentado de 5min para 10min
            // para reduzir refetches desnecessários. Queries com refetchInterval
            // explícito continuam respeitando seu próprio staleTime.
            staleTime: 1000 * 60 * 10, // 10 minutos (era 5)
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

    // SEGURANCA-14: carrega feature flags no bootstrap (defaults até o load).
    // Recarrega ao autenticar/desautenticar: zapp.feature_flags só é legível
    // pelo role authenticated (anon vê apenas is_public=true).
    let authSub: { subscription: { unsubscribe: () => void } } | null = null;
    void loadFeatureFlags();
    authSub = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        void loadFeatureFlags();
      }
    }).data;

    return () => {
      authSub?.subscription.unsubscribe();
    };
  }, []);

  if (staleBundle) {
    return <StaleBundleNotice />;
  }

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
          // triggerChunkReload() returns false once the per-session reload budget
          // is spent. Ignoring that return value is what let a stale bundle cycle
          // the tab indefinitely with no user-visible signal.
          if (triggerChunkReload()) {
            log.warn('Chunk load error detected - reloading once to recover stale chunks');
          } else {
            log.error(
              'Chunk recovery budget exhausted - stale bundle persists, prompting user to update'
            );
            setStaleBundle(true);
          }
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
            {/* Etapa 66: gamificação REAL montada no boot — alimentada pelos
                eventos zapp:message-sent / zapp:conversation-resolved. */}
            <GamificationProvider>
              <ThemeSync />
              <HighContrastProvider>
                <TooltipProvider delayDuration={100} skipDelayDuration={50}>
                  {children}
                </TooltipProvider>
              </HighContrastProvider>
            </GamificationProvider>
          </AuthProvider>
        </ValidationProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
