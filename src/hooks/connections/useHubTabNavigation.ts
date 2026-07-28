import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HubTab } from '@/components/connections/types';

/** Re-exported module members. */
export type { HubTab };

/**
 * FIX 2026-07-28: Loop bidirecional corrigido.
 * ANTES: useEffect1 (URL→tab) e useEffect2 (tab→URL) criavam loop infinito
 * porque setTab disparava setSearchParams que disparava setTab...
 * DEPOIS: flag isInternalUpdate evita re-disparo desnecessário.
 */

/** Hook: use Hub Tab Navigation. */
export function useHubTabNavigation(isDev: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const validateTab = useCallback(
    (t: string | null): HubTab => {
      if (t === 'bridge' && !isDev) return 'connections';
      if (t === 'connections' || t === 'integrations' || t === 'bridge') return t;
      return 'connections';
    },
    [isDev]
  );

  const [tab, setTab] = useState<HubTab>(() => validateTab(searchParams.get('tab')));

  // Flag para evitar loop infinito entre URL e estado
  const isInternalUpdate = useRef(false);

  // Sincroniza query param quando tab muda (usuário clica em aba)
  useEffect(() => {
    const current = searchParams.get('tab');
    if (current !== tab) {
      isInternalUpdate.current = true;
      setSearchParams(
        (prev) => {
          prev.set('tab', tab);
          return prev;
        },
        { replace: true }
      );
    }
  }, [tab, searchParams, setSearchParams]);

  // Sincroniza tab quando URL muda (ex: botão voltar do browser)
  // Só atualiza se NÃO foi uma atualização interna (evita loop)
  useEffect(() => {
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const t = searchParams.get('tab');
    const validated = validateTab(t);
    if (validated !== tab) {
      setTab(validated);
    }
  }, [searchParams, isDev, tab, validateTab]);

  const setValidatedTab = (t: string) => setTab(validateTab(t));

  return { tab, setTab, setValidatedTab };
}
