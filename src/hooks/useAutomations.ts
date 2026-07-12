import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getExternalSupabase } from '@/integrations/supabase/externalClient';
import { log } from '@/lib/logger';

// Lazy: getExternalSupabase() can return null when FATOR X env vars are absent.
// Resolve at call time so module import never crashes the inbox.
const getClient = () => getExternalSupabase();

/**
 * Hook que avalia regras de automação contra a conversa ativa.
 * Roda em intervalo curto e dispara registros de execução pendentes.
 */

interface SlaEscalate {
  enabled?: boolean;
  level?: string;
  reason?: string | null;
}

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>;
  is_active: boolean;
  priority: number;
}

interface MsgRow {
  created_at: string;
  from_me: boolean;
  content: string;
}

interface UseAutomationsArgs {
  remoteJid: string | null;
  instanceName?: string;
  assignedTo?: string | null;
}

const POLL_MS = 20_000;

export function useAutomations({
  remoteJid,
  instanceName = 'wpp2',
  assignedTo = null,
}: UseAutomationsArgs) {
  const rulesRef = useRef<AutomationRule[]>([]);
  const prevTagsRef = useRef<string[] | null>(null);
  const isMounted = useRef(true);
  const loadingRef = useRef(false);
  const evaluatingRef = useRef(false);
  const needsRerunRef = useRef(false);
  const evaluatingConvRef = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Reseta snapshot de tags ao trocar de conversa e libera o mutex do avaliador
  // anterior para que a nova conversa não fique bloqueada por uma avaliação em voo.
  useEffect(() => {
    prevTagsRef.current = null;
    evaluatingRef.current = false;
    needsRerunRef.current = false;
    evaluatingConvRef.current = null;
  }, [remoteJid, instanceName]);

  // Carrega regras ativas (refresh a cada 60s)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      try {
        // Paginate to guarantee ALL active rules are loaded — a fixed .limit()
        // would silently drop any rules beyond the cap, causing them to never fire.
        // Secondary sort on id makes offset pagination stable when names collide.
        const PAGE = 1000;
        const MAX_PAGES = 10;
        const allRules: AutomationRule[] = [];
        let from = 0;
        let page = 0;
        while (page < MAX_PAGES) {
          const { data, error } = await supabase
            .from('automations')
            .select('id,name,trigger_type,trigger_config,actions,is_active')
            .eq('is_active', true)
            .order('name', { ascending: true })
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allRules.push(...(data as AutomationRule[]));
          if (data.length < PAGE) break;
          from += PAGE;
          page += 1;
        }
        if (!cancelled) rulesRef.current = allRules;
      } catch (err) {
        log.error('Error loading automation rules:', err);
      } finally {
        loadingRef.current = false;
      }
    };

    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Avalia gatilhos para a conversa ativa
  const evaluate = useCallback(async () => {
    if (!remoteJid || !isMounted.current) return;
    const convKey = `${remoteJid}:${instanceName}`;
    if (evaluatingRef.current) {
      // Defer rather than drop: the tick that unblocks will rerun for this conv.
      needsRerunRef.current = true;
      return;
    }
    evaluatingRef.current = true;
    evaluatingConvRef.current = convKey;
    needsRerunRef.current = false;

    try {
      const rules = rulesRef.current;
      if (!rules.length) return;

      const client = getClient();
      if (!client) return;

      // Pega últimas 10 msgs do FATOR X
      const { data: msgs, error } = await client.rpc('rpc_list_messages', {
        p_remote_jid: remoteJid,
        p_instance: instanceName,
        p_limit: 10,
      });

      if (error) throw error;
      if (!msgs || !Array.isArray(msgs) || !isMounted.current) return;

      const sorted = [...msgs].sort(
        (a: any, b: any) => // ignore-audit
          new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
      );
      const last = sorted[sorted.length - 1];
      if (!last) return;

      const lastTime = new Date(last.created_at).getTime();
      const ageSec = (Date.now() - lastTime) / 1000;

      // Snapshot de tags do contato para gatilhos tag_applied/tag_removed
      let currentTags: string[] = [];
      let addedTags: string[] = [];
      let removedTags: string[] = [];
      try {
        const { data: contact } = await (client as any).rpc('rpc_get_contact', {
          p_remote_jid: remoteJid,
          p_instance: instanceName,
        });
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
          // Última msg é do cliente e nenhuma resposta posterior
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
          // Aceita 'tag' (string) ou 'tags' (array). Se vazio, qualquer tag adicionada dispara.
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

        // Registra execução respeitando cooldown (RPC)
        const { data: execId } = await safeClient.rpc<string>('rpc_register_automation_execution', {
          p_rule_id: rule.id,
          p_remote_jid: remoteJid,
          p_instance_name: instanceName,
          p_assigned_to: assignedTo,
          p_trigger_payload: payload,
        });

        if (!execId) continue;

        const actions = rule.actions ?? {};

        // Escalonar SLA: aplica tag de sistema sla:<level> e remove níveis anteriores
        const escalate = actions.escalate_sla as SlaEscalate | undefined;
        let slaTags: string[] = [];
        if (escalate?.enabled) {
          const level = String(escalate.level ?? 'high');
          slaTags = [`sla:${level}`];
        }

        // Aplicar tags (escalada SLA + tags configuradas)
        const cfgTags: string[] = Array.isArray(actions.apply_tags) ? actions.apply_tags : [];
        const allTags = [...new Set([...cfgTags, ...slaTags])];
        if (allTags.length) {
          try {
            await (client as any).rpc('rpc_upsert_contact', {
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
          } catch (e: any) { // ignore-audit
            log.warn('[automation] apply_tags/escalate failed', e);
            await safeClient.rpc('rpc_record_automation_error', {
              p_execution_id: execId,
              p_error: String(e?.message ?? e),
              p_context: { stage: 'apply_tags_or_escalate', tags: allTags },
            });
          }
        }

        // Pedir sugestão de IA
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

            // Auto envio
            if (actions.auto_send) {
              const { data: execArr } = await safeClient.from<{ suggestion_text: string | null }>(
                'automation_executions',
                (q) => q.select('suggestion_text').eq('id', execId).limit(1)
              );
              const exec = execArr?.[0] ?? null;
              if (exec?.suggestion_text) {
                await (client as any).rpc('rpc_insert_message', {
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
          } catch (e: any) { // ignore-audit
            log.warn('[automation] suggest_reply failed', e);
            await safeClient.rpc('rpc_record_automation_error', {
              p_execution_id: execId,
              p_error: String(e?.message ?? e),
              p_context: { stage: 'suggest_reply_or_autosend' },
            });
          }
        }
      }
    } catch (err) {
      log.error('Error evaluating automations:', err);
    } finally {
      // Only release the lock if we still own it (conversation didn't change mid-flight).
      if (evaluatingConvRef.current === convKey) {
        evaluatingRef.current = false;
        if (needsRerunRef.current && isMounted.current) {
          needsRerunRef.current = false;
          // Defer to next microtask to avoid synchronous recursion.
          void Promise.resolve().then(() => { void evaluate(); });
        }
      }
    }
  }, [remoteJid, instanceName, assignedTo]);

  useEffect(() => {
    if (!remoteJid) return;
    const t = setInterval(evaluate, POLL_MS);
    return () => clearInterval(t);
  }, [remoteJid, evaluate]);
}
