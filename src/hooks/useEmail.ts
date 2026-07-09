import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { safeClient } from '@/integrations/supabase/safeClient';

const log = getLogger('useEmail');

// ── Mocks de fallback para quando o schema de email não está disponível ────
const GMAIL_MOCKS = {
  accounts: [
    {
      id: 'mock-gmail-1',
      email: 'contato@promobrindes.com.br',
      provider: 'gmail' as const,
      display_name: 'Promo Brindes',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: 'mock-user',
      access_token: null,
      refresh_token: null,
      token_expiry: null,
      scopes: null,
      metadata: null,
    },
  ],
  threads: [],
};

export type EmailProvider = 'gmail' | 'outlook' | 'imap';
export type EmailLabel = 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'all';

export interface EmailAccount {
  id: string;
  email: string;
  provider: EmailProvider;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
}

export interface EmailThread {
  id: string;
  account_id: string;
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  labels: string[] | null;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  message_count: number;
  unread_count: number | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  message_id: string;
  from_email: string | null;
  from_name: string | null;
  to_emails: string[] | null;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  labels: string[] | null;
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useEmail() {
  const [accounts, setAccounts]               = useState<EmailAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [threads, setThreads]                 = useState<EmailThread[]>([]);
  const [activeThread, setActiveThread]       = useState<EmailThread | null>(null);
  const [messages, setMessages]               = useState<EmailMessage[]>([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSyncing, setIsSyncing]             = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [activeLabel, setActiveLabel]         = useState<EmailLabel>('inbox');
  const [searchQuery, setSearchQuery]         = useState('');
  const [schemaStatus, setSchemaStatus]       = useState<{ ok: boolean; lastChecked: Date | null }>({ ok: true, lastChecked: null });
  const [nextPageToken, setNextPageToken]     = useState<string | null>(null);
  const [hasMore, setHasMore]                 = useState(false);
  /**
   * AUTH GATE: tracks whether the Supabase session has been confirmed.
   * loadAccounts() and checkTokenStatus() must not fire as anon — that causes
   * 403 on public.email_accounts (anon has no SELECT), which feeds the
   * safeClient infinite loop (recordFailure -> rpc -> recordFailure).
   */
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const oauthInFlightRef                       = useRef(false);
  const mountedRef                             = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const tokenCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth gate: confirma sessao antes de qualquer chamada ao DB ─────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && mountedRef.current) setIsAuthenticated(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Carregar contas Email ───────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: dbErr } = await safeClient.from<EmailAccount>(
      'email_accounts',
      (q) => q.select('*').eq('is_active', true).order('created_at', { ascending: true })
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found') ||
          dbErr.message.includes('permission denied') || dbErr.message.includes('42501')) {
        log.warn('Email schema unavailable — using mock accounts');
        setAccounts(GMAIL_MOCKS.accounts);
        if (GMAIL_MOCKS.accounts.length > 0 && !activeAccountId) {
          setActiveAccountId(GMAIL_MOCKS.accounts[0].id);
        }
        setSchemaStatus({ ok: false, lastChecked: new Date() });
      } else {
        log.error('Erro ao carregar contas de email', dbErr);
        setError('Erro ao carregar contas de email');
        setSchemaStatus({ ok: false, lastChecked: new Date() });
      }
    } else {
      const accountList = data ?? [];
      setAccounts(accountList);
      setSchemaStatus({ ok: true, lastChecked: new Date() });
      if (accountList.length > 0 && !activeAccountId) {
        setActiveAccountId(accountList[0].id);
      }
    }
    setIsLoading(false);
  }, [activeAccountId]);

  // ── Carregar threads de um label ─────────────────────────────────────
  const loadThreads = useCallback(async (accountId: string, label: EmailLabel = 'inbox') => {
    setIsLoading(true);
    setError(null);

    const { data, error: dbErr } = await safeClient.from<EmailThread>(
      'email_threads',
      (q) => {
        let query = q
          .select('*')
          .eq('account_id', accountId)
          .order('last_message_at', { ascending: false })
          .limit(50);
        if (label !== 'all') {
          query = query.contains('labels', [label]);
        }
        return query;
      }
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found') ||
          dbErr.message.includes('permission denied') || dbErr.message.includes('42501')) {
        log.warn('Email threads schema unavailable — using empty list');
        setThreads(GMAIL_MOCKS.threads);
      } else {
        log.error('Erro ao carregar threads', dbErr);
        setError('Erro ao carregar conversas de email');
      }
    } else {
      setThreads(data ?? []);
    }
    setIsLoading(false);
  }, []);

  // ── Carregar mensagens de uma thread ─────────────────────────────────
  const loadMessages = useCallback(async (threadId: string) => {
    setIsLoadingMessages(true);

    const { data, error: dbErr } = await safeClient.from<EmailMessage>(
      'email_messages',
      (q) => q
        .select('*')
        .eq('thread_id', threadId)
        .order('sent_at', { ascending: true })
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      log.error('Erro ao carregar mensagens da thread', dbErr);
    } else {
      setMessages(data ?? []);
    }
    setIsLoadingMessages(false);
  }, []);

  // ── Verificar status do token OAuth ──────────────────────────────────
  const checkTokenStatus = useCallback(async () => {
    if (!activeAccountId) return;

    const { data, error: dbErr } = await safeClient.rpc<{ is_valid: boolean; expires_in: number }>(
      'rpc_email_token_status',
      { p_account_id: activeAccountId }
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found') ||
          dbErr.message.includes('permission denied') || dbErr.message.includes('42501')) {
        log.warn('rpc_email_token_status indisponível');
      } else {
        log.warn('Erro ao verificar status do token', dbErr);
      }
    } else if (data && !data.is_valid) {
      log.warn('Token OAuth expirado, re-autenticação necessária');
    }
  }, [activeAccountId]);

  // ── Sincronizar email via RPC ─────────────────────────────────────────
  const syncEmails = useCallback(async () => {
    if (!activeAccountId || isSyncing) return;
    setIsSyncing(true);

    const { error: dbErr } = await safeClient.rpc(
      'rpc_email_search_threads',
      { p_account_id: activeAccountId, p_query: '', p_label: activeLabel, p_limit: 50 }
    );

    if (!mountedRef.current) { setIsSyncing(false); return; }

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found') ||
          dbErr.message.includes('permission denied') || dbErr.message.includes('42501')) {
        log.warn('rpc_email_search_threads indisponível');
      } else {
        log.error('Erro ao sincronizar emails', dbErr);
        setError('Erro ao sincronizar emails');
      }
    } else {
      await loadThreads(activeAccountId, activeLabel);
    }
    setIsSyncing(false);
  }, [activeAccountId, activeLabel, isSyncing, loadThreads]);

  // ── Iniciar OAuth ─────────────────────────────────────────────────────
  const startOAuth = useCallback(async (provider: EmailProvider) => {
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;

    const { data, error: dbErr } = await safeClient.rpc<{ url: string }>(
      'rpc_email_oauth_start',
      { p_provider: provider }
    );

    oauthInFlightRef.current = false;

    if (dbErr) {
      log.error('Erro ao iniciar OAuth', dbErr);
      setError('Erro ao iniciar autenticação OAuth');
      return null;
    }

    return data?.url ?? null;
  }, []);

  // ── Buscar threads via RPC ────────────────────────────────────────────
  const searchThreads = useCallback(async (query: string) => {
    if (!activeAccountId) return;
    setIsLoading(true);

    const { data, error: dbErr } = await safeClient.rpc<EmailThread[]>(
      'rpc_email_search_threads',
      { p_account_id: activeAccountId, p_query: query, p_label: activeLabel, p_limit: 50 }
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found') ||
          dbErr.message.includes('permission denied') || dbErr.message.includes('42501')) {
        log.warn('rpc_email_search_threads indisponível');
        setThreads([]);
      } else {
        log.error('Erro na busca de threads', dbErr);
        setError('Erro na busca de emails');
      }
    } else {
      setThreads(Array.isArray(data) ? data : []);
    }
    setIsLoading(false);
  }, [activeAccountId, activeLabel]);

  // ── Marcar thread como lida ───────────────────────────────────────────
  const markAsRead = useCallback(async (threadId: string) => {
    const { error: dbErr } = await safeClient.from(
      'email_threads',
      (q) => q.update({ is_read: true, unread_count: 0 }).eq('id', threadId)
    );
    if (!dbErr) {
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_read: true, unread_count: 0 } : t));
      if (activeThread?.id === threadId) {
        setActiveThread(prev => prev ? { ...prev, is_read: true, unread_count: 0 } : null);
      }
    }
  }, [activeThread]);

  // ── Marcar thread como favorita ───────────────────────────────────────
  const toggleStar = useCallback(async (threadId: string, isStarred: boolean) => {
    const { error: dbErr } = await safeClient.from(
      'email_threads',
      (q) => q.update({ is_starred: !isStarred }).eq('id', threadId)
    );
    if (!dbErr) {
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, is_starred: !isStarred } : t));
    }
  }, []);

  // ── Abrir thread e carregar mensagens ─────────────────────────────────
  const openThread = useCallback(async (thread: EmailThread) => {
    setActiveThread(thread);
    await loadMessages(thread.id);
    if (!thread.is_read) await markAsRead(thread.id);
  }, [loadMessages, markAsRead]);

  // ── Carregar mais threads (paginação) ────────────────────────────────
  const loadMoreThreads = useCallback(async () => {
    if (!activeAccountId || !hasMore || !nextPageToken) return;
    setIsLoading(true);

    const { data, error: dbErr } = await safeClient.rpc<{ threads: EmailThread[]; next_page_token: string | null }>(
      'rpc_email_load_more_threads',
      {
        p_account_id: activeAccountId,
        p_label: activeLabel,
        p_page_token: nextPageToken,
        p_limit: 50,
      }
    );

    if (!mountedRef.current) return;

    if (!dbErr && data) {
      setThreads(prev => [...prev, ...(data.threads ?? [])]);
      setNextPageToken(data.next_page_token);
      setHasMore(!!data.next_page_token);
    }
    setIsLoading(false);
  }, [activeAccountId, activeLabel, hasMore, nextPageToken]);

  // ── Atualizar label ativo ─────────────────────────────────────────────
  const changeLabel = useCallback((label: EmailLabel) => {
    setActiveLabel(label);
    setActiveThread(null);
    setMessages([]);
    setSearchQuery('');
  }, []);

  // ── Deletar thread ───────────────────────────────────────────────────
  const deleteThread = useCallback(async (threadId: string) => {
    const { error: dbErr } = await safeClient.from(
      'email_threads',
      (q) => q.update({ labels: ['trash'] }).eq('id', threadId)
    );
    if (!dbErr) {
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) setActiveThread(null);
    }
  }, [activeThread]);

  // ── Mover thread para label ───────────────────────────────────────────
  const moveThread = useCallback(async (threadId: string, label: string) => {
    const { error: dbErr } = await safeClient.from(
      'email_threads',
      (q) => q.update({ labels: [label] }).eq('id', threadId)
    );
    if (!dbErr) {
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) setActiveThread(null);
    }
  }, [activeThread]);

  // ── Contar não lidas de uma label ─────────────────────────────────────
  const getUnreadCount = useCallback((label?: EmailLabel) => {
    if (!label || label === activeLabel) {
      return threads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0);
    }
    return threads
      .filter(t => t.labels?.includes(label))
      .reduce((sum, t) => sum + (t.unread_count ?? 0), 0);
  }, [threads, activeLabel]);

  // ── Sincronização periódica (quando muda conta ou label) ──────────────
  useEffect(() => {
    if (!activeAccountId || !isAuthenticated) return;
    void syncEmails();

    const interval = setInterval(() => {
      void syncEmails();
    }, 5 * 60 * 1000); // 5 min

    return () => clearInterval(interval);
  }, [activeAccountId, isSyncing, activeLabel, loadThreads, checkTokenStatus]);

  // ── Recarregar threads quando muda label ─────────────────────────────
  useEffect(() => {
    if (activeAccountId && isAuthenticated) {
      void loadThreads(activeAccountId, activeLabel);
    }
  }, [activeAccountId]);

  // ── Recarregar quando muda label ──────────────────────────────────────
  useEffect(() => {
    if (activeAccountId && activeLabel && isAuthenticated) {
      setThreads([]);
      void loadThreads(activeAccountId, activeLabel);
    }
  }, [activeLabel, activeAccountId, checkTokenStatus]);

  // ── Token check automático (a cada 5 minutos) — AUTH-GATED ───────────
  useEffect(() => {
    if (!isAuthenticated) return;
    void checkTokenStatus();

    tokenCheckInterval.current = setInterval(() => {
      void checkTokenStatus();
    }, 5 * 60 * 1000); // 5 minutos

    return () => {
      if (tokenCheckInterval.current) clearInterval(tokenCheckInterval.current);
    };
  }, [checkTokenStatus, isAuthenticated]);

  // ── Carregar ao montar — AUTH-GATED ─────────────────────────────────────
  useEffect(() => {
    // CRITICAL: anon has no SELECT on public.email_accounts -> 403 -> feeds
    // the safeClient recordFailure() -> rpc() -> recordFailure() infinite loop.
    if (!isAuthenticated) return;
    void loadAccounts();
  }, [loadAccounts, isAuthenticated]);

  // ── Carregar threads quando muda conta ou label — AUTH-GATED ───────────
  useEffect(() => {
    if (activeAccountId && isAuthenticated) {
      void loadThreads(activeAccountId, activeLabel);
    }
  }, [activeAccountId, activeLabel, loadThreads, isAuthenticated]);

  // ── Computed ───────────────────────────────────────────────────────────
  const unreadCount = threads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0);

  return {
    // Estado
    accounts,
    activeAccountId,
    setActiveAccountId,
    threads,
    activeThread,
    setActiveThread,
    messages,
    isLoading,
    isLoadingMessages,
    isSyncing,
    error,
    activeLabel,
    searchQuery,
    setSearchQuery,
    schemaStatus,
    nextPageToken,
    hasMore,
    unreadCount,

    // Ações
    loadAccounts,
    loadThreads,
    loadMessages,
    checkTokenStatus,
    syncEmails,
    startOAuth,
    searchThreads,
    markAsRead,
    toggleStar,
    openThread,
    loadMoreThreads,
    changeLabel,
    deleteThread,
    moveThread,
    getUnreadCount,
  };
}
