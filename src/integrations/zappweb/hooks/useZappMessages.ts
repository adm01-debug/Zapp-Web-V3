import { useEffect, useState, useCallback, useRef } from 'react';
import { zappSupabase, ZAPPWEB_INSTANCE } from '../supabaseClient';
import type { EvolutionMessage } from '../types';
import { log } from '@/lib/logger';
import { evolutionMessageRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';

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
        .schema('evo')
        .from('evolution_messages_wpp2')
        .select(
          `id, message_id, remote_jid, from_me, message_type, content, media_url,
           media_mimetype, media_type, caption, quoted_message_id, status,
           push_name, created_at, deleted_at, edited_at, instance_name,
           contact_id, conversation_id`
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
    } catch (e: unknown) {
      log.error('[useZappMessages]', e);
      setError(e instanceof Error ? e.message : String(e));
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
          schema: 'evo',
          // publish_via_partition_root=true: events are published from the root
          // table, never from partitions. evolution_messages_wpp2 would be silent.
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const parsed = safeParseEvent(evolutionMessageRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('[useZappMessages] INSERT payload rejeitado', parsed.error);
            return;
          }
          const msg = parsed.data as EvolutionMessage; // ignore-audit: narrows Supabase query result to local interface
          if (msg.remote_jid !== remoteJid) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo',
          // publish_via_partition_root=true: use root table for realtime
          table: 'evolution_messages',
          filter: `instance_name=eq.${instance}`,
        },
        (payload) => {
          const parsed = safeParseEvent(evolutionMessageRowSchema, payload.new);
          if (!parsed.ok) {
            log.warn('[useZappMessages] UPDATE payload rejeitado', parsed.error);
            return;
          }
          const upd = parsed.data as EvolutionMessage; // ignore-audit: narrows Supabase query result to local interface
          if (upd.remote_jid !== remoteJid) return;
          setMessages((prev) => prev.map((m) => (m.id === upd.id ? { ...m, ...upd } : m)));
        }
      )
      .subscribe();
    channelRef.current = ch;
    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        zappSupabase.removeChannel(channelRef.current);
      }
    };
  }, [remoteJid, instance, fetchAll]);

  return { messages, loading, error, refetch: fetchAll };
}