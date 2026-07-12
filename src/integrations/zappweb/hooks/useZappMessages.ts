import { useEffect, useState, useCallback, useRef } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionMessage } from '../types';
import { getLogger } from '@/lib/logger';

const log = getLogger('useZappMessages');

interface Options {
  remoteJid: string | null;
  instance?: string;
  limit?: number;
}

/**
 * Carrega mensagens de uma conversa + Realtime (INSERT/UPDATE).
 * UPDATE cobre: media_url preenchida pelo proxy, status sent→delivered→read,
 * deleted_at preenchido.
 */
export function useZappMessages({ remoteJid, instance = ZAPPWEB_INSTANCE, limit = 50 }: Options) {
  const [messages, setMessages] = useState<EvolutionMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof zappSupabase.channel> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!remoteJid) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: err } = await zappSupabase
        .from('evolution_messages')
        .select(
          `id, message_id, remote_jid, from_me, message_type, content, media_url,
           media_mimetype, media_type, caption, quoted_message_id, status,
           push_name, created_at, deleted_at, edited_at, instance_name,
           contact_id, conversation_id`,
        )
        .eq('instance_name', instance)
        .eq('remote_jid', remoteJid)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (err) throw err;
      // ordenar ascendente para UI tipo chat
      setMessages(((data ?? []) as unknown as EvolutionMessage[]).reverse());
      setError(null);
    } catch (e: any) {
      log.error('[useZappMessages]', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [remoteJid, instance, limit]);

  useEffect(() => {
    void fetchAll();
    if (!remoteJid) return;

    const ch = zappSupabase
      .channel(`zapp:messages:${instance}:${remoteJid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo', // FATOR X v6.2: tabela-fonte
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const msg = payload.new as EvolutionMessage;
          if (msg.remote_jid !== remoteJid) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo', // FATOR X v6.2: tabela-fonte
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const upd = payload.new as EvolutionMessage;
          if (upd.remote_jid !== remoteJid) return;
          setMessages((prev) => prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)));
        },
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) zappSupabase.removeChannel(channelRef.current);
    };
  }, [remoteJid, instance, fetchAll]);

  return { messages, loading, error, refetch: fetchAll };
}
