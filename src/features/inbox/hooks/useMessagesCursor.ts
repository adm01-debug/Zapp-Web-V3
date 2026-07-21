/**
 * useMessagesCursor — paginacao incremental de mensagens (FATOR X)
 *
 * Substitui o "fetch loop ate o fim" do `useMessages` por carregamento
 * cursor-based. A primeira pagina traz `pageSize` mensagens mais recentes;
 * `loadOlder()` busca a proxima pagina mais antiga usando `created_at` da
 * mensagem mais antiga ja carregada como cursor (`p_before_date`).
 *
 * Mensagens sao mantidas em ordem ASC (mais antigas primeiro), prontas para
 * renderizacao no chat. Realtime INSERT/UPDATE/DELETE sao aplicados sempre
 * sobre a "ultima pagina" (mensagens novas entram no fim) via canal
 * `evolution_messages` filtrado por `remote_jid`.
 *
 * Garantias:
 *  - `inFlightRef` previne chamadas concorrentes a `loadOlder`.
 *  - `AbortController` permite cancelar fetch in-flight (`cancelLoadOlder`).
 *  - Dedup por `id` no merge de pagina nova com paginas existentes.
 *  - Trocar `remoteJid` reseta estado e dispara nova primeira carga.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useMountedRef } from '@/hooks/useMountedRef';
import { externalSupabase, extRpcBuilder } from '@/integrations/supabase/externalClient';
import type { EvolutionMessage, EvolutionMessageLite } from '@/types/evolutionExternal';
import { toEvolutionMessageLite } from '@/types/evolutionExternal';
import { getLogger } from '@/lib/logger';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';

const log = getLogger('useMessagesCursor');

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_INSTANCE = DEFAULT_WHATSAPP_INSTANCE;

/** Options for cursor-based message pagination: target JID, Evolution instance, page size cap, and enabled flag. */
export interface UseMessagesCursorOptions {
  remoteJid: string | null;
  instanceName?: string;
  pageSize?: number;
  enabled?: boolean;
}

/** Return value of useMessagesCursor: paginated message list, loading states, and imperative controls for older-page loading and realtime message mutations. */
export interface UseMessagesCursorReturn {
  messages: EvolutionMessageLite[];
  loading: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  error: string | null;
  loadOlder: () => Promise<void>;
  cancelLoadOlder: () => void;
  refetch: () => Promise<void>;
  addMessage: (message: EvolutionMessageLite | EvolutionMessage) => void;
  updateMessage: (id: string, updates: Partial<EvolutionMessageLite>) => void;
  removeMessage: (id: string) => void;
}

function dedupeAndSort(rows: EvolutionMessageLite[]): EvolutionMessageLite[] {
  const seen = new Map<string, EvolutionMessageLite>();
  for (const r of rows) seen.set(r.id, r);
  return Array.from(seen.values()).sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/** Cursor-based incremental message loader for a WhatsApp JID; fetches the most-recent page on mount, exposes `loadOlder()` for backwards pagination, and patches state via Realtime INSERT/UPDATE/DELETE events. */
export function useMessagesCursor({
  remoteJid,
  instanceName = DEFAULT_INSTANCE,
  pageSize = DEFAULT_PAGE_SIZE,
  enabled = true,
}: UseMessagesCursorOptions): UseMessagesCursorReturn {
  const [pages, setPages] = useState<EvolutionMessageLite[][]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useMountedRef();
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const oldestCursorRef = useRef<string | null>(null);
  // Lock current contact identity so async callbacks ignore stale results.
  const remoteJidRef = useRef<string | null>(remoteJid);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  // Compute flat sorted messages from pages, deduped.
  const messages = useMemo(() => dedupeAndSort(pages.flat()), [pages]);

  const fetchPage = useCallback(
    async (beforeDate: string | null): Promise<EvolutionMessageLite[]> => {
      if (!externalSupabase || !remoteJid) return [];

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      // NOTE: usa `extRpcBuilder` (em vez de `dbList(RPC.listMessagesLite, ...)`)
      // porque precisamos do `.abortSignal()` do PostgrestBuilder — o wrapper `callExtRpc`
      // resolve a Promise antes do builder ser exposto. Caso de uso raro e justificado.
      const builder = extRpcBuilder(externalSupabase, 'rpc_list_messages_lite', {
        p_remote_jid: remoteJid,
        p_instance: instanceName,
        p_limit: pageSize,
        p_before_date: beforeDate,
      });

      // .abortSignal exists on PostgrestBuilder (Supabase v2). Tipagem dinamica
      // porque .rpc retorna FilterBuilder cuja tipagem nao expoe abortSignal
      // diretamente em todas as versoes.
      const withSignal = builder.abortSignal?.(controller.signal) ?? builder;

      const { data, error: rpcError } = (await withSignal) as { data: unknown; error: unknown };
      if (controller.signal.aborted) {
        const e = new Error('Aborted');
        e.name = 'AbortError';
        throw e;
      }
      if (rpcError) throw rpcError;

      const rows = ((data || []) as EvolutionMessageLite[]).filter((m) => !!m && !!m.id);
      // RPC retorna DESC por created_at; convertemos para ASC.
      return [...rows].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    },
    [remoteJid, instanceName, pageSize]
  );

  // First-page load (also used by refetch).
  const loadFirstPage = useCallback(async () => {
    if (!enabled || !remoteJid) {
      setPages([]);
      setHasMoreOlder(false);
      oldestCursorRef.current = null;
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchPage(null);
      if (!mountedRef.current || remoteJidRef.current !== remoteJid) return;
      setPages(rows.length ? [rows] : []);
      oldestCursorRef.current = rows[0]?.created_at ?? null;
      setHasMoreOlder(rows.length === pageSize);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') return;
      log.error('first page fetch failed', e);
      if (mountedRef.current) setError(e?.message ?? 'Failed to load messages');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, remoteJid, fetchPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset + first load whenever remoteJid changes.
  useEffect(() => {
    remoteJidRef.current = remoteJid;
    setPages([]);
    setHasMoreOlder(false);
    oldestCursorRef.current = null;
    inFlightRef.current = false;
    setLoadingOlder(false);
    if (enabled && remoteJid) {
      void loadFirstPage();
    } else {
      setLoading(false);
    }
  }, [remoteJid, instanceName, enabled, loadFirstPage]);

  const loadOlder = useCallback(async () => {
    if (!remoteJid || !hasMoreOlder || inFlightRef.current) return;
    if (!oldestCursorRef.current) return;
    inFlightRef.current = true;
    setLoadingOlder(true);
    const cursor = oldestCursorRef.current;
    try {
      const rows = await fetchPage(cursor);
      if (!mountedRef.current || remoteJidRef.current !== remoteJid) return;

      // Tie-breaker: a RPC pode usar `<` em created_at e pular mensagens com
      // timestamp identico. Filtramos client-side para garantir somente itens
      // mais antigos OU iguais ao cursor (dedupe ja remove duplicatas exatas).
      const cursorMs = new Date(cursor).getTime();
      const olderOrEq = rows.filter((m) => new Date(m.created_at).getTime() <= cursorMs);

      if (olderOrEq.length > 0) {
        setPages((prev) => [olderOrEq, ...prev]);
        oldestCursorRef.current = olderOrEq[0].created_at;
      }
      setHasMoreOlder(rows.length === pageSize);
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') return;
      log.error('loadOlder failed', e);
      if (mountedRef.current) setError(e?.message ?? 'Failed to load older messages');
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
      inFlightRef.current = false;
    }
  }, [remoteJid, hasMoreOlder, fetchPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelLoadOlder = useCallback(() => {
    if (!inFlightRef.current) return;
    abortRef.current?.abort();
    inFlightRef.current = false;
    if (mountedRef.current) setLoadingOlder(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime — only set up when enabled + jid present.
  useEffect(() => {
    if (!enabled || !remoteJid || !externalSupabase) return;

    const channel = externalSupabase
      .channel(`evolution_messages:${remoteJid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'evo', // FATOR X v6.2: tabela-fonte evo.evolution_messages
          table: 'evolution_messages',
          // v6.2: postgres_changes aceita UM filtro; instance é implícita pelo jid.
          filter: `remote_jid=eq.${remoteJid}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const raw = payload.new;
          if (!raw || typeof raw !== 'object' || !('id' in raw)) return;
          // Realtime payloads are full rows; project to lite to keep memory low.
          const m = toEvolutionMessageLite(raw as unknown as Record<string, unknown>);
          setPages((prev) => {
            for (const p of prev) {
              if (p.some((x) => x.id === m.id)) return prev;
            }
            if (prev.length === 0) return [[m]];
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), [...last, m]];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'evo', // FATOR X v6.2: tabela-fonte evo.evolution_messages
          table: 'evolution_messages',
          // v6.2: postgres_changes aceita UM filtro; instance é implícita pelo jid.
          filter: `remote_jid=eq.${remoteJid}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const raw = payload.new;
          if (!raw || typeof raw !== 'object' || !('id' in raw)) return;
          const m = toEvolutionMessageLite(raw as unknown as Record<string, unknown>);
          setPages((prev) =>
            prev.map((page) => page.map((x) => (x.id === m.id ? { ...x, ...m } : x)))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'evo', // FATOR X v6.2: tabela-fonte evo.evolution_messages
          table: 'evolution_messages',
          // v6.2: postgres_changes aceita UM filtro; instance é implícita pelo jid.
          filter: `remote_jid=eq.${remoteJid}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const id =
            payload.old && typeof payload.old === 'object'
              ? (payload.old as Record<string, unknown>).id
              : undefined;
          if (!id) return;
          setPages((prev) => prev.map((page) => page.filter((x) => x.id !== id)));
        }
      )
      .subscribe();

    return () => {
      externalSupabase.removeChannel(channel);
    };
  }, [enabled, remoteJid]);

  const addMessage = useCallback((input: EvolutionMessageLite | EvolutionMessage) => {
    const isFull =
      'payload' in (input as Record<string, unknown>) ||
      'raw_data' in (input as Record<string, unknown>);
    const m: EvolutionMessageLite = isFull
      ? toEvolutionMessageLite(input as Partial<EvolutionMessage> & { id: string })
      : (input as EvolutionMessageLite);
    setPages((prev) => {
      for (const p of prev) if (p.some((x) => x.id === m.id)) return prev;
      if (prev.length === 0) return [[m]];
      const last = prev[prev.length - 1];
      return [...prev.slice(0, -1), [...last, m]];
    });
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<EvolutionMessageLite>) => {
    setPages((prev) =>
      prev.map((page) => page.map((x) => (x.id === id ? { ...x, ...updates } : x)))
    );
  }, []);

  const removeMessage = useCallback((id: string) => {
    setPages((prev) => prev.map((page) => page.filter((x) => x.id !== id)));
  }, []);

  return {
    messages,
    loading,
    loadingOlder,
    hasMoreOlder,
    error,
    loadOlder,
    cancelLoadOlder,
    refetch: loadFirstPage,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
