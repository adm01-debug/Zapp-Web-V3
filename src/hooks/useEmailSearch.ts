/**
 * useEmailSearch.ts — Busca full-text em emails (local + Email API)
 *
 * Estratégia dual:
 * 1. Busca local imediata no Supabase (FTS via tsvector) — < 100ms
 * 2. Busca remota na Email API para resultados não sincronizados — async
 *
 * NOTA: Sem dependência de use-debounce — usa setTimeout nativo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
const supabase = _supabase as any;
import { emailListThreads } from './gmail/gmailApi';

export interface EmailSearchResult {
  id: string;
  thread_id: string;
  subject: string;
  snippet: string;
  from_email: string;
  from_name: string | null;
  last_message_at: string | null;
  unread_count: number;
  source: 'local' | 'remote';
}

const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 2;

export function useEmailSearch(accountId: string | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmailSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<{ aborted: boolean }>({ aborted: false });

  const searchLocal = useCallback(async (q: string): Promise<EmailSearchResult[]> => {
    if (!accountId) return [];

    // Normaliza para FTS websearch
    const ftsQuery = q.trim();

    const { data, error: dbErr } = await (supabase as any) /* TS2589: schema 678 */
      .from('email_threads')
      .select(`
        id,
        thread_id,
        subject,
        snippet,
        last_message_at,
        unread_count,
        email_messages!inner ( from_email, from_name )
      `)
      .eq('account_id', accountId)
      .textSearch('subject', ftsQuery, { config: 'portuguese', type: 'websearch' })
      .order('last_message_at', { ascending: false })
      .limit(20);

    if (dbErr) return [];

    return (data ?? []).map((row: Record<string, unknown>) => {
      const msgs = Array.isArray(row.email_messages) ? row.email_messages : [];
      const first = (msgs[0] ?? {}) as Record<string, unknown>;
      return {
        id: row.id as string,
        thread_id: row.thread_id as string,
        subject: (row.subject as string) ?? '(sem assunto)',
        snippet: (row.snippet as string) ?? '',
        from_email: (first.from_email as string) ?? '',
        from_name: (first.from_name as string | null) ?? null,
        last_message_at: row.last_message_at as string | null,
        unread_count: (row.unread_count as number) ?? 0,
        source: 'local' as const,
      };
    });
  }, [accountId]);

  const searchRemote = useCallback(async (q: string): Promise<EmailSearchResult[]> => {
    if (!accountId) return [];

    try {
      const res = await emailListThreads({ accountId, q, maxResults: 10 });
      return (((res as any).threads as Record<string, unknown>[]) ?? []).map((t) => ({
        id: String(t.id ?? ''),
        thread_id: String(t.id ?? ''),
        subject: String(t.snippet ?? '').substring(0, 80),
        snippet: String(t.snippet ?? ''),
        from_email: '',
        from_name: null,
        last_message_at: null,
        unread_count: 0,
        source: 'remote' as const,
      }));
    } catch {
      return [];
    }
  }, [accountId]);

  const doSearch = useCallback(async (q: string) => {
    if (!q || q.length < MIN_QUERY_LEN) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    // Marca esta instância de busca como "atual"
    const signal = { aborted: false };
    abortControllerRef.current = signal;

    setIsSearching(true);
    setError(null);

    try {
      // Fase 1: local imediato
      const local = await searchLocal(q);
      if (signal.aborted) return;
      setResults(local);

      // Fase 2: remoto async
      const remote = await searchRemote(q);
      if (signal.aborted) return;

      // Deduplica resultados remotos vs locais
      const localThreadIds = new Set(local.map(r => r.thread_id));
      const newRemote = remote.filter(r => !localThreadIds.has(r.thread_id));

      setResults([...local, ...newRemote]);
    } catch {
      if (!signal.aborted) setError('Erro ao buscar emails');
    } finally {
      if (!signal.aborted) setIsSearching(false);
    }
  }, [searchLocal, searchRemote]);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);

    // Cancela busca anterior
    abortControllerRef.current.aborted = true;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!q || q.length < MIN_QUERY_LEN) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      doSearch(q);
    }, DEBOUNCE_MS);
  }, [doSearch]);

  const clearSearch = useCallback(() => {
    abortControllerRef.current.aborted = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setQuery('');
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  // Cleanup ao desmontar
  useEffect(() => () => {
    abortControllerRef.current.aborted = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  return {
    query,
    results,
    isSearching,
    error,
    handleQueryChange,
    clearSearch,
  };
}
