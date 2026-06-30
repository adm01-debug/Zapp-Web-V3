/**
 * useMessages.ts
 * Messages hook using evolution_messages table (real schema).
 * Loads conversation messages, supports follow-up, star, important.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sanitizeText } from '@/lib/sanitize';
import { useToast } from '@/hooks/use-toast';
import { dbFrom, dbTable, dbList } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { eventBus } from '@/lib/eventBus';
import { deduplicateMessages, setLastReceived } from '@/lib/inbox/chatOptimizations';

// ── Types ───────────────────────────────────────────────

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
  status:           number;
  contact_id:       string | null;
  created_at:       string;
}

// ── Hook ─────────────────────────────────────────────────────

export function useMessages(remoteJid: string | null) {
  const { toast } = useToast();
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const PAGE_SIZE = 50;
  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const loadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
    };
  }, []);


  const mapRow = (row: Record<string, unknown>): Message => ({
    id:                String(row.id ?? ''),
    message_id:        String(row.message_id ?? ''),
    remote_jid:        String(row.remote_jid ?? ''),
    from_me:           Boolean(row.from_me ?? false),
    message_type:      String(row.message_type ?? 'text'),
    content:           row.content ? sanitizeText(row.content as string) : null,
    media_url:         row.media_url as string | null,
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
    status:            Number(row.status ?? 1), // Default to sent
    contact_id:        row.contact_id as string | null,
    created_at:        String(row.created_at ?? ''),
  });

  // ── Load ────────────────────────────────────────────

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
        p_limit:      PAGE_SIZE,
        p_offset:     0,
      });
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (error) throw error;
      const items = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
      const reversed = [...items].reverse();
      setMessages(reversed);
      setHasMore(items.length === PAGE_SIZE);
      offsetRef.current = items.length;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error('[useMessages]', err);
    } finally {
      if (!ctrl.signal.aborted && mountedRef.current) setLoading(false);
    }
  }, []);


  useEffect(() => {
    if (remoteJid) loadMessages(remoteJid);
  }, [remoteJid, loadMessages]);

  // ── Load more (older messages) ────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!remoteJid || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const { data, error } = await dbList(RPC.listMessagesLite, {
        p_remote_jid: remoteJid,
        p_limit:      PAGE_SIZE,
        p_offset:     offsetRef.current,
      });
      if (error) throw error;
      const newItems = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapRow);
      // Prepended because they are older (reversed for UI)
      const reversed = [...newItems].reverse();
      setMessages((prev) => {
        const uniqueNew = deduplicateMessages(prev, reversed);
        return [...uniqueNew, ...prev];
      });
      setHasMore(newItems.length === PAGE_SIZE);
      offsetRef.current += newItems.length;
    } finally { setLoadingMore(false); }
  }, [remoteJid, loadingMore, hasMore]);

  // ── Realtime new messages ────────────────────────────────

  useEffect(() => {
    if (!remoteJid) return;
    const channel = supabase
      .channel(`messages:${remoteJid}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table: dbTable('messages'),
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        const newMsg = mapRow(payload.new as Record<string, unknown>);
        setMessages((prev) => {
          if (prev.some(m => m.id === newMsg.id || (newMsg.message_id && m.message_id === newMsg.message_id))) {
            return prev;
          }
          
          // Track last received message if from contact
          if (!newMsg.from_me) {
            setLastReceived(newMsg.remote_jid, {
              message_id: newMsg.message_id,
              timestamp: newMsg.created_at,
              content: newMsg.content || ''
            });
          }
          
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table: dbTable('messages'),
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        setMessages((prev) => prev.map((m) =>
          m.id === payload.new.id ? mapRow(payload.new as Record<string, unknown>) : m
        ));
      })
      .on('postgres_changes', {
        event:  'DELETE',
        schema: 'public',
        table: dbTable('messages'),
        filter: `remote_jid=eq.${remoteJid}`,
      }, (payload) => {
        // payload.old traz a linha completa (REPLICA IDENTITY FULL em public.messages),
        // então o filtro por remote_jid e o id continuam disponíveis para um DELETE.
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [remoteJid]);

  // Listen for reconnection to refresh
  useEffect(() => {
    const unsub = eventBus.on('connection:recovered', () => {
      if (remoteJid) loadMessages(remoteJid);
    });
    return unsub;
  }, [remoteJid, loadMessages]);

  // ── Actions ────────────────────────────────────────────

  const toggleStar = useCallback(async (id: string, current: boolean) => {
    await dbFrom('messages').update({ is_starred: !current }).eq('id', id);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_starred: !current } : m));
  }, []);

  const toggleImportant = useCallback(async (id: string, current: boolean) => {
    await dbFrom('messages').update({ is_important: !current }).eq('id', id);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, is_important: !current } : m));
  }, []);

  const scheduleFollowUp = useCallback(async (id: string, followUpAt: string) => {
    await dbFrom('messages')
      .update({ follow_up_at: followUpAt, follow_up_done: false })
      .eq('id', id);
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, follow_up_at: followUpAt } : m));
    toast({ title: '⏰ Follow-up agendado!', duration: 2_500 });
  }, [toast]);

  const markFollowUpDone = useCallback(async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc('mark_follow_up_done', { p_message_id: id });
    if (error) throw error;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, follow_up_done: true } : m));
  }, []);

  return {
    messages, loading, loadingMore, hasMore,
    loadMessages, loadMore,
    toggleStar, toggleImportant, scheduleFollowUp, markFollowUpDone,
  };
}
