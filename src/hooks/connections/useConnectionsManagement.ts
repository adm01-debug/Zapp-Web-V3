import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BridgeService } from '@/services/connections/BridgeService';
import type { HubTab, HealthRow, BridgeStatus } from '@/components/connections/types';

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

export interface UseHubTabNavigationParams {
  isDev: boolean;
}

export interface UseHubTabNavigationResult {
  tab: HubTab;
  setTab: (tab: HubTab) => void;
}

export interface UseBridgeHealthParams {
  // no params needed
}

export interface UseBridgeHealthResult {
  status: BridgeStatus;
  health: HealthRow | null;
  checkedAt: Date | null;
  error: string | null;
  runCheck: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════
// Hub Tab Navigation Management (useHubTabNavigation consolidation)
// ═══════════════════════════════════════════════════════════

/** Manages active tab state in the connection hub with URL synchronization. */
export function useHubTabNavigationManagement(
  params: UseHubTabNavigationParams
): UseHubTabNavigationResult {
  const { isDev } = params;
  const [searchParams, setSearchParams] = useSearchParams();

  const validateTab = (t: string | null): HubTab => {
    if (t === 'bridge' && !isDev) return 'connections';
    if (t === 'connections' || t === 'integrations' || t === 'bridge') return t;
    return 'connections';
  };

  const [tab, setTab] = useState<HubTab>(() => validateTab(searchParams.get('tab')));

  // Sincroniza query param ao mudar aba
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      setSearchParams(
        (prev) => {
          prev.set('tab', tab);
          return prev;
        },
        { replace: true }
      );
    }
  }, [tab, searchParams, setSearchParams]);

  // Sincroniza aba se query param mudar externamente (ex: botão voltar)
  useEffect(() => {
    const t = searchParams.get('tab');
    const validated = validateTab(t);
    if (validated !== tab) {
      setTab(validated);
    }
  }, [searchParams, isDev, tab]);

  return { tab, setTab };
}

// ═══════════════════════════════════════════════════════════
// Bridge Health Management (useBridgeHealth consolidation)
// ═══════════════════════════════════════════════════════════

/** Monitors connection bridge health status, running a single check on mount. */
export function useBridgeHealthManagement(
  _params: UseBridgeHealthParams = {}
): UseBridgeHealthResult {
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [health, setHealth] = useState<HealthRow | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true); // ✅ Fix: mounted guard para race condition

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const runCheck = useCallback(async () => {
    setStatus('checking');
    setError(null);

    const result = await BridgeService.checkHealth();

    // ✅ Fix: não atualizar estado se componente desmontado durante await
    if (!mountedRef.current) return;

    setHealth(result.health);
    setError(result.error);
    setStatus(result.status);
    setCheckedAt(new Date());
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return { status, health, checkedAt, error, runCheck };
}
