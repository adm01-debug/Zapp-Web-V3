// @ts-nocheck
import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getExternalSupabase, callExtRpc } from '@/integrations/supabase/externalClient';
import { toast } from '@/hooks/use-toast';

// Lazy: getExternalSupabase() can return null when FATOR X env vars are absent.
// Resolve at call time so module import never crashes.
const getClient = () => getExternalSupabase();


interface _RawExecRow {
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
        { event: '*', schema: 'public', table: 'automation_executions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          if (row?.remote_jid === remoteJid) void refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
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

  /**
   * Aplica a tag recomendada via FATOR X (rpc_upsert_contact). Mantém auditoria
   * em automation_executions.applied_tags. NÃO altera o status — o usuário ainda
   * decide aceitar/descartar a sugestão de texto separadamente.
   */
  const applyRecommendedTag = useCallback(
    async (id: string) => {
      const sugg = suggestions.find((s) => s.id === id);
      if (!sugg?.recommended_tag) return false;
      try {
        const client = getClient();
        if (!client) return false;
        await callExtRpc(client, 'rpc_upsert_contact', {
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