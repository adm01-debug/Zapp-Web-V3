import { useQuery, useQueryClient } from '@tanstack/react-query';
import { emailHealthService } from '@/services/email/emailHealthService';
import type { EmailHealthInfo } from '@/services/email/types';
import { useToast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useEmailHealth');
const HEALTH_KEY = ['email-health'] as const;

/** Hook: use Email Health. */
export function useEmailHealth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: health = null, isLoading } = useQuery<EmailHealthInfo | null>({
    queryKey: HEALTH_KEY,
    queryFn: async () => {
      try {
        return await emailHealthService.getHealthStatus();
      } catch (err) {
        log.error('Email health load error', err);
        return null;
      }
    },
    staleTime: 25_000,
    refetchInterval: 30_000,
  });

  const forceRevalidation = async () => {
    try {
      await emailHealthService.forceRevalidation();
      toast({
        title: 'Cache atualizado',
        description: 'A revalidação do schema foi forçada com sucesso.',
      });
      await queryClient.invalidateQueries({ queryKey: HEALTH_KEY });
    } catch {
      toast({
        title: 'Erro na revalidação',
        description: 'Não foi possível forçar a revalidação.',
        variant: 'destructive',
      });
    }
  };

  return {
    health,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: HEALTH_KEY }),
    forceRevalidation,
  };
}
