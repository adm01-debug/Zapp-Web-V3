import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabaseConnectivity } from '@/hooks/useSupabaseConnectivity';

interface SupabaseConnectivityBannerProps {
  className?: string;
}

/**
 * Banner global de perda de conectividade com o backend Supabase.
 *
 * Cobre o cenário em que o browser do usuário está online mas o servidor
 * Supabase não responde (VPS fora do ar, rede bloqueada, Kong/proxy down) —
 * o `OfflineIndicator` existente só detecta `navigator.onLine` e ficava mudo
 * nesse caso. Quando o backend volta, exibe um toast "Conexão restaurada".
 *
 * O estado de browser offline (`'offline'`) é deixado para o OfflineIndicator.
 */
export function SupabaseConnectivityBanner({ className }: SupabaseConnectivityBannerProps) {
  const { status, isBackendDown, retryNow } = useSupabaseConnectivity();
  const [checking, setChecking] = useState(false);
  const [restored, setRestored] = useState(false);
  const prevBackendDownRef = useRef(isBackendDown);
  const checkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toast "Conexão restaurada" na transição backend-down → online
  useEffect(() => {
    const wasDown = prevBackendDownRef.current;
    prevBackendDownRef.current = isBackendDown;
    if (wasDown && !isBackendDown) {
      setRestored(true);
      const t = setTimeout(() => setRestored(false), 3500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [isBackendDown]);

  // Limpa timers ao desmontar
  useEffect(() => {
    return () => {
      if (checkingTimerRef.current) clearTimeout(checkingTimerRef.current);
    };
  }, []);

  const handleRetry = useCallback(() => {
    setChecking(true);
    // O monitor re-notifica o hook; quando sair de 'backend-down', o banner some.
    retryNow();
    // Fallback visual: o spinner para após 4s mesmo que o status não mude.
    if (checkingTimerRef.current) clearTimeout(checkingTimerRef.current);
    checkingTimerRef.current = setTimeout(() => setChecking(false), 4000);
  }, [retryNow]);

  if (status === 'offline') return null; // OfflineIndicator cobre browser offline

  return (
    <AnimatePresence>
      {isBackendDown ? (
        <motion.div
          key="backend-down"
          initial={{ opacity: 0, y: -50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          role="alert"
          aria-live="assertive"
          className={cn(
            'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-3 px-4 py-2',
            'bg-warning text-warning-foreground shadow-lg',
            className
          )}
        >
          <WifiOff className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Sem conexão com o servidor</span>
          <span className="hidden text-xs opacity-90 sm:inline">
            Não foi possível acessar o Supabase. Verifique sua internet ou tente novamente.
          </span>
          <button
            type="button"
            onClick={handleRetry}
            disabled={checking}
            className="ml-2 inline-flex items-center gap-1.5 rounded bg-warning-foreground/20 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-warning-foreground/30 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Verificando...' : 'Tentar novamente'}
          </button>
        </motion.div>
      ) : null}

      {restored && !isBackendDown ? (
        <motion.div
          key="restored"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          role="status"
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-success px-4 py-2 text-sm font-medium text-success-foreground shadow-lg"
        >
          <Wifi className="h-4 w-4" />
          Conexão com o servidor restaurada
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
