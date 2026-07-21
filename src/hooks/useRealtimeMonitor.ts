// Wrapper around useRealtimeMonitorManagement exposing an enable flag + lastEventAt timestamp.
import { useEffect, useState } from 'react';
import { useRealtimeMonitorManagement } from '@/hooks/useRealtimeManagement';

export function useRealtimeMonitor(enabled: boolean = true, tableName: string = 'evolution_messages') {
  const { data, changes } = useRealtimeMonitorManagement(enabled ? tableName : '');
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);

  useEffect(() => {
    if (changes.length > 0) setLastEventAt(Date.now());
  }, [changes.length]);

  return { data, changes, lastEventAt };
}
