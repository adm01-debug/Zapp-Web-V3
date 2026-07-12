import { useState, useEffect, useCallback, useRef } from 'react';
import { emailHealthService } from '@/services/email/emailHealthService';
import type { EmailHealthInfo } from '@/services/email/types';
import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useEmailHealth');

export function useEmailHealth() {
  const [health, setHealth] = useState<EmailHealthInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  // Generation counter: only the latest in-flight request commits state, preventing stale overwrites.
  const generationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadHealth = useCallback(async (skipIfLoading = false) => {
    if (skipIfLoading && loadingRef.current) return;
    const gen = ++generationRef.current;
    loadingRef.current = true;
    setIsLoading(true);
    try {
      const data = await emailHealthService.getHealthStatus();
      if (gen === generationRef.current && mountedRef.current) setHealth(data);
    } catch (err) {
      log.error('Email health load error', err);
    } finally {
      if (gen === generationRef.current) {
        loadingRef.current = false;
        if (mountedRef.current) setIsLoading(false);
      }
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
    const interval = setInterval(() => void loadHealth(true), 30000); // background polls skip if in-flight
    return () => clearInterval(interval);
  }, [loadHealth]);

  return {
    health,
    isLoading,
    refresh: loadHealth,
    forceRevalidation,
  };
}
