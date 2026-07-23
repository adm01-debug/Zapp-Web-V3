// Wrapper tipado sobre useLatestAnalysisManagement (GAP-6: RPC ainda não implantada).
// Fornece um contrato explícito de ContactAnalysis para consumidores da UI (badges, painéis).
import { useQuery } from '@tanstack/react-query';
import { log } from '@/lib/logger';

/** Tipo de análise de sentimento/urgência exposto para a UI. */
export interface ContactAnalysis {
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'critico';
  urgency?: 'baixa' | 'media' | 'alta' | 'critica';
  summary?: string;
  department?: string;
}

/** React hook: retorna a última análise de um contato. */
export function useLatestAnalysis(contactId: string | null | undefined) {
  const { data: analysis = null, isLoading: loading } = useQuery({
    queryKey: ['latest-analysis', contactId ?? null] as const,
    queryFn: async (): Promise<ContactAnalysis | null> => {
      // GAP-6: get_latest_analysis RPC ainda não implantada no self-hosted.
      log.warn('useLatestAnalysis chamado sem RPC implantada', { contactId });
      return null;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });

  return { analysis, loading };
}
