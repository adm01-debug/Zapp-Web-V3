// @ts-nocheck
/**
 * useMessages.ts
 * Messages hook usando evo.evolution_messages via RPC e Realtime.
 *
 * FIXES (2026-07-03):
 *  - Realtime: assina evo.evolution_messages (BASE TABLE) não public.messages (VIEW)
 *  - Message.status: string, não number (evita NaN em payloads realtime)
 *  - toggleStar/Important: usam RPC SECURITY DEFINER, não UPDATE em VIEW
 *  - p_instance: passável do contexto da conversa para filtro multi-instância
 *  - console.error removidos: todos convertidos para getLogger (2026-07-03)
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { sanitizeText, sanitizeUrl } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';
import { dbList, dbRpc } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { eventBus } from '@/lib/eventBus';
import { deduplicateMessages, setLastReceived } from '@/lib/inbox/chatOptimizations';

const log = getLogger('useMessages');

// ── Types ──────────────────────────────────────────────

export interface Message {
  id:               string;
  message_id:       string;
  remote_jid:       string;
  from_me:          boolean;
  message_type:     string;
  content:          string | null;
  media_url:        string | null;
  media_mimetype:   string | null;
  quoted_message_id:string | null;
  is_starred:       boolean;
  is_important:     boolean;
  category:         string | null;
  sentiment:        string | null;
  tags:             string[];
  notes:            string | null;
  follow_up_at:     string | null;
  follow_up_done:   boolean;
  /**
   * status é string no banco ('sent' | 'delivered' | 'read' | 'failed').
   * Nunca use Number() neste campo — retornaria NaN para 'delivered'.
   */
  status:           string;
  contact_id:       string | null;
  instance_name:    string | null;
  created_at:       string;
  updated_at:       string;
}

// mapRow: module-level pure function — no component state deps, safe to omit from dep arrays
const mapRow = (row: Record<string, unknown>): Message => ({
  id:                String(row.id ?? ''),
  message_id:        String(row.message_id ?? ''),
  remote_jid:        String(row.remote_jid ?? ''),
  from_me:           Boolean(row.from_me ?? false),
  message_type:      String(row.message_type ?? 'text'),
  content:           row.content ? sanitizeText(row.content as string) : null,
  media_url:         row.media_url ? sanitizeUrl(row.media_url as string) || null : null,
  media_mimetype:    row.media_mimetype as string | null,
  quoted_message_id: row.quoted_message_id as string | null,
  is_starred:        Boolean(row.is_starred ?? false),
  is_important:      Boolean(row.is_important ?? false),
  category:          row.category as string | null,
  sentiment:         row.sentiment as string | null,
  tags:              Array.isArray(row.tags) ? row.tags as string[] : [],
  notes:             row.notes ? sanitizeText(row.notes as string) : null,
  follow_up_at:      row.follow_up_at as string | null,
  follow_up_done:    Boolean(row.follow_up_done ?? false),
  // status é varchar no banco — mantém como string, nunca Number()
  status:            String(row.status ?? 'delivered'),
  contact_id:        row.contact_id as string | null,
  instance_name:     row.instance_name as string | null,
  created_at:        String(row.created_at ?? ''),
  updated_at:        String(row.updated_at ?? row.created_at ?? ''),
});

// ── Hook ───────────────────────────────────────────────────────

export function useMessages(
  remoteJid: string | null,
  instanceName?: string | null,
) {
  const { toast } = useToast();
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const PAGE_SIZE = 50;
  const offsetRef   = useRef(0);
  const mountedRef = useMountedRef();
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    loadAbortRef.current?.abort();
  }, []);

  // ── Load initial page ─────────────────────────────────────────────────────

  const loadMessages = useCallback(async (jid: string) => {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;
    setLoading(true);
    setMessages([]);
    offsetRef.current = 0;
    try {
      const { data, error } = await dbList(RPC.listMessagesLite, {
        p_remote_jid: jid,
        p_instance:   instanceName ?? undefined,
        p_limit:      PAGE_SIZE,
        p_offset:     0,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (error) throw error;
      const items = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
      const reversed = [...items].reverse();
      setMessages(reversed);
      setHasMore(items.length === PAGE_SIZE);
      offsetRef.current = items.length;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      log.error('loadMessages error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (!ctrl.signal.aborted && mountedRef.current) setLoading(false);
    }
  }, [instanceName]);

  useEffect(() => {
    if (remoteJid) loadMessages(remoteJid);
  }, [remoteJid, loadMessages]);

  // ── Load more (older) ─────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!remoteJid || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await dbList(RPC.listMessagesLite, {
        p_remote_jid: remoteJid,
        p_instance:   instanceName ?? undefined,
        p_limit:      PAGE_SIZE,
        p_offset:     offsetRef.current,
      });
      if (!mountedRef.current) return;
      if (error) throw error;
      const newItems = ((data ?? []) as Record<string, unknown>[]).map(mapRow);
      const reversed = [...newItems].reverse();
      setMessages((prev) => {
        const uniqueNew = deduplicateMessages(prev, reversed);
        return [...uniqueNew, ...prev];
      });
      setHasMore(newItems.length === PAGE_SIZE);
      offsetRef.current += newItems.length;
    } catch (err) {
      log.error('loadMore error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [remoteJid, loadingMore, hasMore, instanceName, mountedRef]);

  // ── Realtime (CORRIGIDO: evo.evolution_messages BASE TABLE, não VIEW) ───

  useEffect(() => {
    if (!remoteJid) return;

    const channel = supabase
      .channel(`evo-messages:${instanceName ?? 'default'}:${remoteJid}`)
      // INSERT — nova mensagem
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'evo',
        table:  'evolution_messages',
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        const newMsg = mapRow(payload.new as Record<string, unknown>);
        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id || (newMsg.message_id && m.message_id === newMsg.message_id))) {
            return prev;
          }
          if (!newMsg.from_me) {
            setLastReceived(newMsg.remote_jid, {
              message_id: newMsg.message_id,
              timestamp:  newMsg.created_at,
              content:    newMsg.content || '',
            });
          }
          return [...prev, newMsg];
        });
      })
      // UPDATE — status, star, important, etc.
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'evo',
        table:  'evolution_messages',
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        if (!payload.new) return;
        setMessages((prev) => prev.map((m) =>
          m.id === payload.new.id ? mapRow(payload.new as Record<string, unknown>) : m
        ));
      })
      // DELETE — soft delete via deleted_at (raro mas tratado)
      .on('postgres_changes', {
        event:  'DELETE',
        schema: 'evo',
        table:  'evolution_messages',
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        const deletedId = payload?.old?.id;
        if (!deletedId) return;
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [remoteJid, instanceName]);

  // Reload após reconexão
  useEffect(() => {
    const unsub = eventBus.on('connection:recovered', () => {
      if (remoteJid) loadMessages(remoteJid);
    });
    return unsub;
  }, [remoteJid, loadMessages]);

  // ── Actions (usam RPCs SECURITY DEFINER, não UPDATE em VIEW) ──────────────────

  const toggleStar = useCallback(async (id: string, current: boolean) => {
    const newVal = !current;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_starred: newVal } : m));
    try {
      const { error } = await dbRpc(RPC.toggleMessageStar, {
        p_message_id: id,
        p_value: newVal,
      });
      if (error) throw error;
    } catch (err) {
      log.error('toggleStar error', { id, error: err instanceof Error ? err.message : String(err) });
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_starred: current } : m));
    }
  }, []);

  const toggleImportant = useCallback(async (id: string, current: boolean) => {
    const newVal = !current;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_important: newVal } : m));
    try {
      const { error } = await dbRpc(RPC.toggleMessageImportant, {
        p_message_id: id,
        p_value: newVal,
      });
      if (error) throw error;
    } catch (err) {
      log.error('toggleImportant error', { id, error: err instanceof Error ? err.message : String(err) });
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_important: current } : m));
    }
  }, []);

  const scheduleFollowUp = useCallback(async (id: string, followUpAt: string) => {
    try {
      const { error } = await dbRpc(RPC.scheduleFollowUp, {
        p_message_id:    id,
        p_follow_up_at:  followUpAt,
        p_follow_up_done: false,
      });
      if (error) throw error;
      setMessages((prev) => prev.map((m) =>
        m.id === id ? { ...m, follow_up_at: followUpAt, follow_up_done: false } : m
      ));
      toast({ title: '⏰ Follow-up agendado!', duration: 2_500 });
    } catch (err) {
      log.error('scheduleFollowUp error', { id, error: err instanceof Error ? err.message : String(err) });
    }
  }, [toast]);

  const markFollowUpDone = useCallback(async (id: string) => {
    try {
      const { error } = await dbRpc(RPC.markFollowUpDone, { p_message_id: id });
      if (error) throw error;
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, follow_up_done: true } : m));
    } catch (err) {
      log.error('markFollowUpDone error', { id, error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return {
    messages, loading, loadingMore, hasMore,
    loadMessages, loadMore,
    toggleStar, toggleImportant, scheduleFollowUp, markFollowUpDone,
  };
}