import { useEffect, useRef, useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getExternalSupabase } from '@/integrations/supabase/externalClient';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/schema';

const getClient = () => getExternalSupabase();

/* ============ INTERFACES ============ */

export interface SlaEscalate {
  enabled?: boolean;
  level?: string;
  reason?: string | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>;
  is_active: boolean;
  priority: number;
}

export interface MsgRow {
  created_at: string;
  from_me: boolean;
  content: string;
}

export interface UseAutomationsArgs {
  remoteJid: string | null;
  instanceName?: string;
  assignedTo?: string | null;
}

export interface AutoCloseConfig {
  id: string;
  inactivity_hours: number;
  is_enabled: boolean;
  close_message: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>[];
  created_by: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

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
  instanceName = 'wpp2',
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
          .from('automations')
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

      const client = getClient();
      if (!client) return;

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
            await supabase.functions.invoke('automation-suggest-reply', {
              body: {
                executionId: execId,
                ruleId: rule.id,
                remoteJid,
                recentMessages: sorted.map((m) => ({
                  from_me: m.from_me,
                  content: m.content,
                })),
              },
            });

            if (actions.auto_send) {
              const { data: execArr } = await safeClient.from<{ suggestion_text: string | null }>(
                'automation_executions',
                (q) => q.select('suggestion_text').eq('id', execId).limit(1)
              );
              const exec = execArr?.[0] ?? null;
              if (exec?.suggestion_text) {
                await (client as unknown as SupabaseClient).rpc('rpc_insert_message', {
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
export function useAutomationSuggestions(remoteJid: string | null) {
  const [suggestions, setSuggestions] = useState<AutomationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!remoteJid) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const { data } = await safeClient.from<_RawExecRow>('automation_executions', (q) =>
      q
        .select(
          'id, rule_id, suggestion_text, recommended_tag, kb_sources, status, created_at, instance_name, remote_jid, automations(name)'
        )
        .eq('remote_jid', remoteJid)
        .eq('status', 'pending')
        .not('suggestion_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)
    );
    if (!mountedRef.current) return;
    setSuggestions(
      (data ?? []).map((r) => ({
        id: r.id,
        rule_id: r.rule_id,
        rule_name: r.automations?.name,
        suggestion_text: r.suggestion_text,
        recommended_tag: r.recommended_tag ?? null,
        kb_sources: Array.isArray(r.kb_sources) ? r.kb_sources.map(String) : [],
        status: r.status,
        created_at: r.created_at,
        instance_name: r.instance_name,
        remote_jid: r.remote_jid,
      }))
    );
    setLoading(false);
  }, [remoteJid]);

  useEffect(() => {
    void refresh();
    if (!remoteJid) return;
    const ch = supabase
      .channel(`automation-exec-${remoteJid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'automation_executions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          if (row?.remote_jid === remoteJid) void refresh();
        }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [remoteJid, refresh]);

  const accept = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'accepted', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void refresh();
    },
    [refresh]
  );

  const dismiss = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'dismissed', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void refresh();
    },
    [refresh]
  );

  const applyRecommendedTag = useCallback(
    async (id: string) => {
      const sugg = suggestions.find((s) => s.id === id);
      if (!sugg?.recommended_tag) return false;
      try {
        const extClient = getClient();
        if (!extClient) return false;
        await (extClient as unknown as SupabaseClient).rpc('rpc_upsert_contact', {
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
        refresh();
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
    [suggestions, refresh]
  );

  return { suggestions, loading, refresh, accept, dismiss, applyRecommendedTag };
}

/* ============ SECTION 3: useAutoCloseConversations ============ */

/** Manages automatic conversation closure rules with configurable inactivity thresholds. */
export function useAutoCloseConversations() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['auto-close-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_close_config')
        .select('*')
        .limit(1)
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

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
      if (!config) throw new Error('Config not found');

      const { error } = await supabase
        .from('auto_close_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-close-config'] });
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
    queryKey: ['automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as AutomationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (automation: Partial<AutomationRow>) => {
      const { data, error } = await supabase
        .from('automations')
        .insert({
          name: automation.name || 'Nova Automação',
          description: automation.description || '',
          trigger_type: automation.trigger_type || 'new_message',
          trigger_config: automation.trigger_config || {},
          actions: automation.actions || [],
          is_active: automation.is_active ?? true,
          created_by: automation.created_by,
        } as TablesInsert<'automations'>)
        .select()
        .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast({ title: 'Automação criada!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao criar automação', variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRow> & { id: string }) => {
      const { error } = await supabase
        .from('automations')
        .update(updates as TablesUpdate<'automations'>)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast({ title: 'Automação atualizada!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao atualizar automação', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast({ title: 'Automação removida!', description: '' });
    },
    onError: () => toast({ title: 'Erro ao remover automação', variant: 'destructive' }),
  });

  return { automations, isLoading, createMutation, updateMutation, deleteMutation };
}