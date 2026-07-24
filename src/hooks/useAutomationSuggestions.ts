import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getExternalSupabase } from '@/integrations/supabase/externalClient';
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
  const queryClient = useQueryClient();
  const SUGGESTIONS_KEY = ['automation-suggestions', remoteJid] as const;

  const { data: suggestions = [], isLoading: loading, refetch } = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: async () => {
      const { data } = await safeClient.from<_RawExecRow>('automation_executions', (q) =>
        q
          .select(
            'id, rule_id, suggestion_text, recommended_tag, kb_sources, status, created_at, instance_name, remote_jid, automations(name)'
          )
          .eq('remote_jid', remoteJid!)
          .eq('status', 'pending')
          .not('suggestion_text', 'is', null)
          .order('created_at', { ascending: false })
          .limit(5)
      );
      return (data ?? []).map((r) => ({
        id: r.id,
        rule_id: r.rule_id,
        rule_name: r.automations?.name,
        suggestion_text: r.suggestion_text,
        recommended_tag: r.recommended_tag ?? null,
        kb_sources: Array.isArray(r.kb_sources) ? r.kb_sources : [],
        status: r.status,
        created_at: r.created_at,
        instance_name: r.instance_name,
        remote_jid: r.remote_jid,
      })) as AutomationSuggestion[];
    },
    enabled: !!remoteJid,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!remoteJid) return;
    const ch = supabase
      .channel(`automation-exec-${remoteJid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'automation_executions' },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown>;
          if (row?.remote_jid === remoteJid) void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [remoteJid, queryClient, SUGGESTIONS_KEY]);

  const accept = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'accepted', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    },
    [queryClient, SUGGESTIONS_KEY]
  );

  const dismiss = useCallback(
    async (id: string) => {
      await safeClient.from('automation_executions', (q) =>
        q.update({ status: 'dismissed', acted_at: new Date().toISOString() }).eq('id', id)
      );
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
    },
    [queryClient, SUGGESTIONS_KEY]
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
        const externalClient = getClient();
        if (externalClient) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await externalClient.rpc('rpc_upsert_contact' as any, {
            p_remote_jid: sugg.remote_jid,
            p_instance: sugg.instance_name,
            p_tags: [sugg.recommended_tag],
          });
        }
        await safeClient.from('automation_executions', (q) =>
          q.update({ applied_tags: [sugg.recommended_tag] }).eq('id', id)
        );
        toast({
          title: 'Tag aplicada',
          description: `"${sugg.recommended_tag}" foi adicionada ao contato.`,
        });
        void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
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
    [suggestions, queryClient, SUGGESTIONS_KEY]
  );

  return { suggestions, loading, refresh: refetch, accept, dismiss, applyRecommendedTag };
}
