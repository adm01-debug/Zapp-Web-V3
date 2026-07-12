import { useState, useEffect, useCallback } from 'react';
import { BridgeService } from '@/services/connections/BridgeService';
import { HealthRow, BridgeStatus } from '@/components/connections/types';
import { getLogger } from '@/lib/logger';

const log = getLogger('useBridgeHealth');

/**
 * Hook para gerenciar o estado de saúde da Ponte Supabase.
 */
export function useBridgeHealth() {
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [health, setHealth] = useState<HealthRow | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setStatus('checking');
    setError(null);

    try {
      const result = await BridgeService.checkHealth();
      setHealth(result.health);
      setError(result.error);
      setStatus(result.status);
      setCheckedAt(new Date());
    } catch (err) {
      log.error('Bridge health check failed:', err);
      setError(err instanceof Error ? err.message : 'Health check failed');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return { status, health, checkedAt, error, runCheck };
}
