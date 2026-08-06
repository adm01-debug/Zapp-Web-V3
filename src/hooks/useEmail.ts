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
import { useQuery } from '@tanstack/react-query';
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

// ── Cache module-level (TTL 5min) ─────────────────────────────────────────
// email_accounts é config quase-estática (muda via Gmail OAuth/admin) — evita
// refetch a cada mount da página de email. Chamadas pós-mutação (OAuth
// connect/revoke) passam `force=true` e ignoram o cache.
const EMAIL_ACCOUNTS_TTL_MS = 5 * 60 * 1000;
let emailAccountsCache: { accounts: EmailAccount[]; fetchedAt: number } | null = null;

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
const mapBaseThreadRow = (row: Record<string, unknown>): EmailThread =>
  emailMappers.thread({
    ...row,
    thread_id: row.id,
    email_thread_id: row.gmail_thread_id != null ? String(row.gmail_thread_id) : null,
    account_id: row.gmail_account_id,
    unread_count: row.is_unread ? Math.max(Number(row.message_count ?? 1), 1) : 0,
  });

/**
 * Remove chaves undefined antes do spread de UPDATE: o mapper materializa
 * todas as chaves do EmailThread, e um spread cru sobrescreveria campos que
 * a linha-base nao possui (ex.: contact) com undefined, apagando estado
 * previamente carregado via RPC.
 */
const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/**
 * Mapeia uma linha da tabela gmail_messages (escrita por gmail-sync) para o
 * EmailMessage da UI. gmail-sync persiste body_html/body_plain completos —
 * não há ação fetchMessageBody na edge (o enum é listThreads/syncFull/
 * syncLabels); o corpo já vem no registro.
 */
const mapGmailMessageRow = (row: Record<string, unknown>): EmailMessage => ({
  id: (row.id as string) ?? (row.message_id as string),
  thread_id: (row.thread_id_ref as string) ?? '',
  email_msg_id: (row.message_id as string) ?? '',
  message_id: row.message_id as string,
  from_email: row.from_email as string | null,
  from_name: row.from_name as string | null,
  to_emails: (row.to_emails as string[] | null) ?? [],
  cc_emails: (row.cc_emails as string[] | null) ?? [],
  subject: row.subject as string | null,
  snippet: row.snippet as string | null,
  body_html: row.body_html as string | null,
  body_text: (row.body_plain as string | null) ?? null,
  body_plain: row.body_plain as string | null,
  is_read: (row.is_read ?? false) as boolean,
  is_sent: (row.is_sent ?? false) as boolean,
  date: (row.internal_date as string | null) ?? null,
  internal_date: row.internal_date as string | null,
  has_attachments: (row.has_attachments ?? false) as boolean,
  in_reply_to: null,
  references: null,
  label_ids: (row.label_ids as string[] | undefined) ?? [],
  created_at: (row.created_at as string) ?? '',
});

// ── Hook Principal ─────────────────────────────────────────────────────

export function useEmail() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
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

  // ── Carregar contas Email ───────────────────────────────────────────
  const loadAccounts = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);

    // TTL 5min: email_accounts é quase-estático — evita refetch a cada mount.
    // `force` (pós OAuth connect) ignora o cache.
    const cached =
      !force && emailAccountsCache && Date.now() - emailAccountsCache.fetchedAt < EMAIL_ACCOUNTS_TTL_MS
        ? emailAccountsCache
        : null;

    if (cached) {
      if (!mountedRef.current) return;
      setAccounts(cached.accounts);
      if (cached.accounts.length > 0 && !activeAccountId) {
        setActiveAccountId(cached.accounts[0].id);
      }
      setIsLoading(false);
      return;
    }

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
      const accs = emailMappers.accounts(
        (Array.isArray(data) ? data : []) as Parameters<typeof emailMappers.accounts>[0]
      );
      emailAccountsCache = { accounts: accs, fetchedAt: Date.now() };
      setAccounts(accs);
      if (accs.length > 0 && !activeAccountId) {
        setActiveAccountId(accs[0].id);
      }
    }
    setIsLoading(false);
  }, [activeAccountId]);

  // ── Status dos tokens (auto-refresh a cada 5 minutos) ──────────────
  const { data: tokenStatus = [], refetch: refetchTokenStatus } = useQuery({
    queryKey: ['email-token-status'],
    queryFn: async () => {
      const { data, error: rpcErr } = await safeClient.rpc('rpc_email_token_status');
      if (
        rpcErr &&
        (rpcErr.message.includes('disponível') || rpcErr.message.includes('not found'))
      ) {
        return GMAIL_MOCKS.tokenStatus;
      }
      if (!rpcErr && data) {
        return emailMappers.tokenInfos(Array.isArray(data) ? data : []);
      }
      return [] as EmailTokenInfo[];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
  });

  const checkTokenStatus = useCallback(async () => {
    await refetchTokenStatus();
  }, [refetchTokenStatus]);

  // ── Carregar threads ──────────────────────────────────────────────
  // EMAIL-03: a store email_app.email_threads (lida por rpc_email_search_threads)
  // nunca é alimentada — gmail-sync persiste em gmail_threads (store REAL,
  // view zapp.gmail_threads com GRANT authenticated). Leitura direta na tabela
  // real com filtro de label (contains em label_ids[]) e paginação por range.
  const loadThreads = useCallback(
    async (accountId?: string, label: EmailLabel = 'INBOX', pageOffset = 0) => {
      const id = accountId ?? activeAccountId;
      if (!id || isMockId(id)) return;

      setIsLoadingThreads(true);
      const {
        data,
        error: dbErr,
        requestId,
      } = await safeClient.from('gmail_threads', (q) =>
        q
          .select('*')
          .eq('account_id', id)
          .contains('label_ids', [label])
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .range(pageOffset, pageOffset + 49)
      );

      if (!mountedRef.current) return;

      if (dbErr) {
        if (dbErr.message.includes('disponível') || dbErr.message.includes('not found')) {
          log.warn('Email schema unavailable — using mock threads');
          setThreads(GMAIL_MOCKS.threads);
          setHasMore(false);
        } else {
          setLastRequestId(requestId || null);
          setError(`Erro ao carregar mensagens do Email. ${dbErr.message}`);
        }
      } else {
        setSchemaStatus({ ok: true, lastChecked: new Date() });
        const mappedThreads = (Array.isArray(data) ? data : []).map((row) =>
          emailMappers.gmailThread(row as Record<string, unknown>)
        );
        setThreads((prev) => (pageOffset > 0 ? [...prev, ...mappedThreads] : mappedThreads));
        setHasMore(mappedThreads.length === 50);
      }
      setIsLoadingThreads(false);
    },
    [activeAccountId]
  );

  // ── Carregar mensagens de uma thread ────────────────────────────────
  // Contrato real (gmail-sync@v1): a edge grava gmail_threads/gmail_messages.
  // A view email_messages NÃO é alimentada por gmail-sync — ler dela retorna
  // sempre vazio. Resolve o id da thread em gmail_threads (thread_id do Gmail)
  // e lê o corpo completo já persistido em gmail_messages (body_html/body_plain).
  const loadMessages = useCallback(async (thread: EmailThread | null) => {
    if (!thread || isMockId(thread.id)) {
      setMessages(
        thread && isMockId(thread.id)
          ? GMAIL_MOCKS.messages.filter((m) => m.thread_id === thread.id)
          : []
      );
      return;
    }
    setIsLoadingMessages(true);

    const gmailThreadId = thread.thread_id || thread.email_thread_id || thread.id;
    const accountId = thread.account_id ?? '';

    const { data: gmailThread } = await safeClient.from('gmail_threads', (q) =>
      q.select('id').eq('account_id', accountId).eq('thread_id', gmailThreadId).maybeSingle()
    );
    const refId =
      gmailThread && typeof gmailThread === 'object' && 'id' in gmailThread
        ? String((gmailThread as { id: unknown }).id)
        : thread.id;

    const { data, error: dbErr } = await safeClient.from('gmail_messages', (q) =>
      q.select('*').eq('thread_id_ref', refId).order('internal_date', { ascending: true })
    );

    if (!mountedRef.current) return;

    if (dbErr) {
      if (dbErr.message.includes('disponível') || dbErr.message.includes('not found')) {
        setMessages(GMAIL_MOCKS.messages.filter((m) => m.thread_id === thread.id));
      } else {
        log.error('Email messages load error', dbErr);
      }
    } else {
      setMessages(
        (Array.isArray(data) ? data : []).map((row) =>
          mapGmailMessageRow(row as Record<string, unknown>)
        )
      );
    }
    setIsLoadingMessages(false);
  }, []);

  // ── Selecionar thread ───────────────────────────────────────────
  const selectThread = useCallback(
    async (thread: EmailThread | null) => {
      setSelectedThread(thread);
      if (thread) {
        await loadMessages(thread);
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
          // Contrato gmail-sync@v1: não existe action 'syncInbox' (enum:
          // listThreads/syncFull/syncLabels) — syncFull persiste mensagens.
          body: { action: 'syncFull', accountId: id, labelIds: ['INBOX'], maxResults: 100 },
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
          body: { action: 'refresh', accountId: id },
        });

        if (fnErr || !data?.access_token) {
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
          // Contrato gmail-webhook@v1: a ação é 'registerWatch' (não existe
          // 'renewWatch' — action desconhecida cai no branch de push e no-ops).
          body: { action: 'registerWatch', accountId: id },
        });

        if (!fnErr && data?.ok) {
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
            // Contrato gmail-send@v1: o corpo vai em bodyHtml (a edge ignora
            // o campo `body` e o flag addSignature — assinatura é responsabilidade
            // do front, ver EmailChatReplyBar EMAIL-05).
            bodyHtml: params.bodyHtml,
            threadId: params.threadId,
            inReplyTo: params.inReplyTo,
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

      // Contrato gmail-oauth@v1: getAuthUrl devolve { url, state } (NÃO authUrl).
      if (fnErr || !data?.url) {
        setError('Erro ao obter URL de autorização Google. Verifique GOOGLE_CLIENT_ID.');
        oauthInFlightRef.current = false;
        return;
      }

      const expectedState = data.state as string | undefined;

      const popup = window.open(data.url, 'email_oauth', 'width=500,height=600,scrollbars=yes');
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

        const { code, state: returnedState } = event.data;
        if (!code) {
          oauthInFlightRef.current = false;
          return;
        }
        // gmail-oauth@v1: exchangeCode valida o state HMAC — sem ele a edge
        // responde 403 ("Invalid or missing OAuth state").
        if (!expectedState || returnedState !== expectedState) {
          log.warn('[gmail-oauth] state inválido no callback — mensagem ignorada');
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
            body: { action: 'exchangeCode', code, userId: user.id, state: expectedState },
          }
        );

        if (exchangeErr || !exchangeData?.success) {
          oauthInFlightRef.current = false;
          if (mountedRef.current) setError('Falha na autenticação Google. Tente novamente.');
          return;
        }

        await loadAccounts(true); // pós-OAuth: ignora cache, conta nova
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
      .channel(`email-threads-${activeAccountId}:${Math.random().toString(36).slice(2, 10)}`)
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
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [activeAccountId]);

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
