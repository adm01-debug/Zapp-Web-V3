import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HubTab } from '@/components/connections/types';

export type { HubTab };

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
  }, [searchParams, isDev, tab]);

  return { tab, setTab };
}
