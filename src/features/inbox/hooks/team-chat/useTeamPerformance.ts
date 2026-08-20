import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { queryKeys } from '@/services/api/queryKeys';

/** Janela da telemetria real: últimos 30 minutos da conversa. */
export const TEAM_PERFORMANCE_WINDOW_MINUTES = 30;

export interface TeamPerformanceMessage {
  id: string;
  created_at: string;
  status: string;
}

/**
 * Fetches messages da conversa para a telemetria do Team Performance Panel.
 * Movido de UI (TeamPerformancePanel.tsx) para hook de domínio (data-layer ratchet).
 */
export function useTeamPerformance(conversationId: string) {
  return useQuery({
    queryKey: queryKeys.teamChat.performance(conversationId),
    queryFn: async (): Promise<TeamPerformanceMessage[]> => {
      const since = new Date(Date.now() - TEAM_PERFORMANCE_WINDOW_MINUTES * 60_000).toISOString();
      const { data, error } = await safeClient.from<TeamPerformanceMessage>('team_messages', (q) =>
        q
          .select('id, created_at, status')
          .eq('conversation_id', conversationId)
          .gte('created_at', since)
          .order('created_at', { ascending: true })
          .limit(2000),
      );
      if (error) throw error;
      return (data ?? []) as TeamPerformanceMessage[];
    },
    staleTime: 30_000,
  });
}