/**
 * useEmail.ts — Hook principal de gerenciamento Email
 *
 * Funcionalidades completas:
 * - Carrega contas Email ativas
 * - Monitora status de tokens via rpc_email_token_status
 * - Sincronização via email-sync Edge Function
 * - Carrega threads com filtro de label
 * - Star/unstar, archive, assign a agente
 * - Marcar como lida/não lida
 * - Envio de emails via email-send
 * - Realtime subscription nas threads
 * - Refresh automático de tokens expirados
 * - Watch renewal check
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailMappers } from '@/utils/emailMappers';
import { type EmailMessage } from './gmail/gmailTypes';
import { GMAIL_MOCKS } from './gmail/gmailMocks';
import { getLogger } from '@/lib/logger';
import {
  EmailAccount,
  EmailTokenInfo,
  EmailThread,
  EmailSendParams,
  EmailLabel,
  SLAStatus,
} from '@/types/gmail';

const log = getLogger('useEmail');

export type { EmailAccount, EmailTokenInfo, EmailThread, EmailSendParams, EmailLabel, SLAStatus };

export type EmailTokenStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_token';
export type EmailWatchStatus = 'active' | 'expiring_soon' | 'expired' | 'no_watch';
export type TokenStatus = EmailTokenStatus;

const supabase = _supabase;

/**
 * IDs vindos do fallback GMAIL_MOCKS (ex.: 'mock-account-123') não existem no
 * banco e não são UUIDs — chamadas de rede com eles geram 400/22P02 em loop.
 */
const isMockId = (id?: string | null): boolean => !!id && id.startsWith('mock-');

/**
 * A tabela-base email_app.email_threads não possui as colunas derivadas da view
 * pública (thread_id, email_thread_id, account_id, unread_count). Este adapter
 * replica exatamente as expressões da view para payloads de realtime.
 */
const mapBaseThreadRow = (row: any): EmailThread =>
  emailMappers.thread({
    ...row,
    thread_id: row.id,
    email_thread_id: row.gmail_thread_id != null ? String(row.gmail_thread_id) : null,
    account_id: row.gmail_account_id,
    unread_count: row.is_unread ? Math.max(row.message_count ?? 1, 1) : 0,
  });

/**
 * Remove chaves undefined antes do spread de UPDATE: o mapper materializa
 * todas as chaves do EmailThread, e um spread cru sobrescreveria campos que
 * a linha-base nao possui (ex.: contact) com undefined, apagando estado
 * previamente carregado via RPC.
 */
const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

// ── Hook Principal ─────────────────────────────────────────────────────

export function useEmail() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [tokenStatus, setTokenStatus] = useState<EmailTokenInfo[]>([]);
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<EmailLabel>('INBOX');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<{ ok: boolean; lastChecked: Date | null }>({
    ok: true,
    lastChecked: null,
  });
  const [nextPageToken, _setNextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const oauthInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const tokenCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Carregar contas Email ───────────────────────────────────────────
  const loadAccounts = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const {
      data,
      error: dbErr,
      requestId,
    } = await safeClient.from('email_accounts', (q) =>
      q
        .select('id, user_id, email, display_name, is_active, token_expiry, watch_expiry')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found')) {
        log.warn('Email schema unavailable — using mock accounts');
        setAccounts(GMAIL_MOCKS.accounts);
        if (GMAIL_MOCKS.accounts.length > 0 && !activeAccountId) {
          setActiveAccountId(GMAIL_MOCKS.accounts[0].id);
        }
        setSchemaStatus({ ok: false, lastChecked: new Date() });
      } else {
        setLastRequestId(requestId || null);
        setError(`Não foi possível carregar as contas Email. ${dbErr.message}`);
      }
    } else {
      setSchemaStatus({ ok: true, lastChecked: new Date() });
      const accs = emailMappers.accounts(Array.isArray(data) ? data : []);
      setAccounts(accs);
      if (accs.length > 0 && !activeAccountId) {
        setActiveAccountId(accs[0].id);
      }
    }
    setIsLoading(false);
  }, [activeAccountId]);

  // ── Verificar status dos tokens ────────────────────────────────────
  const checkTokenStatus = useCallback(async () => {
    const { data, error: rpcErr } = await safeClient.rpc('rpc_email_token_status');
    if (!mountedRef.current) return;
    if (rpcErr && (rpcErr.message.includes('disponível') || rpcErr.message.includes('not found'))) {
      setTokenStatus(GMAIL_MOCKS.tokenStatus);
    } else if (!rpcErr && data) {
      const tokenInfos = emailMappers.tokenInfos(Array.isArray(data) ? data : []);
      setTokenStatus(tokenInfos);

      const statusMap: Record<string, string> = {};
      tokenInfos.forEach((s) => {
        statusMap[s.account_id] = s.token_status;
      });
    }
  }, []);

  // ── Carregar threads ──────────────────────────────────────────────
  const loadThreads = useCallback(
    async (accountId?: string, label: EmailLabel = 'INBOX', pageOffset = 0) => {
      const id = accountId ?? activeAccountId;
      if (!id || isMockId(id)) return;

      setIsLoadingThreads(true);
      const {
        data,
        error: rpcErr,
        requestId,
      } = await safeClient.rpc('rpc_email_search_threads', {
        p_account_id: id,
        p_query: null,
        p_label_id: label,
        p_limit: 50,
        p_offset: pageOffset,
      });

      if (!mountedRef.current) return;

      if (rpcErr) {
        if (rpcErr.message.includes('disponível') || rpcErr.message.includes('not found')) {
          log.warn('Email schema unavailable — using mock threads');
          setThreads(GMAIL_MOCKS.threads);
          setHasMore(false);
        } else {
          setLastRequestId(requestId || null);
          setError(`Erro ao carregar mensagens do Email. ${rpcErr.message}`);
        }
      } else {
        setSchemaStatus({ ok: true, lastChecked: new Date() });
        const mappedThreads = emailMappers.threads(Array.isArray(data) ? data : []);
        setThreads((prev) => (pageOffset > 0 ? [...prev, ...mappedThreads] : mappedThreads));
        setHasMore(mappedThreads.length === 50);
      }
      setIsLoadingThreads(false);
    },
    [activeAccountId]
  );

  // ── Carregar mensagens de uma thread ────────────────────────────────
  const loadMessages = useCallback(async (threadId: string) => {
    if (isMockId(threadId)) {
      setMessages(GMAIL_MOCKS.messages.filter((m) => m.thread_id === threadId));
      return;
    }
    setIsLoadingMessages(true);
    const { data, error: dbErr } = await safeClient.from('email_messages', (q) =>
      q.select('*').eq('thread_id', threadId).order('date', { ascending: true })
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found')) {
        setMessages(GMAIL_MOCKS.messages.filter((m) => m.thread_id === threadId));
      } else {
        log.error('Email messages load error', dbErr);
      }
    } else {
      setMessages(Array.isArray(data) ? data : []);
    }
    setIsLoadingMessages(false);
  }, []);

  // ── Selecionar thread ───────────────────────────────────────────
  const selectThread = useCallback(
    async (thread: EmailThread | null) => {
      setSelectedThread(thread);
      if (thread) {
        await loadMessages(thread.id);
      } else {
        setMessages([]);
      }
    },
    [loadMessages]
  );

  // ── Carregar mais threads (Paginação) ───────────────────────────────
  const loadMore = useCallback(async () => {
    if (hasMore && !isLoadingThreads) {
      await loadThreads(activeAccountId || undefined, activeLabel, threads.length);
    }
  }, [hasMore, isLoadingThreads, activeAccountId, activeLabel, loadThreads, threads.length]);

  // ── Sincronizar inbox via email-sync ───────────────────────────────
  const syncNow = useCallback(
    async (accountId?: string) => {
      const id = accountId ?? activeAccountId;
      if (!id || isMockId(id) || isSyncing) return;

      setIsSyncing(true);
      setError(null);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
          body: { action: 'syncInbox', accountId: id, maxResults: 100 },
        });

        if (fnErr) throw new Error('Falha ao sincronizar Email');

        await Promise.all([loadThreads(id, activeLabel), checkTokenStatus()]);

        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSyncing(false);
      }
    },
    [activeAccountId, isSyncing, activeLabel, loadThreads, checkTokenStatus]
  );

  // ── Renovar token manualmente ────────────────────────────────────
  const refreshToken = useCallback(
    async (accountId?: string) => {
      const id = accountId ?? activeAccountId;
      if (!id || isMockId(id)) return;

      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-oauth', {
          body: { action: 'refreshToken', accountId: id },
        });

        if (fnErr || !data?.success) {
          setError('Token expirado — reconecte sua conta Email nas configurações.');
          return false;
        }

        await checkTokenStatus();
        return true;
      } catch {
        return false;
      }
    },
    [activeAccountId, checkTokenStatus]
  );

  // ── Renovar Pub/Sub watch ───────────────────────────────────────
  const renewWatch = useCallback(
    async (accountId?: string) => {
      const id = accountId ?? activeAccountId;
      if (!id || isMockId(id)) return;

      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-webhook', {
          body: { action: 'renewWatch', accountId: id },
        });

        if (!fnErr && data?.success) {
          await checkTokenStatus();
        }
      } catch {
        // Watch renewal é best-effort
      }
    },
    [activeAccountId, checkTokenStatus]
  );

  // ── Enviar email ──────────────────────────────────────────────
  const sendEmail = useCallback(
    async (params: EmailSendParams): Promise<{ success: boolean; error?: string }> => {
      if (!activeAccountId) return { success: false, error: 'Nenhuma conta Email ativa' };
      if (isMockId(activeAccountId)) {
        return {
          success: false,
          error: 'Conta de demonstração — conecte uma conta real para enviar emails.',
        };
      }

      setIsSending(true);
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-send', {
          body: {
            action: 'send',
            accountId: activeAccountId,
            to: Array.isArray(params.to) ? params.to : [params.to],
            cc: params.cc ? (Array.isArray(params.cc) ? params.cc : [params.cc]) : undefined,
            bcc: params.bcc ? (Array.isArray(params.bcc) ? params.bcc : [params.bcc]) : undefined,
            subject: params.subject,
            body: params.bodyHtml,
            threadId: params.threadId,
            inReplyTo: params.inReplyTo,
            addSignature: params.signature !== false,
          },
        });

        if (fnErr || !data?.success) return { success: false, error: 'Falha ao enviar email' };
        return { success: true };
      } finally {
        setIsSending(false);
      }
    },
    [activeAccountId]
  );

  // ── Marcar thread como lida/não lida ──────────────────────────────
  const markAsRead = useCallback(async (threadId: string, read = true) => {
    if (isMockId(threadId)) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, unread_count: read ? 0 : t.unread_count || 1 } : t
        )
      );
      return;
    }
    const { error: rpcErr } = await safeClient.rpc('rpc_email_mark_thread_read', {
      p_thread_id: threadId,
      p_read: read,
      p_message_ids: null,
    });

    if (!rpcErr) {
      setThreads((prev) =>
        prev.map((t) =>
          t.id === threadId ? { ...t, unread_count: read ? 0 : t.unread_count || 1 } : t
        )
      );
    }
  }, []);

  // ── Star/Unstar thread ───────────────────────────────────────────
  const starThread = useCallback(async (threadId: string, starred = true) => {
    if (isMockId(threadId)) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, is_starred: starred } : t))
      );
      return;
    }
    const { error: rpcErr } = await safeClient.rpc('rpc_email_star_thread', {
      p_thread_id: threadId,
      p_starred: starred,
    });

    if (!rpcErr) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, is_starred: starred } : t))
      );
    }
  }, []);

  // ── Archive thread ─────────────────────────────────────────────
  const archiveThread = useCallback(async (threadId: string) => {
    if (isMockId(threadId)) {
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
      return;
    }
    const { error: rpcErr } = await safeClient.rpc('rpc_email_archive_thread', {
      p_thread_id: threadId,
      p_archived: true,
    });

    if (!rpcErr) {
      // Remover da inbox atual
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    }
  }, []);

  // ── Assign thread a agente ───────────────────────────────────────
  const assignThread = useCallback(async (threadId: string, agentId: string | null) => {
    if (isMockId(threadId)) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, assigned_to: agentId } : t))
      );
      return;
    }
    const { error: rpcErr } = await safeClient.rpc('rpc_email_assign_thread', {
      p_thread_id: threadId,
      p_agent_id: agentId,
    });

    if (!rpcErr) {
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, assigned_to: agentId } : t))
      );
    } else {
      log.warn('Email thread assign error', rpcErr.message);
    }
  }, []);

  // ── Desconectar conta ──────────────────────────────────────────
  const disconnect = useCallback(
    async (accountId: string) => {
      if (!isMockId(accountId)) {
        await safeClient.from('email_accounts', (q) =>
          q.update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', accountId)
        );
      }

      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      if (activeAccountId === accountId) {
        setActiveAccountId(null);
        setThreads([]);
      }
    },
    [activeAccountId]
  );

  // ── OAuth: iniciar fluxo de conexão ─────────────────────────────────
  const startOAuth = useCallback(async () => {
    // Guarda contra clique duplo / chamadas concorrentes: sem isto, dois
    // listeners 'message' ficariam ativos e ambos tentariam exchangeCode
    // com o MESMO code de uso único, fazendo a 2ª tentativa falhar no servidor.
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;

    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'getAuthUrl' },
      });

      if (fnErr || !data?.authUrl) {
        setError('Erro ao obter URL de autorização Google. Verifique GOOGLE_CLIENT_ID.');
        oauthInFlightRef.current = false;
        return;
      }

      const popup = window.open(data.authUrl, 'email_oauth', 'width=500,height=600,scrollbars=yes');
      if (!popup) {
        setError('Popup bloqueado. Permita popups para este site.');
        oauthInFlightRef.current = false;
        return;
      }

      // `settled` evita que o poll de popup.closed e o handler de mensagem
      // disparem cleanup duas vezes (ex.: a mensagem já fechou o popup via
      // popup?.close() — sem essa flag, o próximo tick do poll veria
      // popup.closed===true e tentaria limpar de novo, possivelmente
      // resetando oauthInFlightRef no meio de um exchangeCode ainda em voo).
      let settled = false;
      let closeCheckInterval: ReturnType<typeof setInterval> | null = null;

      const cleanupListeners = () => {
        window.removeEventListener('message', handler);
        if (closeCheckInterval !== null) clearInterval(closeCheckInterval);
      };

      // Escutar callback do popup.
      // Protocolo real do backend gmail-oauth (callback GET):
      //   { type: 'gmail-oauth-code',  code }   -> trocar code por tokens (exchangeCode)
      //   { type: 'gmail-oauth-error', error }  -> falha (ex.: usuário negou consentimento)
      const handler = async (event: MessageEvent) => {
        if (settled) return;
        if (event.data?.type === 'gmail-oauth-error') {
          settled = true;
          cleanupListeners();
          setError(`Autorização Google negada: ${event.data.error ?? 'erro desconhecido'}`);
          oauthInFlightRef.current = false;
          return;
        }
        if (event.data?.type !== 'gmail-oauth-code') return;
        settled = true;
        cleanupListeners();

        const { code } = event.data;
        if (!code) {
          oauthInFlightRef.current = false;
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          oauthInFlightRef.current = false;
          if (mountedRef.current) setError('Sessão expirada. Faça login novamente.');
          return;
        }

        const { data: exchangeData, error: exchangeErr } = await supabase.functions.invoke(
          'gmail-oauth',
          {
            body: { action: 'exchangeCode', code, userId: user.id },
          }
        );

        if (exchangeErr || !exchangeData?.success) {
          oauthInFlightRef.current = false;
          if (mountedRef.current) setError('Falha na autenticação Google. Tente novamente.');
          return;
        }

        await loadAccounts();
        await checkTokenStatus();
        oauthInFlightRef.current = false;
      };

      window.addEventListener('message', handler);

      // Detecta o usuário fechando o popup MANUALMENTE (sem completar o
      // fluxo) — sem isto, a guarda de concorrência acima travaria o botão
      // "Conectar" para sempre, já que nenhuma mensagem chegaria para
      // resetar oauthInFlightRef. Em try/catch porque navegadores com
      // Cross-Origin-Opener-Policy estrita podem bloquear o acesso a
      // popup.closed; nesse caso simplesmente tentamos de novo no próximo
      // tick em vez de derrubar a sessão.
      closeCheckInterval = setInterval(() => {
        if (settled) {
          if (closeCheckInterval !== null) clearInterval(closeCheckInterval);
          return;
        }
        let closed = false;
        try {
          closed = popup.closed;
        } catch {
          closed = false;
        }
        if (closed) {
          settled = true;
          cleanupListeners();
          oauthInFlightRef.current = false;
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      oauthInFlightRef.current = false;
    }
  }, [loadAccounts, checkTokenStatus]);

  // ── Realtime subscription nas threads ──────────────────────────────
  useEffect(() => {
    if (!activeAccountId || isMockId(activeAccountId)) return;

    // A view public.email_threads não emite eventos WAL. Assinamos a tabela-base
    // email_app.email_threads (presente na publication supabase_realtime) e
    // adaptamos o payload ao shape da view via mapBaseThreadRow.
    const channel = supabase
      .channel(`email-threads-${activeAccountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'email_app',
          table: 'email_threads',
          filter: `gmail_account_id=eq.${activeAccountId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nt = mapBaseThreadRow(payload.new);
            setThreads((prev) => [nt, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const ut = mapBaseThreadRow(payload.new);
            setThreads((prev) =>
              prev.map((t) => (t.id === ut.id ? { ...t, ...definedOnly(ut) } : t))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Record<string, unknown>)?.id;
            if (!deletedId) return;
            setThreads((prev) => prev.filter((t) => t.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId]);

  // ── Token check automático (a cada 5 minutos) ──────────────────────────
  useEffect(() => {
    void checkTokenStatus();

    tokenCheckInterval.current = setInterval(
      () => {
        void checkTokenStatus();
      },
      5 * 60 * 1000
    ); // 5 minutos

    return () => {
      if (tokenCheckInterval.current) clearInterval(tokenCheckInterval.current);
    };
  }, [checkTokenStatus]);

  // ── Carregar ao montar ──────────────────────────────────────────
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // ── Carregar threads quando muda conta ou label ──────────────────────────
  useEffect(() => {
    if (activeAccountId) {
      void loadThreads(activeAccountId, activeLabel);
    }
  }, [activeAccountId, activeLabel, loadThreads]);

  // ── Computed ───────────────────────────────────────────────────
  const unreadCount = threads.reduce((sum, t) => sum + (t.unread_count ?? 0), 0);
  const slaBreachedCount = threads.filter((t) => t.sla_status === 'breached').length;
  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;
  const activeTokenInfo = tokenStatus.find((t) => t.account_id === activeAccountId) ?? null;
  const hasTokenWarning =
    activeTokenInfo?.token_status === 'expiring_soon' ||
    activeTokenInfo?.token_status === 'expired';
  const hasWatchWarning =
    activeTokenInfo?.watch_status === 'expiring_soon' ||
    activeTokenInfo?.watch_status === 'expired';

  return {
    // Estado
    accounts,
    tokenStatus,
    threads,
    selectedThread,
    messages,
    activeAccountId,
    activeAccount,
    activeLabel,
    activeTokenInfo,
    isLoading,
    isLoadingThreads,
    isLoadingMessages,
    isSyncing,
    isSending,
    hasMore,
    error,
    lastRequestId,
    schemaStatus,
    nextPageToken,
    // Contadores
    unreadCount,
    slaBreachedCount,
    hasTokenWarning,
    hasWatchWarning,
    // Ações de configuração
    setActiveAccountId,
    setActiveLabel,
    selectThread,
    loadMore,
    // Ações de conta
    startOAuth,
    disconnect,
    syncNow,
    refreshToken,
    renewWatch,
    // Ações de thread
    sendEmail,
    markAsRead,
    starThread,
    archiveThread,
    assignThread,
  };
}
