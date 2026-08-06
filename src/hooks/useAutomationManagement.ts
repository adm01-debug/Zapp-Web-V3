// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/schema';
import { queryKeys } from '@/services/api/queryKeys';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

interface ExternalMessage {
  message_timestamp: string;
  created_at: string;
  [key: string]: unknown;
}

/* ============ INTERFACES ============ */

/** SLA escalation configuration attached to an automation trigger. */
export interface SlaEscalate {
  enabled?: boolean;
  level?: string;
  reason?: string | null;
}

/** A single automation rule row from the database. */
export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>;
  is_active: boolean;
  priority: number;
}

/** Msg Row interface definition. */
export interface MsgRow {
  created_at: string;
  from_me: boolean;
  content: string;
}

/** Use Automations Args interface definition. */
export interface UseAutomationsArgs {
  remoteJid: string | null;
  instanceName?: string;
  assignedTo?: string | null;
}

/** Auto Close Config interface definition. */
export interface AutoCloseConfig {
  id: string;
  inactivity_hours: number;
  is_enabled: boolean;
  close_message: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Automation Suggestion interface definition. */
export interface AutomationSuggestion {
  id: string;
  rule_id: string;
  rule_name?: string;
  suggestion_text: string | null;
  recommended_tag: string | null;
  kb_sources: string[];
  status: string;
  created_at: string;
  instance_name: string;
  remote_jid: string;
}

/** Automation Row interface definition. */
export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>[];
  created_by: string | null;
  last_executed_at: string | null;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

/** _ Raw Exec Row interface definition. */
export interface _RawExecRow {
  id: string;
  rule_id: string;
  suggestion_text: string | null;
  recommended_tag: string | null;
  kb_sources: string[] | null;
  status: string;
  created_at: string;
  instance_name: string;
  remote_jid: string;
  automations: { name?: string } | null;
}

/* ============ CONSTANTS ============ */

const POLL_MS = 20_000;

/* ============ SECTION 1: useAutomations (Rule Evaluation) ============ */

/** Evaluates and applies automation rules to conversations with tag matching and filtering. */
export function useAutomations({
  remoteJid,
  instanceName = DEFAULT_WHATSAPP_INSTANCE,
  assignedTo = null,
}: UseAutomationsArgs) {
  const rulesRef = useRef<AutomationRule[]>([]);
  const prevTagsRef = useRef<string[] | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    prevTagsRef.current = null;
  }, [remoteJid, instanceName]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from('automation_rules')
          .select('id,name,trigger_type,trigger_config,actions,is_active')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;
        if (!cancelled && data) rulesRef.current = data as AutomationRule[];
      } catch (err) {
        log.error('Error loading automation rules:', err);
      }
    };

    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const evaluate = useCallback(async () => {
    if (!remoteJid || !isMounted.current) return;

    try {
      const rules = rulesRef.current;
      if (!rules.length) return;

      const client = supabase as unknown as SupabaseClient;
      const { data: msgs, error } = await client.rpc('rpc_list_messages', {
        p_remote_jid: remoteJid,
        p_instance: instanceName,
        p_limit: 10,
      });

      if (error) throw error;
      if (!msgs || !Array.isArray(msgs) || !isMounted.current) return;

      const sorted = [...(msgs as ExternalMessage[])].sort(
        (a, b) => new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
      );
      const last = sorted[sorted.length - 1];
      if (!last) return;

      const lastTime = new Date(last.created_at).getTime();
      const ageSec = (Date.now() - lastTime) / 1000;

      let currentTags: string[] = [];
      let addedTags: string[] = [];
      let removedTags: string[] = [];
      try {
        const { data: contact } = await (client as unknown as SupabaseClient).rpc(
          // ignore-audit — ExtendedDatabase schema client cannot call unregistered RPCs; widening to bare SupabaseClient is intentional
          'rpc_get_contact',
          {
            p_remote_jid: remoteJid,
            p_instance: instanceName,
          }
        );
        const c = (Array.isArray(contact) ? contact[0] : contact) as { tags?: unknown[] } | null;
        currentTags = Array.isArray(c?.tags) ? c.tags.map((t: unknown) => String(t)) : [];
        if (prevTagsRef.current !== null) {
          const prev = prevTagsRef.current;
          addedTags = currentTags.filter((t) => !prev.includes(t));
          removedTags = prev.filter((t) => !currentTags.includes(t));
        }
        prevTagsRef.current = currentTags;
      } catch (e) {
        log.warn('[automation] tag snapshot failed', e);
      }

      for (const rule of rules) {
        const cfg = rule.trigger_config ?? {};
        let matched = false;
        const payload: Record<string, unknown> = {};

        if (rule.trigger_type === 'first_response_pending') {
          const thresh = Number(cfg.threshold_seconds ?? 60);
          const lastInboundIdx = [...sorted].reverse().findIndex((m) => !m.from_me);
          if (lastInboundIdx === 0 && ageSec >= thresh) {
            matched = true;
            payload.age_seconds = Math.round(ageSec);
          }
        } else if (rule.trigger_type === 'inactivity') {
          const thresh = Number(cfg.threshold_seconds ?? 600);
          const side = (cfg.side ?? 'any') as 'client' | 'agent' | 'any';
          if (ageSec >= thresh) {
            if (
              side === 'any' ||
              (side === 'client' && !last.from_me) ||
              (side === 'agent' && last.from_me)
            ) {
              matched = true;
              payload.age_seconds = Math.round(ageSec);
            }
          }
        } else if (rule.trigger_type === 'keyword_match') {
          const kws: string[] = Array.isArray(cfg.keywords) ? cfg.keywords : [];
          if (!last.from_me && typeof last.content === 'string' && kws.length) {
            const text = last.content.toLowerCase();
            const hit = kws.find((k) => text.includes(k.toLowerCase()));
            if (hit) {
              matched = true;
              payload.keyword = hit;
            }
          }
        } else if (rule.trigger_type === 'tag_applied') {
          const wanted: string[] = Array.isArray(cfg.tags)
            ? (cfg.tags as unknown[]).map((t: unknown) => String(t))
            : cfg.tag
              ? [String(cfg.tag)]
              : [];
          const hits = wanted.length ? addedTags.filter((t) => wanted.includes(t)) : addedTags;
          if (hits.length) {
            matched = true;
            payload.tags_added = hits;
          }
        } else if (rule.trigger_type === 'tag_removed') {
          const wanted: string[] = Array.isArray(cfg.tags)
            ? (cfg.tags as unknown[]).map((t: unknown) => String(t))
            : cfg.tag
              ? [String(cfg.tag)]
              : [];
          const hits = wanted.length ? removedTags.filter((t) => wanted.includes(t)) : removedTags;
          if (hits.length) {
            matched = true;
            payload.tags_removed = hits;
          }
        }

        if (!matched) continue;

        const { data: execId } = await safeClient.rpc<string>('rpc_register_automation_execution', {
          p_rule_id: rule.id,
          p_remote_jid: remoteJid,
          p_instance_name: instanceName,
          p_assigned_to: assignedTo,
          p_trigger_payload: payload,
        });

        if (!execId) continue;

        const actions = rule.actions ?? {};

        const escalate = actions.escalate_sla as SlaEscalate | undefined;
        let slaTags: string[] = [];
        if (escalate?.enabled) {
          const level = String(escalate.level ?? 'high');
          slaTags = [`sla:${level}`];
        }

        const cfgTags: string[] = Array.isArray(actions.apply_tags) ? actions.apply_tags : [];
        const allTags = [...new Set([...cfgTags, ...slaTags])];
        if (allTags.length) {
          try {
            await (client as unknown as SupabaseClient).rpc('rpc_upsert_contact', {
              // ignore-audit — ExtendedDatabase schema client cannot call unregistered RPCs; widening to bare SupabaseClient is intentional
              p_remote_jid: remoteJid,
              p_instance: instanceName,
              p_tags: allTags,
            });
            await safeClient.from('automation_executions', (q) =>
              q
                .update({
                  applied_tags: allTags,
                  trigger_payload: {
                    ...payload,
                    ...(escalate?.enabled
                      ? { sla_escalated_to: escalate.level, sla_reason: escalate.reason ?? null }
                      : {}),
                  },
                })
                .eq('id', execId)
            );
          } catch (e: unknown) {
            log.warn('[automation] apply_tags/escalate failed', e);
            await safeClient.rpc('rpc_record_automation_error', {
              p_execution_id: execId,
              p_error: String(e instanceof Error ? e.message : e),
              p_context: { stage: 'apply_tags_or_escalate', tags: allTags },
            });
          }
        }

        if (actions.suggest_reply || actions.auto_send) {
          try {
            // Contrato automation-suggest-reply@v1 (estrito — schemas.ts):
            // recentMessages aceita no MÁXIMO 8 itens e content no MÁXIMO 2000
            // chars; exceder qualquer limite resulta em 422 (parseOrReject).
            // O evaluate() carrega 10 mensagens (p_limit) — slice/truncate aqui
            // garantem que o invoke nunca quebre por contrato.
            const recentMessages = sorted.slice(-8).map((m) => ({
              from_me: m.from_me,
              content: String(m.content ?? '').slice(0, 2000),
            }));

            const { error: invokeErr } = await supabase.functions.invoke(
              'automation-suggest-reply',
              {
                body: {
                  executionId: execId,
                  ruleId: rule.id,
                  remoteJid,
                  recentMessages,
                },
              }
            );

            // Edge é internal-only (requireServiceRoleOrCron — auth.ts): o
            // browser (anon key) recebe 401/403. Fallback local: se a regra tem
            // actions.template, usa o template como sugestão para a execução
            // continuar visível no painel; senão apenas loga (o catch externo
            // não deve registrar erro esperado de auth como falha de execução).
            if (invokeErr) {
              const errObj = invokeErr as {
                status?: number;
                context?: { status?: number };
              };
              const status = errObj.status ?? errObj.context?.status ?? 0;
              if (status === 401 || status === 403) {
                const template =
                  typeof actions.template === 'string' && actions.template.trim()
                    ? actions.template.trim()
                    : '';
                if (template) {
                  await safeClient.from('automation_executions', (q) =>
                    q.update({ suggestion_text: template, kb_sources: [] }).eq('id', execId)
                  );
                  log.warn(
                    '[automation] suggest-reply indisponível (edge internal-only) — usando template da regra como sugestão'
                  );
                } else {
                  log.warn(
                    '[automation] suggest-reply indisponível (edge internal-only) — sem template p/ fallback'
                  );
                }
              } else {
                throw invokeErr;
              }
            }

            if (actions.auto_send) {
              const { data: execArr } = await safeClient.from<{ suggestion_text: string | null }>(
                'automation_executions',
                (q) => q.select('suggestion_text').eq('id', execId).limit(1)
              );
              const exec = execArr?.[0] ?? null;
              if (exec?.suggestion_text) {
                await (client as unknown as SupabaseClient).rpc('rpc_insert_message', {
                  // ignore-audit — ExtendedDatabase schema client cannot call unregistered RPCs; widening to bare SupabaseClient is intentional
                  p_remote_jid: remoteJid,
                  p_content: exec.suggestion_text,
                  p_from_me: true,
                  p_message_type: 'text',
                });
                await safeClient.from('automation_executions', (q) =>
                  q
                    .update({ status: 'executed', acted_at: new Date().toISOString() })
                    .eq('id', execId)
                );
              }
            }
          } catch (e: unknown) {
            log.warn('[automation] suggest_reply failed', e);
            await safeClient.rpc('rpc_record_automation_error', {
              p_execution_id: execId,
              p_error: String(e instanceof Error ? e.message : e),
              p_context: { stage: 'suggest_reply_or_autosend' },
            });
          }
        }
      }
    } catch (err) {
      log.error('Error evaluating automations:', err);
    }
  }, [remoteJid, instanceName, assignedTo]);

  useEffect(() => {
    if (!remoteJid) return;
    const t = setInterval(evaluate, POLL_MS);
    return () => clearInterval(t);
  }, [remoteJid, evaluate]);
}

/* ============ SECTION 2: useAutomationSuggestions ============ */

/** Generates AI-powered automation suggestions based on conversation patterns and history. */
export function useAutomationSuggestions(contactId: string | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => ['automation-suggestions', contactId] as const, [contactId]);

  const { data: suggestions = [], isLoading: loading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!contactId) return [] as AutomationSuggestion[];
      // FIX #2: Join com automations(name) causa 400 — fazer 2 queries
      const { data: execs } = await safeClient.from<_RawExecRow>('automation_executions', (q) =>
        q
          .select(
            'id, rule_id, suggestion_text, recommended_tag, kb_sources, status, created_at, instance_name, remote_jid'
          )
          .eq('contact_id', contactId)
          .eq('status', 'pending')
          .not('suggestion_text', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5)
      );

      const ruleIds = [...new Set((execs ?? []).map((r) => r.rule_id).filter(Boolean))];
      const { data: rules } =
        ruleIds.length > 0
          ? await safeClient.from<{ id: string; name: string }>('automation_rules', (q) =>
              q.select('id, name').in('id', ruleIds)
            )
          : { data: [] as { id: string; name: string }[] };
      const ruleNameMap = new Map((rules ?? []).map((r) => [r.id, r.name]));

      return (execs ?? []).map((r) => ({
        id: r.id,
        rule_id: r.rule_id,
        rule_name: ruleNameMap.get(r.rule_id),
        suggestion_text: r.suggestion_text,
        recommended_tag: r.recommended_tag ?? null,
        kb_sources: Array.isArray(r.kb_sources) ? r.kb_sources.map(String) : [],
        status: r.status,
        created_at: r.created_at,
        instance_name: r.instance_name,
        remote_jid: r.remote_jid,
      }));
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key]
  );

  useEffect(() => {
    if (!contactId) return;
    const ch = supabase
      .channel(`automation-exec-${contactId}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'automation_executions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          if (row?.contact_id === contactId) void queryClient.invalidateQueries({ queryKey: key });
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
      supabase.removeChannel(ch);
    };
  }, [contactId, queryClient, key]);

  const accept = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'accepted', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient, key]
  );

  const dismiss = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'dismissed', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void queryClient.invalidateQueries({ queryKey: key });
    },
    [queryClient, key]
  );

  const applyRecommendedTag = useCallback(
    async (id: string) => {
      const sugg = suggestions.find((s) => s.id === id);
      if (!sugg?.recommended_tag) return false;
      try {
        await (supabase as unknown as SupabaseClient).rpc('rpc_upsert_contact', {
          // ignore-audit — ExtendedDatabase schema client cannot call unregistered RPCs; widening to bare SupabaseClient is intentional
          p_remote_jid: sugg.remote_jid,
          p_instance: sugg.instance_name,
          p_tags: [sugg.recommended_tag],
        });
        await safeClient.from('automation_executions', (q) =>
          q.update({ applied_tags: [sugg.recommended_tag] }).eq('id', id)
        );
        toast({
          title: 'Tag aplicada',
          description: `"${sugg.recommended_tag}" foi adicionada ao contato.`,
        });
        void queryClient.invalidateQueries({ queryKey: key });
        return true;
      } catch (e) {
        toast({
          title: 'Falha ao aplicar tag',
          description: e instanceof Error ? e.message : 'Erro desconhecido',
          variant: 'destructive',
        });
        return false;
      }
    },
    [suggestions, queryClient, key]
  );

  return { suggestions, loading, refresh, accept, dismiss, applyRecommendedTag };
}

/* ============ SECTION 3: useAutoCloseConversations ============ */

/** Manages automatic conversation closure rules with configurable inactivity thresholds. */
export function useAutoCloseConversations() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: queryKeys.automations.autoClose(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_close_config')
        .select('*')
        .limit(1)
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
  });

  const updateConfig = useMutation({
    mutationFn: async (
      updates: Partial<Pick<AutoCloseConfig, 'inactivity_hours' | 'is_enabled' | 'close_message'>>
    ) => {
      const config = configQuery.data;

      // Upsert em vez de update: se ainda não existe nenhuma linha de config
      // (tabela vazia), o INSERT cria a config em vez de falhar com "Config not found".
      const { error } = await supabase.from('auto_close_config').upsert(
        {
          ...updates,
          // Insert exige inactivity_hours obrigatório — fallback para o valor atual
          inactivity_hours: updates.inactivity_hours ?? config?.inactivity_hours ?? 0,
          updated_at: new Date().toISOString(),
          ...(config?.id ? { id: config.id } : {}),
        },
        { onConflict: 'id' }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.autoClose() });
      toast({
        title: 'Configuração salva',
        description: 'Auto-fechamento atualizado com sucesso.',
      });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    },
  });

  return {
    config: configQuery.data,
    isLoading: configQuery.isLoading,
    updateConfig,
  };
}

/* ============ SECTION 4: useAutomationsManagementCRUD ============ */

/** Provides CRUD operations for automation rules with list, create, update, and delete capabilities. */
export function useAutomationsManagementCRUD() {
  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: queryKeys.automations.all(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AutomationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (automation: Partial<AutomationRow>) => {
      const { data, error } = await supabase
        .from('automation_rules')
        .insert({
          name: automation.name || 'Nova Automação',
          description: automation.description || '',
          trigger_type: automation.trigger_type || 'new_message',
          trigger_config: automation.trigger_config || {},
          actions: automation.actions || [],
          is_active: automation.is_active ?? true,
          created_by: automation.created_by,
        } as TablesInsert<'automation_rules'>)
        .select()
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all() });
      toast({ title: 'Automação criada!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao criar automação', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRow> & { id: string }) => {
      const { error } = await supabase
        .from('automation_rules')
        .update(updates as TablesUpdate<'automation_rules'>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all() });
      toast({ title: 'Automação atualizada!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao atualizar automação', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.automations.all() });
      toast({ title: 'Automação removida!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao remover automação', variant: 'destructive' }),
  });

  return { automations, isLoading, createMutation, updateMutation, deleteMutation };
}
