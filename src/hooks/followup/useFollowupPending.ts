import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';

/**
 * useFollowupPending — G8 (2026-08-17): painel de follow-ups pendentes.
 *
 * Lê `zapp.evolution_followups` (a tabela REAL do motor — cron
 * `evolution-followup` processa status IN ('pending','scheduled') com
 * scheduled_at <= now). O painel mostra exatamente esse conjunto: follow-ups
 * já vencidos/atrasados aguardando o motor (ou atenção manual).
 *
 * "Concluir" roda `zapp.rpc_complete_followup(uuid)` (SECURITY DEFINER +
 * fn_require_app_user — a tabela tem RLS SELECT-only para authenticated, então
 * UPDATE direto do front é bloqueado). Status final: 'completed' (adicionado
 * ao CHECK na migration 20260817220000) — fora do claim do motor, que ignora
 * rows não-(pending|scheduled).
 */

/** Status que o motor ainda considera "a enviar" (claim: scheduled_at <= now). */
const PENDING_STATUSES = ['pending', 'scheduled'] as const;

export interface PendingFollowup {
  id: string;
  contact_id: string | null;
  followup_type: string;
  scheduled_at: string;
  status: string | null;
  custom_message: string | null;
  template_id: string | null;
  instance_name: string | null;
  created_at: string | null;
  metadata: unknown;
}

export interface CompleteFollowupResult {
  ok?: boolean;
  completed?: boolean;
  error?: string;
}

export function useFollowupPending() {
  const queryClient = useQueryClient();

  const {
    data: followups = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.followupSequences.pendingRoot(),
    queryFn: async (): Promise<PendingFollowup[]> => {
      const { data, error } = await supabase
        .from('evolution_followups')
        .select(
          'id, contact_id, followup_type, scheduled_at, status, custom_message, template_id, instance_name, created_at, metadata'
        )
        .in('status', [...PENDING_STATUSES])
        .lte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as PendingFollowup[];
    },
    // Mantém o painel razoavelmente fresco sem polling agressivo.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Nomes de contato resolvidos em batch (mesmo padrão do histórico).
  const { data: contactNames = {} } = useQuery({
    queryKey: [...queryKeys.followupSequences.pendingRoot(), 'contacts'] as const,
    enabled: followups.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const ids = Array.from(
        new Set(followups.map((f) => f.contact_id).filter((v): v is string => !!v))
      );
      if (ids.length === 0) return {};
      const { data, error } = await supabase
        .from('evolution_contacts')
        .select('id, full_name, phone_number, remote_jid')
        .in('id', ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const c of data ?? []) {
        if (c.id) map[c.id] = c.full_name || c.phone_number || c.remote_jid || c.id;
      }
      return map;
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { data, error } = await supabase.rpc('rpc_complete_followup', {
        p_id: id,
      });
      if (error) throw error;
      const res = (data ?? {}) as CompleteFollowupResult;
      if (res.ok === false) {
        throw new Error(res.error ?? 'Falha ao concluir follow-up');
      }
      if (res.completed === false) {
        throw new Error('Follow-up já não está pendente (pode ter sido enviado)');
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.followupSequences.pendingRoot(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.followupSequences.executionsRoot(),
      });
      toast.success('Follow-up concluído');
    },
    onError: (e: Error) => {
      console.error('[useFollowupPending] complete error:', e);
      toast.error(`Erro ao concluir follow-up: ${e.message}`);
    },
  });

  return {
    /** Follow-ups pendentes e vencidos (scheduled_at <= now), mais antigos primeiro. */
    followups,
    /** Nome/telefone por contact_id (fallback: remote_jid). */
    contactNames,
    isLoading,
    error,
    completeMutation,
  };
}
