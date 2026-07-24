// Wrapper around useRealtimeMonitorManagement exposing an enable flag + lastEventAt timestamp.
import { useEffect, useState } from 'react';
import { useRealtimeMonitorManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeMonitor(enabled: boolean = true, tableName: string = 'evolution_messages') {
  // evolution_messages physical root lives in the evo schema (zapp has only a VIEW — no WAL)
  const schema = tableName === 'evolution_messages' ? 'evo' : 'zapp';
  const { data, changes } = useRealtimeMonitorManagement(enabled ? tableName : '', enabled ? schema : 'zapp');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (changes.length > 0) setLastEventAt(Date.now());
  }, [changes.length]);

  return { data, changes, lastEventAt };
}
