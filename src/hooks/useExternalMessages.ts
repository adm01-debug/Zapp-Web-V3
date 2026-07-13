import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { useQueryClient } from '@tanstack/react-query';
import { evolutionToRealtimeMessage, jidToPhone } from '@/adapters/evolutionAdapter';
import type { EvolutionMessage } from '@/types/evolutionExternal';
import type { RealtimeMessage } from '@/features/inbox';
import { getLogger } from '@/lib/logger';
import { dedupedFetch, subscribeDedupe } from '@/lib/realtime/crossTabDedupe';
import {
  POLL_INTERVAL,
  DEFAULT_INSTANCE,
  CONVERSATION_PAGE_SIZE,
  fetchMessagesByJid,
  fetchMessagesAfter,
} from './evolutionFetchers';
import { OPTIMISTIC_PREFIX, applyReconciliation } from './evolutionReconcile';

const log = getLogger('useExternalMessages');

export function useExternalMessages(remoteJid: string | null) {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const previousJidRef = useRef<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);
  const loadOlderAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      if (loadOlderAbortRef.current) {
        loadOlderAbortRef.current.abort();
        loadOlderAbortRef.current = null;
      }
    },
    []
  );

  const cancelLoadOlder = useCallback(() => {
    if (loadOlderAbortRef.current) {
      loadOlderAbortRef.current.abort();
      loadOlderAbortRef.current = null;
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [mountedRef]);

  const getContactAvatar = useCallback(
    (jid: string) => {
      type WithAvatar = { avatar_url?: string | null };
      return (
        queryClient.getQueryData<WithAvatar>(['contact', jid])?.avatar_url ||
        queryClient.getQueryData<WithAvatar>(['external-evolution', 'contact', jid])?.avatar_url
      );
    },
    [queryClient]
  );

  const initialFetch = useCallback(async () => {
    if (!remoteJid || !mountedRef.current) {
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const evoMessages = await dedupedFetch(
        `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`,
        () => fetchMessagesByJid(remoteJid, CONVERSATION_PAGE_SIZE),
        { lockTtl: 10_000, resultTtl: 15_000, waitTimeout: 8_000 }
      );
      if (!mountedRef.current) return;
      if (previousJidRef.current !== remoteJid) return;

      const mapped = evoMessages.map(evolutionToRealtimeMessage);
      const currentAvatar = getContactAvatar(remoteJid);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        const filteredWithAvatar = filteredPrev.map((m) =>
          m.id.startsWith(OPTIMISTIC_PREFIX) ? { ...m, contactAvatar: currentAvatar } : m
        );
        const merged = [...filteredWithAvatar, ...additionsWithAvatar];
        return merged.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      });
      setHasMore(evoMessages.length === CONVERSATION_PAGE_SIZE);
      lastSeenRef.current = evoMessages.length
        ? evoMessages[evoMessages.length - 1].created_at
        : null;
    } catch (err) {
      log.error('Error fetching external messages:', err);
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [remoteJid, mountedRef, getContactAvatar]);

  const pollNewMessages = useCallback(async () => {
    if (!remoteJid || !mountedRef.current) return;
    const afterDate = lastSeenRef.current;
    if (!afterDate) return;

    try {
      const newOnes = await dedupedFetch(
        `inbox:poll:${remoteJid}:${afterDate}:${DEFAULT_INSTANCE}:${jidToPhone(remoteJid)}`,
        () => fetchMessagesAfter(remoteJid, afterDate),
        { lockTtl: 4_000, resultTtl: POLL_INTERVAL - 1_000, waitTimeout: 3_000 }
      );
      if (!mountedRef.current || newOnes.length === 0) return;

      const mapped = newOnes.map(evolutionToRealtimeMessage);
      const currentAvatar = getContactAvatar(remoteJid);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        const additionsWithAvatar = additions.map((m) => ({ ...m, contactAvatar: currentAvatar }));
        return [...filteredPrev, ...additionsWithAvatar];
      });
      lastSeenRef.current = newOnes[newOnes.length - 1].created_at;
    } catch (err) {
      log.error('Error polling external messages:', err);
    }
  }, [remoteJid, mountedRef, getContactAvatar]);

  const loadOlder = useCallback(async () => {
    if (!remoteJid || !mountedRef.current || loadingOlder || !hasMore) return;
    if (messages.length === 0) return;

    const oldest = messages[0]?.created_at;
    if (!oldest) return;

    if (loadOlderAbortRef.current) {
      loadOlderAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadOlderAbortRef.current = controller;

    try {
      setLoadingOlder(true);
      const dedupeKey = `older:${remoteJid}:${oldest}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`;
      const older = await dedupedFetch(
        dedupeKey,
        () => fetchMessagesByJid(remoteJid, CONVERSATION_PAGE_SIZE, oldest, controller.signal),
        { lockTtl: 10_000, resultTtl: 30_000, waitTimeout: 8_000 }
      );
      if (!mountedRef.current || controller.signal.aborted) return;

      const mapped = older.map(evolutionToRealtimeMessage);
      if (mapped.length === 0) {
        setHasMore(false);
        return;
      }

      setMessages((prev) => {
        if (controller.signal.aborted) return prev;
        const seen = new Set(prev.map((m) => m.id));
        const additions = mapped.filter((m) => !seen.has(m.id));
        return [...additions, ...prev];
      });
      setHasMore(older.length === CONVERSATION_PAGE_SIZE);
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'AbortError') return;
      log.error('Error loading older messages:', err);
    } finally {
      if (loadOlderAbortRef.current === controller) {
        loadOlderAbortRef.current = null;
      }
      if (mountedRef.current) setLoadingOlder(false);
    }
  }, [remoteJid, messages, loadingOlder, hasMore, mountedRef]);

  // Initial fetch on jid change
  useEffect(() => {
    if (remoteJid !== previousJidRef.current) {
      previousJidRef.current = remoteJid;
      lastSeenRef.current = null;
      setHasMore(true);
      setMessages([]);
      void initialFetch();
    }
  }, [remoteJid, initialFetch]);

  // Cursor-forward polling
  useEffect(() => {
    if (!remoteJid) return;
    const interval = setInterval(pollNewMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [remoteJid, pollNewMessages]);

  // Cross-tab sync via BroadcastChannel
  useEffect(() => {
    if (!remoteJid) return;
    const jidPrefixes = [
      `inbox:initial:${remoteJid}:${CONVERSATION_PAGE_SIZE}:${DEFAULT_INSTANCE}`,
      `inbox:poll:${remoteJid}:`,
      `older:${remoteJid}:`,
    ];
    const matcher = new RegExp(
      `^(${jidPrefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
    );

    const unsub = subscribeDedupe<EvolutionMessage[]>(matcher, (key, data, source) => {
      if (source === 'local') return;
      if (!mountedRef.current || !Array.isArray(data) || data.length === 0) return;

      const isOlder = key.startsWith(`older:${remoteJid}:`);
      const ordered = isOlder ? data.slice().reverse() : data;
      const mapped = ordered.map(evolutionToRealtimeMessage);

      applyReconciliation(setMessages, mapped, (filteredPrev, additions) => {
        if (key.startsWith(`inbox:initial:${remoteJid}:`)) {
          if (filteredPrev.length === 0) {
            lastSeenRef.current = mapped[mapped.length - 1]?.created_at ?? null;
            return additions;
          }
          return [...filteredPrev, ...additions].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        }
        if (isOlder) return [...additions, ...filteredPrev];
        const next = [...filteredPrev, ...additions];
        lastSeenRef.current = additions[additions.length - 1]?.created_at ?? lastSeenRef.current;
        return next;
      });
      if (key.startsWith(`inbox:initial:${remoteJid}:`) && mountedRef.current) {
        setLoading(false);
      }
    });
    return unsub;
  }, [remoteJid, mountedRef]);

  const addMessage = useCallback((message: RealtimeMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      if (message.external_id && prev.some((m) => m.external_id === message.external_id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const updateMessage = useCallback((messageId: string, updates: Partial<RealtimeMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)));
  }, []);

  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    error,
    refetch: initialFetch,
    loadOlder,
    cancelLoadOlder,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
