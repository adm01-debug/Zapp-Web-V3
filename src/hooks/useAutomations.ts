import { useEffect, useRef, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { log } from '@/lib/logger';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

interface ExternalMsg {
  from_me: boolean;
  content: string;
  message_timestamp: string;
  message_type: string;
}

/**
 * Hook que avalia regras de automação contra a conversa ativa.
 * Roda em intervalo curto e dispara registros de execução pendentes.
 */

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Record<string, unknown>;
  is_active: boolean;
  priority: number;
}

interface UseAutomationsArgs {
  remoteJid: string | null;
  instanceName?: string;
  assignedTo?: string | null;
}

const POLL_MS = 20_000;

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

  // Reseta snapshot de tags ao trocar de conversa
  useEffect(() => {
    prevTagsRef.current = null;
  }, [remoteJid, instanceName]);

  // Carrega regras ativas (refresh a cada 60s)
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

  // Avalia gatilhos para a conversa ativa
  const evaluate = useCallback(async () => {
    if (!remoteJid || !isMounted.current) return;

    try {
      const rules = rulesRef.current;
      if (!rules.length) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const typedClient = supabase as unknown as SupabaseClient<any>;

      // Pega últimas 10 msgs do Evolution DB
      const { data: msgs, error } = await typedClient.rpc('rpc_list_messages', {
        p_remote_jid: remoteJid,
        p_instance: instanceName,
        p_limit: 10,
      });

      if (error) throw error;
      if (!msgs || !Array.isArray(msgs) || !isMounted.current) return;

      const sorted = [...msgs].sort(
        (a: ExternalMsg, b: ExternalMsg) =>
          new Date(a.message_timestamp).getTime() - new Date(b.message_timestamp).getTime()
      );
      const last: ExternalMsg | undefined = sorted[sorted.length - 1];
      if (!last) return;

      const lastTime = new Date(last.message_timestamp).getTime();
      const ageSec = (Date.now() - lastTime) / 1000;

      // Snapshot de tags do contato para gatilhos tag_applied/tag_removed
      let currentTags: string[] = [];
      let addedTags: string[] = [];
      let removedTags: string[] = [];
      try {
        const { data: contact } = await typedClient.rpc('rpc_get_contact', {
          p_remote_jid: remoteJid,
          p_instance: instanceName,
        });
        const rawContact = Array.isArray(contact) ? contact[0] : contact;
        const rawTags = (rawContact as { tags?: unknown[] } | null)?.tags;
        currentTags = Array.isArray(rawTags) ? rawTags.map((t: unknown) => String(t)) : [];
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
          const lastInboundIdx = [...sorted].reverse().findIndex((m: ExternalMsg) => !m.from_me);
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
            ? cfg.tags.map((t: unknown) => String(t))
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
            ? cfg.tags.map((t: unknown) => String(t))
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
        const escalate = (actions.escalate_sla ?? undefined) as
          | { enabled?: boolean; level?: string; reason?: string | null }
          | undefined;
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
            await typedClient.rpc('rpc_upsert_contact', {
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
              p_error: e instanceof Error ? e.message : String(e),
              p_context: { stage: 'apply_tags_or_escalate', tags: allTags },
            });
          }
        }

        // Pedir sugestão de IA
        if (actions.suggest_reply || actions.auto_send) {
          try {
            // Contrato automation-suggest-reply@v1 (estrito — schemas.ts):
            // recentMessages aceita no MÁXIMO 8 itens e content no MÁXIMO 2000
            // chars; exceder qualquer limite resulta em 422 (parseOrReject).
            const recentMessages = sorted.slice(-8).map((m: ExternalMsg) => ({
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
            // browser (anon key) recebe 401/403. Fallback local: usa o template
            // da regra como sugestão para a execução continuar visível no painel.
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
                    q
                      .update({ suggestion_text: template, kb_sources: [] })
                      .eq('id', execId)
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

            // Auto envio
            if (actions.auto_send) {
              const { data: execArr } = await safeClient.from<{ suggestion_text: string | null }>(
                'automation_executions',
                (q) => q.select('suggestion_text').eq('id', execId).limit(1)
              );
              const exec = execArr?.[0] ?? null;
              if (exec?.suggestion_text) {
                await typedClient.rpc('rpc_insert_message', {
                  p_instance: instanceName,
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
              p_error: e instanceof Error ? e.message : String(e),
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
