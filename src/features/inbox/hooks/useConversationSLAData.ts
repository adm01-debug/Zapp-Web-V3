/**
 * useConversationSLA — query canônica de `conversation_sla` por contato.
 *
 * UNIFICAÇÃO (BUG-2026-08-06): antes existiam 2 queries concorrentes para a
 * mesma tabela com selects diferentes:
 *   - `useContactEnrichedData` (queryKey `queryKeys.sla.contact(id)`)
 *   - `NextBestActionEngine` (fetch cru, sem cache)
 *
 * Agora TODO consumidor usa o MESMO queryKey (`queryKeys.sla.contact`) e o
 * MESMO select completo → o React Query deduplica: 1 GET por contato, e quem
 * só precisa de 2 campos lê o mesmo cache.
 *
 * staleTime 30s: evita refetch ao reabrir a conversa / re-render do painel.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { isValidUUID } from '@/utils/uuid';

export interface ConversationSLAInfo {
  first_response_breached: boolean | null;
  resolution_breached: boolean | null;
  first_response_at: string | null;
  resolved_at: string | null;
}

interface ConversationSLARow {
  first_response_breached: boolean | null;
  resolution_breached: boolean | null;
  first_response_at: string | null;
  resolved_at: string | null;
}

export function useConversationSLA(contactId: string | null | undefined) {
  return useQuery<ConversationSLAInfo | null>({
    queryKey: queryKeys.sla.contact(contactId ?? undefined),
    enabled: !!contactId && isValidUUID(contactId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('conversation_sla')
        .select(
          'first_response_breached, resolution_breached, first_response_at, resolved_at'
        )
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // Normaliza — booleans/datas nunca vêm como `undefined` aos consumidores.
      const row = data as unknown as ConversationSLARow;
      return {
        first_response_breached:
          typeof row.first_response_breached === 'boolean'
            ? row.first_response_breached
            : null,
        resolution_breached:
          typeof row.resolution_breached === 'boolean'
            ? row.resolution_breached
            : null,
        first_response_at:
          typeof row.first_response_at === 'string' ? row.first_response_at : null,
        resolved_at: typeof row.resolved_at === 'string' ? row.resolved_at : null,
      };
    },
  });
}
