import { useEffect, useState, useCallback } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionConversation } from '../types';
import { getLogger } from '@/lib/logger';

const log = getLogger('useZappConversations');

interface Options {
  instance?: string;
  status?: 'aberta' | 'arquivada';
  limit?: number;
}

/**
 * Lista conversas (sidebar) com dados embutidos do contato + Realtime
 * para reatualização imediata em INSERT/UPDATE.
 */
export function useZappConversations(opts: Options = {}) {
  const instance = opts.instance ?? ZAPPWEB_INSTANCE;
  const status = opts.status ?? 'aberta';
  const limit = opts.limit ?? 50;

  const [conversations, setConversations] = useState<EvolutionConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const { data, error: err } = await zappSupabase
        .from('evolution_conversations')
        .select(
          `id, remote_jid, contact_id, status, unread_count, last_message_content,
           last_message_type, last_message_at, last_inbound_at, assigned_to,
           priority, instance_name,
           evolution_contacts ( id, push_name, full_name, phone_number,
             profile_picture_url, lead_status, company, tags )`,
        )
        .eq('instance_name', instance)
        .eq('status', status)
        .order('last_message_at', { ascending: false })
        .limit(limit);
      if (err) throw err;
      setConversations((data ?? []) as unknown as EvolutionConversation[]);
      setError(null);
    } catch (e: any) {
      log.error('[useZappConversations]', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [instance, status, limit]);

  useEffect(() => {
    void fetchAll();
    const ch = zappSupabase
      .channel(`zapp:conversations:${instance}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'evo',
          table: 'evolution_conversations',
          filter: `instance_name=eq.${instance}`,
        },
        () => fetchAll(),
      )
      .subscribe();
    return () => {
      zappSupabase.removeChannel(ch);
    };
  }, [instance, fetchAll]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await zappSupabase
      .from('evolution_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId);
  }, []);

  return { conversations, loading, error, refetch: fetchAll, markAsRead };
}
