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
import { useMemo } from 'react';
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
 * Valida uma row bruta da RPC (tipos gerados dizem `Json`) e constrói o shape
 * tipado. Retorna null para linhas fora do contrato (defensivo — sem cast cru).
 */
function toContactSummary(row: unknown): ContactSummary | null {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
  const r = row as Record<string, unknown>;
  if (
    typeof r.contact_id !== 'string' ||
    typeof r.unread_whispers !== 'number' ||
    typeof r.pending_tasks !== 'number'
  ) {
    return null;
  }
  return {
    contact_id: r.contact_id,
    unread_whispers: r.unread_whispers,
    pending_tasks: r.pending_tasks,
  };
}

/**
 * Busca resumo de whispers não lidos e tarefas pendentes para múltiplos contatos
 * em uma única chamada RPC (batch).
 *
 * @param contactIds — lista de contact UUIDs. Deve ser estabilizada via useMemo no caller.
 */
export function useContactSummaryBatch(contactIds: string[]) {
  // Estabiliza os IDs: sem useMemo o array é recriado a cada render e o
  // queryKey muda de referência → refetch em loop (BUG-2026-08-04).
  const stableIds = useMemo(() => [...new Set(contactIds)].sort(), [contactIds]);

  return useQuery<ContactSummary[]>({
    queryKey: queryKeys.contactSummaryBatch.batch(stableIds),
    queryFn: async () => {
      if (!stableIds.length) return [];

      const { data, error } = await supabase.rpc(
        'rpc_get_contact_summary_batch',
        { p_contact_ids: stableIds }
      );

      if (error) {
        // AbortError = cancelamento intencional (unmount/refetch) — silencioso.
        if (error instanceof Error && error.name === 'AbortError') return [];
        log.warn('rpc_get_contact_summary_batch failed', { error: error.message });
        return [];
      }

      // RPC é RETURNS TABLE → array de rows (tipado como Json nos tipos
      // gerados). Valida row a row e constrói o shape — se vier objeto, [].
      return Array.isArray(data)
        ? data.map(toContactSummary).filter((s): s is ContactSummary => s !== null)
        : [];
    },
    enabled: stableIds.length > 0,
    staleTime: 30_000,   // 30s — suficiente para a lista ficar estável
    gcTime:   120_000,   // 2min
    refetchOnWindowFocus: false,
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
