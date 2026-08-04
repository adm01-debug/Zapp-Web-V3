import { useCallback, useEffect, useState } from 'react';
import {
  getSupabaseConnectivityInfo,
  getSupabaseConnectivityStatus,
  retrySupabaseConnectivityCheck,
  subscribeSupabaseConnectivity,
  type SupabaseConnectivityInfo,
  type SupabaseConnectivityStatus,
} from '@/integrations/supabase/connectivityMonitor';

export interface UseSupabaseConnectivityResult extends SupabaseConnectivityInfo {
  /** 'online' | 'offline' | 'backend-down' */
  status: SupabaseConnectivityStatus;
  /** true quando o backend Supabase está alcançável */
  isOnline: boolean;
  /** true quando o backend está inacessível com browser online */
  isBackendDown: boolean;
  /** Força uma checagem imediata (botão "Tentar novamente"). */
  retryNow: () => void;
}

interface ConnectivityState {
  status: SupabaseConnectivityStatus;
  info: SupabaseConnectivityInfo;
}

/**
 * Hook de status de conectividade com o backend Supabase.
 *
 * Combina o estado do browser (navigator.onLine) com um heartbeat real no
 * health endpoint do Supabase, cobrindo o caso em que a internet do usuário
 * funciona mas o servidor está inacessível. Estado compartilhado via singleton
 * (vários consumidores não multiplicam pings).
 *
 * Uso:
 * ```tsx
 * const { status, isBackendDown, retryNow } = useSupabaseConnectivity();
 * ```
 */
export function useSupabaseConnectivity(): UseSupabaseConnectivityResult {
  const [state, setState] = useState<ConnectivityState>(() => ({
    status: getSupabaseConnectivityStatus(),
    info: getSupabaseConnectivityInfo(),
  }));

  useEffect(() => {
    return subscribeSupabaseConnectivity((status, info) => {
      setState({ status, info });
    });
  }, []);

  const retryNow = useCallback(() => {
    void retrySupabaseConnectivityCheck().catch(() => {});
  }, []);

  return {
    status: state.status,
    lastCheckedAt: state.info.lastCheckedAt,
    latencyMs: state.info.latencyMs,
    isOnline: state.status === 'online',
    isBackendDown: state.status === 'backend-down',
    retryNow,
  };
}
