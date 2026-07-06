/**
 * useAdminAutomations — Wave 3 batch-4 (2026-07-07)
 * Camada de dados extraída de AdminAutomationsPage. Correções fiéis ao contrato
 * real do banco (ver comentários inline): save funcional (payload sem colunas
 * fantasmas), adjustPriority removido (corrompia trigger_count).
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useMountedRef } from '@/hooks/useMountedRef';

export type TriggerType =
  | "first_response_pending"
  | "inactivity"
  | "tag_applied"
  | "tag_removed"
  | "keyword_match";

export interface Rule {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: TriggerType;
  trigger_config: any;
  actions: any;
  priority: number;
  cooldown_seconds: number;
  channel_id: string | null;
  department_id: string | null;
}

export interface Channel { id: string; name: string }
export interface Department { id: string; name: string }

export const TRIGGER_LABEL: Record<TriggerType, string> = {
  first_response_pending: "Primeira resposta pendente",
  inactivity: "Ausência / inatividade",
  tag_applied: "Etiqueta aplicada",
  tag_removed: "Etiqueta removida",
  keyword_match: "Palavra-chave",
};

export const EMPTY_RULE: Omit<Rule, "id"> = {
  name: "",
  description: "",
  is_active: true,
  trigger_type: "first_response_pending",
  trigger_config: { threshold_seconds: 60 },
  actions: {
    suggest_reply: true,
    auto_send: false,
    apply_tags: [] as string[],
    ai_prompt: "",
    template: "",
    escalate_sla: { enabled: false, level: "high", reason: "" },
  },
  priority: 100,
  cooldown_seconds: 300,
  channel_id: null,
  department_id: null,
};


export function useAdminAutomations() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useMountedRef();

  const load = async () => {
    setLoading(true);
    const [{ data: rulesData, error }, { data: chs }, { data: deps }] = await Promise.all([
      supabase.from('automations')
        .select("*")
        .order("name", { ascending: true }),
      supabase.from('service_channels').select("id,name").order("name"),
      supabase.from('departments').select("id,name").order("name"),
    ]);
    if (!mountedRef.current) return;
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setRules((rulesData ?? []) as unknown as Rule[] /* Rule inclui campos de form (priority etc.) além do Row real — ver decisão de produto */);
    setChannels((chs ?? []) as Channel[]);
    setDepartments((deps ?? []) as Department[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const save = async (editing: Rule | null): Promise<boolean> => {
    if (!editing) return false;
    if (!editing.name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return false;
    }
    const payload = {
      name: editing.name,
      description: editing.description,
      is_active: editing.is_active,
      trigger_type: editing.trigger_type,
      trigger_config: editing.trigger_config,
      actions: editing.actions,
      // Contrato real da view public.automations (verificado no banco):
      // priority/cooldown_seconds/channel_id/department_id NÃO existem — enviá-los
      // causava PostgREST 400 (save quebrado em produção, escondido por casts).
      // Decisão de produto pendente no REFACTOR_PLAN: criar as colunas ou remover a UI.
    };
    const op = editing.id
      ? supabase.from('automations').update(payload).eq("id", editing.id)
      : supabase.from('automations').insert(payload);
    const { error } = await op;
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: "Regra salva" });
    load();
    return true;
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('automations').delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    load();
  };

  const toggleActive = async (r: Rule) => {
    await supabase
      .from('automations')
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    load();
  };

  // adjustPriority REMOVIDO: gravava trigger_count (métrica real de execuções)
  // com valores derivados de 'priority' (campo inexistente no schema) — dano ativo.
  // Decisão de produto no REFACTOR_PLAN: criar coluna priority ou remover as setas da UI.

  const channelMap = useMemo(() => Object.fromEntries(channels.map((c) => [c.id, c.name])), [channels]);
  const deptMap = useMemo(() => Object.fromEntries(departments.map((d) => [d.id, d.name])), [departments]);

  return { rules, channels, departments, loading, load, save, remove, toggleActive, channelMap, deptMap };
}
