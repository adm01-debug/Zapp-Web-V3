import { useState, useEffect, useCallback, useRef } from 'react';
import { emailHealthService } from '@/services/email/emailHealthService';
import type { EmailHealthInfo } from '@/services/email/types';
import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useEmailHealth');

/** Monitors Gmail account health status and displays health information. */
export function useEmailHealth() {
  const [health, setHealth] = useState<EmailHealthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await emailHealthService.getHealthStatus();
      if (mountedRef.current) setHealth(data);
    } catch (err) {
      log.error('Email health load error', err);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  const forceRevalidation = async () => {
    try {
      await emailHealthService.forceRevalidation();
      toast({
        title: 'Cache atualizado',
        description: 'A revalidação do schema foi forçada com sucesso.',
      });
      await loadHealth();
    } catch {
      toast({
        title: 'Erro na revalidação',
        description: 'Não foi possível forçar a revalidação.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    void loadHealth();
    const interval = setInterval(loadHealth, 30000); // 30s
    return () => clearInterval(interval);
  }, [loadHealth]);

  return {
    health,
    isLoading,
    refresh: loadHealth,
    forceRevalidation,
  };
}
