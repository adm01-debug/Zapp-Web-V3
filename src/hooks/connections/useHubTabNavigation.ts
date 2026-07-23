import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HubTab } from '@/components/connections/types';

/** Re-exported module members. */
export type { HubTab };

/** Hook: use Hub Tab Navigation. */
export function useHubTabNavigation(isDev: boolean) {
  const [searchParams, setSearchParams] = useSearchParams();

  const validateTab = (t: string | null): HubTab => {
    if (t === 'bridge' && !isDev) return 'connections';
    if (t === 'connections' || t === 'integrations' || t === 'bridge') return t;
    return 'connections';
  };

  const [tab, setTab] = useState<HubTab>(() => validateTab(searchParams.get('tab')));

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

  useEffect(() => {
    const t = searchParams.get('tab');
    const validated = validateTab(t);
    if (validated !== tab) {
      setTab(validated);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isDev, tab]);

  const setValidatedTab = (t: string) => setTab(validateTab(t));

  return { tab, setTab, setValidatedTab };
}
