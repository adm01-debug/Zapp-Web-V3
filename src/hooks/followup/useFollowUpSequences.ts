import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

/** Hook: Step. */
export interface Step {
  step_order: number;
  delay_hours: number;
  message_template: string;
  is_active: boolean;
}

interface FollowUpStep {
  id: string;
  step_order: number;
  delay_hours: number;
  message_template: string;
}

interface FollowUpSequence {
  id: string;
  name: string;
  is_active: boolean;
  trigger_event: string;
  followup_steps: FollowUpStep[];
}

/** Linha real do motor (view zapp.evolution_followup_rules → evo.evolution_followup_rules). */
interface FollowupRuleRow {
  id: string | null;
  name: string | null;
  trigger_type: string | null;
  trigger_config: unknown;
  delay_hours: number | null;
  sequence_group: string | null;
  sequence_order: number | null;
  template_id: string | null;
  description: string | null;
  is_active: boolean | null;
  run_count: number | null;
}

/** Gera uma chave de agrupamento única para uma nova sequência (multi-passos). */
function newGroupKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `seq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Hook: use Follow Up Sequences.
 *
 * WHATSAPP-10 (FIX 2026-08-04): a UI agora lê/grava a MESMA tabela do motor
 * real — `zapp.evolution_followup_rules` (view proxy auto-updatable sobre a
 * tabela física `evo.evolution_followup_rules`, única com 4 regras ativas em
 * produção). Antes o CRUD ia para `zapp.followup_sequences` / `followup_steps`
 * (0 linhas, SEM consumidor no repo — nenhum cron/edge/trigger as lê).
 *
 * Contrato do motor (edge `evolution-followup` v3, cron-only):
 *   - o edge processa `zapp.evolution_followups` (instâncias agendadas com
 *     status='pending' e scheduled_at <= now) e enfileira via
 *     `evolution_message_queue`; ele NÃO lê rules nem sequences;
 *   - a materialização rules → followups é feita por trigger de produção
 *     (`trg_create_followups_on_stage_change`, SEM fonte neste repo);
 *   - evo NÃO está no PGRST_DB_SCHEMAS → o front só alcança as rules via a
 *     view proxy zapp (este hook) ou via RPC service_role.
 *
 * PONTES PENDENTES (sinalizadas ao maestro — NÃO implementadas aqui):
 *   1. Não existe RPC/edge de sync rules ↔ sequences antigas; as linhas órfãs
 *      de zapp.followup_sequences (se houver) ficam inertes por design.
 *   2. O template de mensagem da UI é salvo como texto em `description`; o
 *      trigger de produção renderiza via `template_id` (FK evolution_message_templates).
 *      Sem seletor de template, regras criadas aqui carregam template_id=null —
 *      validar disparo real antes de depender da feature.
 *   3. `run_count` é incrementado pelo motor — exibido como estatística.
 */
export function useFollowUpSequences() {
  const queryClient = useQueryClient();

  const { data: sequences = [], isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.followupSequences.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('evolution_followup_rules')
        .select(
          'id, name, trigger_type, trigger_config, delay_hours, sequence_group, sequence_order, template_id, description, is_active, run_count'
        )
        .order('sequence_group', { ascending: true })
        .order('sequence_order', { ascending: true });
      if (error) throw error;
      const rules = (data ?? []) as unknown as FollowupRuleRow[];

      // Agrupa por sequence_group (fallback: cada regra sem grupo vira sua própria sequência).
      const groups = new Map<string, FollowupRuleRow[]>();
      for (const rule of rules) {
        const key = rule.sequence_group ?? rule.id ?? rule.name ?? 'ungrouped';
        const list = groups.get(key) ?? [];
        list.push(rule);
        groups.set(key, list);
      }

      const seqs: FollowUpSequence[] = [];
      for (const [key, groupRules] of groups) {
        const ordered = [...groupRules].sort(
          (a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)
        );
        const first = ordered[0];
        seqs.push({
          id: key,
          name: first.name ?? 'Sequência sem nome',
          is_active: first.is_active ?? false,
          trigger_event: first.trigger_type ?? 'conversation_closed',
          followup_steps: ordered.map((r) => ({
            id: r.id ?? r.sequence_group ?? key,
            step_order: r.sequence_order ?? 1,
            delay_hours: r.delay_hours ?? 0,
            message_template: r.description ?? '',
          })),
        });
      }
      return seqs;
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, steps }: { name: string; steps: Step[] }) => {
      const groupKey = newGroupKey();
      const rows = steps.map((s) => ({
        name,
        trigger_type: 'conversation_closed',
        trigger_config: { event: 'conversation_closed' },
        delay_hours: s.delay_hours,
        sequence_group: groupKey,
        sequence_order: s.step_order,
        // Ponte texto → description: o motor renderiza via template_id; sem
        // seletor de template a mensagem fica em description (ver NOTA do hook).
        description: s.message_template,
        is_active: s.is_active,
      }));
      const { error } = await supabase.from('evolution_followup_rules').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
      toast({ title: 'Sequência criada' });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao criar sequência',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('evolution_followup_rules')
        .update({ is_active: isActive })
        .or(`sequence_group.eq.${id},and(sequence_group.is.null,id.eq.${id})`);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao alterar status',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('evolution_followup_rules')
        .delete()
        .or(`sequence_group.eq.${id},and(sequence_group.is.null,id.eq.${id})`);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.followupSequences.executionsRoot() });
      toast({ title: 'Sequência excluída' });
    },
    onError: (e) => {
      toast({
        title: 'Erro ao excluir sequência',
        description: e instanceof Error ? e.message : undefined,
        variant: 'destructive',
      });
    },
  });

  return {
    sequences,
    isLoading,
    queryError,
    createMutation,
    toggleMutation,
    deleteMutation,
  };
}

// Mantém o export do helper usado por testes/consumidores que dependem do tipo.
export type { FollowUpSequence };
