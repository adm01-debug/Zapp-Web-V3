/**
 * useContactSummaryBatch
 *
 * Substitui os N+1 HEAD requests individuais por 1 RPC call batch.
 * Antes (BUG-2026-08-04): para cada contato na lista, o frontend fazia:
 *   HEAD whisper_messages?contact_id=eq.{uuid}&is_read=eq.false
 *   HEAD conversation_tasks?contact_id=eq.{uuid}&status=eq.pending
 *
 * Agora: 1 call batch para todos os contatos visíveis.
 * O DB retorna unread_whispers + pending_tasks por contact_id.
 *
 * RPC: zapp.rpc_get_contact_summary_batch(p_contact_ids uuid[])
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/services/api/queryKeys';
import { getLogger } from '@/lib/logger';

const log = getLogger('useContactSummaryBatch');

export interface ContactSummary {
  contact_id: string;
  unread_whispers: number;
  pending_tasks: number;
}

/**
 * Busca resumo de whispers não lidos e tarefas pendentes para múltiplos contatos
 * em uma única chamada RPC (batch).
 *
 * @param contactIds — lista de contact UUIDs. Deve ser estabilizada via useMemo no caller.
 */
export function useContactSummaryBatch(contactIds: string[]) {
  const stableIds = [...new Set(contactIds)].sort();

  return useQuery<ContactSummary[]>({
    queryKey: queryKeys.contactSummaryBatch.batch(stableIds),
    queryFn: async () => {
      if (!stableIds.length) return [];

      const { data, error } = await supabase.rpc(
        'rpc_get_contact_summary_batch',
        { p_contact_ids: stableIds }
      );

      if (error) {
        log.warn('rpc_get_contact_summary_batch failed', { error: error.message });
        return [];
      }

      return (data ?? []) as unknown as ContactSummary[];
    },
    enabled: stableIds.length > 0,
    staleTime: 30_000,   // 30s — suficiente para a lista ficar estável
    gcTime:   120_000,   // 2min
  });
}

/**
 * Helper: transforma o array de resultados em um Map<contactId, ContactSummary>
 * para lookups O(1) no componente de lista.
 */
export function useSummaryMap(contactIds: string[]): Map<string, ContactSummary> {
  const { data } = useContactSummaryBatch(contactIds);
  return new Map((data ?? []).map((s) => [s.contact_id, s]));
}
