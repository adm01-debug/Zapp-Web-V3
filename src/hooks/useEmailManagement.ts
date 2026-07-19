/**
 * useEmailManagement.ts (v1.0)
 * Unified email management consolidating:
 * - useEmail: Main email account, thread, and message management
 * - useEmailDraft: Email draft management with auto-save
 * - useEmailSearch: Full-text search with local and remote sources
 * - useEmailSLA: SLA tracking for email threads
 * - useEmailSignature: Email signature management per account
 *
 * Backward compatibility maintained through re-exports of legacy hook names.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailMappers } from '@/utils/emailMappers';
import { type EmailMessage } from './gmail/gmailTypes';
import { GMAIL_MOCKS } from './gmail/gmailMocks';
import { emailSaveDraft, emailDeleteDraft, emailListThreads } from './gmail/gmailApi';
import { getLogger } from '@/lib/logger';
import { useMountedRef } from '@/hooks/useMountedRef';
import {
  EmailAccount,
  EmailTokenInfo,
  EmailThread,
  EmailSendParams,
  EmailLabel,
  SLAStatus,
} from '@/types/gmail';

const log = getLogger('EmailManagement');

// ──────────────────────────────────────────────────────────────────────────
// TYPES AND INTERFACES
// ──────────────────────────────────────────────────────────────────────────

/** Re-exported module members. */
export type { EmailAccount, EmailTokenInfo, EmailThread, EmailSendParams, EmailLabel, SLAStatus };

/** Email Token Status type alias. */
export type EmailTokenStatus = 'valid' | 'expiring_soon' | 'expired' | 'no_token';
/** Email Watch Status type alias. */
export type EmailWatchStatus = 'active' | 'expiring_soon' | 'expired' | 'no_watch';
/** Token Status type alias. */
export type TokenStatus = EmailTokenStatus;

/** Draft State interface definition. */
export interface DraftState {
  id?: string;
  email_draft_id?: string;
  to: string[];
  cc: string[];
  subject: string;
  bodyHtml: string;
  isDirty: boolean;
  lastSaved?: Date;
}

/** Email Search Result interface definition. */
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

/** Email S L A Record interface definition. */
export interface EmailSLARecord {
  thread_id: string;
  account_id: string;
  received_at: string;
  first_reply_at: string | null;
  frt_minutes: number | null;
  sla_status: SLAStatus;
  sla_threshold_minutes: number;
  warning_threshold_pct: number;
}

/** Email Signature interface definition. */
export interface EmailSignature {
  id: string;
  account_id: string;
  name: string;
  html_content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

// ──────────────────────────────────────────────────────────────────────────
// CONSTANTS AND UTILITIES
// ──────────────────────────────────────────────────────────────────────────

const supabase = _supabase;
const AUTO_SAVE_DELAY_MS = 30_000;
const DEBOUNCE_MS = 350;
const MIN_QUERY_LEN = 2;

/** Returns true when the given ID is a mock identifier (prefixed with 'mock-'), used to short-circuit real API calls. */
const isMockId = (id?: string | null): boolean => !!id && id.startsWith('mock-');

interface BaseThreadRow {
  id: string;
  gmail_thread_id?: string | null;
  gmail_account_id: string;
  is_unread?: boolean;
  message_count?: number;
  [key: string]: unknown;
}

/** Maps a raw Supabase email_threads row to a typed EmailThread, normalising field aliases and computing unread_count. */
const mapBaseThreadRow = (row: Record<string, unknown>): EmailThread =>
  emailMappers.thread({
    ...row,
    thread_id: row['id'],
    email_thread_id: row['gmail_thread_id'] != null ? String(row['gmail_thread_id']) : null,
    account_id: row['gmail_account_id'],
    unread_count: row['is_unread'] ? Math.max(Number(row['message_count'] ?? 1), 1) : 0,
  });

/** Returns a shallow copy of o with all undefined values removed, used when merging partial realtime updates. */
const definedOnly = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

interface SLAConfig {
  threshold_minutes: number;
  warning_threshold_pct: number;
  business_hours_only: boolean;
  business_start_hour?: number;
  business_end_hour?: number;
}

const DEFAULT_SLA: SLAConfig = {
  threshold_minutes: 480,
  warning_threshold_pct: 80,
  business_hours_only: true,
  business_start_hour: 8,
  business_end_hour: 18,
};

/** Computes the number of elapsed business minutes between two dates, optionally restricting to configured business hours and weekdays. */
function elapsedBusinessMinutes(from: Date, to: Date = new Date(), config?: SLAConfig): number {
  if (!config?.business_hours_only) {
    return Math.floor((to.getTime() - from.getTime()) / 60_000);
  }

  const start = config.business_start_hour ?? 8;
  const end = config.business_end_hour ?? 18;
  const minsPerDay = (end - start) * 60;

  let current = new Date(from);
  let elapsed = 0;

  while (current < to) {
    const dayOfWeek = current.getDay();
    const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5;
    const hour = current.getHours();

    if (isWorkday && hour >= start && hour < end) {
      const nextMinute = new Date(current.getTime() + 60_000);
      const effectiveTo = nextMinute < to ? nextMinute : to;
      elapsed += Math.floor((effectiveTo.getTime() - current.getTime()) / 60_000);
    }

    const nextCheck = new Date(current);
    if (!isWorkday || hour < start) {
      const targetDay = isWorkday
        ? current
        : (() => {
            const d = new Date(current);
            while (d.getDay() === 0 || d.getDay() === 6) {
              d.setDate(d.getDate() + 1);
            }
            return d;
          })();
      nextCheck.setFullYear(targetDay.getFullYear(), targetDay.getMonth(), targetDay.getDate());
      nextCheck.setHours(start, 0, 0, 0);
      if (nextCheck <= current) nextCheck.setDate(nextCheck.getDate() + 1);
    } else if (hour >= end) {
      nextCheck.setDate(nextCheck.getDate() + 1);
      nextCheck.setHours(start, 0, 0, 0);
      while (nextCheck.getDay() === 0 || nextCheck.getDay() === 6) {
        nextCheck.setDate(nextCheck.getDate() + 1);
      }
    } else {
      const remaining = (end - nextCheck.getHours()) * 60 - nextCheck.getMinutes();
      const skipMins = Math.min(remaining, 60);
      nextCheck.setTime(current.getTime() + skipMins * 60_000);
    }

    if (nextCheck <= current) break;
    current = nextCheck;
    if (elapsed > minsPerDay * 30) break;
  }

  return elapsed;
}

/** Maps elapsed business minutes against SLA thresholds to an SLAStatus of 'ok', 'warning', or 'breached'. */
function computeStatus(elapsed: number, config: SLAConfig): SLAStatus {
  if (elapsed >= config.threshold_minutes) return 'breached';
  if (elapsed >= config.threshold_minutes * (config.warning_threshold_pct / 100)) return 'warning';
  return 'ok';
}

interface EmailThreadRow {
  thread_id: string;
  last_message_at: string | null;
  unread_count: number;
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN EMAIL HOOK
// ──────────────────────────────────────────────────────────────────────────

/** Manages email accounts, threads, messages, and token lifecycle with Gmail integration. */
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
  const [nextPageToken] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const oauthInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const tokenCheckInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && mountedRef.current) setIsAuthenticated(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mountedRef.current) setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

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
      if (
        dbErr.message.includes('disponível') ||
        dbErr.message.includes('not found') ||
        dbErr.message.includes('permission denied') ||
        dbErr.message.includes('42501')
      ) {
        log.warn('Email schema unavailable — using mock accounts');
        setAccounts(GMAIL_MOCKS.accounts);
        if (GMAIL_MOCKS.accounts.length > 0) {
          setActiveAccountId((prev) => prev || GMAIL_MOCKS.accounts[0].id);
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
      if (accs.length > 0) {
        setActiveAccountId((prev) => prev || accs[0].id);
      }
    }
    setIsLoading(false);
  }, []);

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
      setMessages(Array.isArray(data) ? (data as EmailMessage[]) : []);
    }
    setIsLoadingMessages(false);
  }, []);

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

  const loadMore = useCallback(async () => {
    if (hasMore && !isLoadingThreads) {
      await loadThreads(activeAccountId || undefined, activeLabel, threads.length);
    }
  }, [hasMore, isLoadingThreads, activeAccountId, activeLabel, loadThreads, threads.length]);

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
        // Watch renewal is best-effort
      }
    },
    [activeAccountId, checkTokenStatus]
  );

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
      setThreads((prev) => prev.filter((t) => t.id !== threadId));
    }
  }, []);

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

  const startOAuth = useCallback(async () => {
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;

    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('gmail-oauth', {
        body: { action: 'getAuthUrl' },
      });

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

      let settled = false;
      let closeCheckInterval: ReturnType<typeof setInterval> | null = null;

      const cleanupListeners = () => {
        window.removeEventListener('message', handler);
        if (closeCheckInterval !== null) clearInterval(closeCheckInterval);
      };

      const handler = async (event: MessageEvent) => {
        if (settled) return;
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'gmail-oauth-error') {
          settled = true;
          cleanupListeners();
          setError(`Autorização Google negada: ${event.data.error ?? 'erro desconhecido'}`);
          oauthInFlightRef.current = false;
          return;
        }
        if (event.data?.type !== 'gmail-oauth-code') return;

        const { code, state: returnedState } = event.data;
        if (!expectedState || returnedState !== expectedState) {
          log.warn('[gmail-oauth] state inválido no callback — mensagem ignorada');
          return;
        }
        settled = true;
        cleanupListeners();

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

  useEffect(() => {
    if (!activeAccountId || isMockId(activeAccountId)) return;

    const channel = supabase
      .channel(`email-threads-email-${activeAccountId}`)
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
            const nt = mapBaseThreadRow(payload.new as Record<string, unknown>);
            setThreads((prev) => [nt, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const ut = mapBaseThreadRow(payload.new as Record<string, unknown>);
            setThreads((prev) =>
              prev.map((t) => (t.id === ut.id ? { ...t, ...definedOnly(ut) } : t))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
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

  useEffect(() => {
    if (!isAuthenticated) return;
    void checkTokenStatus();

    tokenCheckInterval.current = setInterval(
      () => {
        void checkTokenStatus();
      },
      5 * 60 * 1000
    );

    return () => {
      if (tokenCheckInterval.current) clearInterval(tokenCheckInterval.current);
    };
  }, [checkTokenStatus, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadAccounts();
  }, [loadAccounts, isAuthenticated]);

  useEffect(() => {
    if (activeAccountId && isAuthenticated) {
      void loadThreads(activeAccountId, activeLabel);
    }
  }, [activeAccountId, activeLabel, loadThreads, isAuthenticated]);

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
    unreadCount,
    slaBreachedCount,
    hasTokenWarning,
    hasWatchWarning,
    setActiveAccountId,
    setActiveLabel,
    selectThread,
    loadMore,
    startOAuth,
    disconnect,
    syncNow,
    refreshToken,
    renewWatch,
    sendEmail,
    markAsRead,
    starThread,
    archiveThread,
    assignThread,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL DRAFT HOOK
// ──────────────────────────────────────────────────────────────────────────

/** Manages email draft state with auto-save, persistence, and discard functionality. */
export function useEmailDraft(accountId: string | null, threadId?: string) {
  const [draft, setDraft] = useState<DraftState>({
    to: [],
    cc: [],
    subject: '',
    bodyHtml: '',
    isDirty: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (state: DraftState) => {
      if (!accountId || !state.isDirty) return;
      setIsSaving(true);

      try {
        const payload = {
          account_id: accountId,
          thread_id_ref: threadId ?? null,
          to_emails: state.to,
          cc_emails: state.cc,
          subject: state.subject,
          body_html: state.bodyHtml,
          last_saved_at: new Date().toISOString(),
        };

        let localId = state.id;

        if (localId) {
          await safeClient.from('email_drafts', (q) => q.update(payload).eq('id', localId));
        } else {
          const result = await safeClient.single<{ id: string }>('email_drafts', (q) =>
            q.insert(payload).select('id')
          );
          localId = result.data?.id;
        }

        const emailResult = await emailSaveDraft({
          accountId,
          draftId: state.email_draft_id,
          to: state.to,
          cc: state.cc,
          subject: state.subject,
          bodyHtml: state.bodyHtml,
          threadId,
        });

        setDraft((prev) => ({
          ...prev,
          id: localId,
          email_draft_id: emailResult.data?.draftId,
          isDirty: false,
          lastSaved: new Date(),
        }));
      } catch (err) {
        log.error('Email draft save error', err);
      } finally {
        setIsSaving(false);
      }
    },
    [accountId, threadId]
  );

  const update = useCallback(
    (patch: Partial<Omit<DraftState, 'isDirty'>>) => {
      setDraft((prev) => ({ ...prev, ...patch, isDirty: true }));

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setDraft((current) => {
          save(current);
          return current;
        });
      }, AUTO_SAVE_DELAY_MS);
    },
    [save]
  );

  const discard = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (draft.id) {
      await safeClient.from('email_drafts', (q) => q.delete().eq('id', draft.id));
    }
    if (accountId && draft.email_draft_id) {
      await emailDeleteDraft(accountId, draft.email_draft_id);
    }

    setDraft({ to: [], cc: [], subject: '', bodyHtml: '', isDirty: false });
  }, [accountId, draft]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    save(draft);
  }, [draft, save]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { draft, update, save: saveNow, discard, isSaving };
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL SEARCH HOOK
// ──────────────────────────────────────────────────────────────────────────

/** Performs full-text email search across local and remote email sources with debouncing. */
export function useEmailSearch(accountId: string | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmailSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<{ aborted: boolean }>({ aborted: false });

  const searchLocal = useCallback(
    async (q: string): Promise<EmailSearchResult[]> => {
      if (!accountId) return [];

      const ftsQuery = q.trim();

      const { data, error: dbErr } = await safeClient.from<Record<string, unknown>>(
        'email_threads',
        (q) =>
          q
            .select(
              'id, thread_id, subject, snippet, last_message_at, unread_count, email_messages!inner ( from_email, from_name )'
            )
            .eq('account_id', accountId)
            .textSearch('subject', ftsQuery, { config: 'portuguese', type: 'websearch' })
            .order('last_message_at', { ascending: false })
            .limit(20)
      );

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
    },
    [accountId]
  );

  const searchRemote = useCallback(
    async (q: string): Promise<EmailSearchResult[]> => {
      if (!accountId) return [];

      try {
        const res = await emailListThreads({ accountId, q, maxResults: 10 });
        return (res.data?.threads ?? []).map((t) => ({
          id: t.id,
          thread_id: t.id,
          subject: t.snippet.substring(0, 80),
          snippet: t.snippet,
          from_email: '',
          from_name: null,
          last_message_at: null,
          unread_count: 0,
          source: 'remote' as const,
        }));
      } catch {
        return [];
      }
    },
    [accountId]
  );

  const doSearch = useCallback(
    async (q: string) => {
      if (!q || q.length < MIN_QUERY_LEN) {
        setResults([]);
        setIsSearching(false);
        return;
      }

      const signal = { aborted: false };
      abortControllerRef.current = signal;

      setIsSearching(true);
      setError(null);

      try {
        const local = await searchLocal(q);
        if (signal.aborted) return;
        setResults(local);

        const remote = await searchRemote(q);
        if (signal.aborted) return;

        const localThreadIds = new Set(local.map((r) => r.thread_id));
        const newRemote = remote.filter((r) => !localThreadIds.has(r.thread_id));

        setResults([...local, ...newRemote]);
      } catch {
        if (!signal.aborted) setError('Erro ao buscar emails');
      } finally {
        if (!signal.aborted) setIsSearching(false);
      }
    },
    [searchLocal, searchRemote]
  );

  const handleQueryChange = useCallback(
    (q: string) => {
      setQuery(q);

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
    },
    [doSearch]
  );

  const clearSearch = useCallback(() => {
    abortControllerRef.current.aborted = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setQuery('');
    setResults([]);
    setError(null);
    setIsSearching(false);
  }, []);

  useEffect(
    () => () => {
      abortControllerRef.current.aborted = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    },
    []
  );

  return {
    query,
    results,
    isSearching,
    error,
    handleQueryChange,
    clearSearch,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL SLA HOOK
// ──────────────────────────────────────────────────────────────────────────

/** Tracks SLA metrics for email threads with configurable thresholds and status monitoring. */
export function useEmailSLA(accountId: string | null, config: Partial<SLAConfig> = {}) {
  const slaConfig: SLAConfig = { ...DEFAULT_SLA, ...config };
  const [records, setRecords] = useState<Record<string, EmailSLARecord>>({});

  const registerThread = useCallback(
    (threadId: string, receivedAt: string) => {
      const elapsed = elapsedBusinessMinutes(new Date(receivedAt), new Date(), slaConfig);

      setRecords((prev) => {
        if (prev[threadId]) return prev;
        return {
          ...prev,
          [threadId]: {
            thread_id: threadId,
            account_id: accountId ?? '',
            received_at: receivedAt,
            first_reply_at: null,
            frt_minutes: null,
            sla_status: computeStatus(elapsed, slaConfig),
            sla_threshold_minutes: slaConfig.threshold_minutes,
            warning_threshold_pct: slaConfig.warning_threshold_pct,
          },
        };
      });
    },
    [accountId, slaConfig]
  );

  const markReplied = useCallback(
    (threadId: string) => {
      setRecords((prev) => {
        const record = prev[threadId];
        if (!record || record.first_reply_at) return prev;

        const replyAt = new Date().toISOString();
        const frt = elapsedBusinessMinutes(new Date(record.received_at), new Date(), slaConfig);

        if (!isMockId(threadId)) {
          safeClient.from('email_threads', (q) =>
            q
              .update({
                first_reply_at: replyAt,
                frt_minutes: frt,
                sla_status: 'ok',
              })
              .eq('thread_id', threadId)
          );
        }

        return {
          ...prev,
          [threadId]: {
            ...record,
            first_reply_at: replyAt,
            frt_minutes: frt,
            sla_status: 'ok',
          },
        };
      });
    },
    [slaConfig]
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRecords((prev) => {
        const updated = { ...prev };
        for (const [id, record] of Object.entries(updated)) {
          if (record.first_reply_at) continue;
          const elapsed = elapsedBusinessMinutes(
            new Date(record.received_at),
            new Date(),
            slaConfig
          );
          updated[id] = { ...record, sla_status: computeStatus(elapsed, slaConfig) };
        }
        return updated;
      });
    }, 60_000);

    return () => clearInterval(interval);
  }, [slaConfig]);

  useEffect(() => {
    if (!accountId || isMockId(accountId)) return;

    safeClient
      .from<EmailThreadRow>('email_threads', (q) =>
        q
          .select('thread_id, last_message_at, unread_count')
          .eq('account_id', accountId)
          .gt('unread_count', 0)
          .order('last_message_at', { ascending: true })
          .limit(100)
      )
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.last_message_at) {
            registerThread(row.thread_id, row.last_message_at);
          }
        }
      });
  }, [accountId, registerThread]);

  const getStatus = useCallback(
    (threadId: string): SLAStatus | null => records[threadId]?.sla_status ?? null,
    [records]
  );

  const getRecord = useCallback(
    (threadId: string): EmailSLARecord | null => records[threadId] ?? null,
    [records]
  );

  const breachedCount = Object.values(records).filter((r) => r.sla_status === 'breached').length;
  const warningCount = Object.values(records).filter((r) => r.sla_status === 'warning').length;

  return {
    records,
    breachedCount,
    warningCount,
    registerThread,
    markReplied,
    getStatus,
    getRecord,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// EMAIL SIGNATURE HOOK
// ──────────────────────────────────────────────────────────────────────────

/** Manages email signatures per account with create, update, delete, and default selection capabilities. */
export function useEmailSignature(accountId: string | null) {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useMountedRef();

  const load = useCallback(async () => {
    if (!accountId) {
      setSignatures([]);
      return;
    }
    setIsLoading(true);
    const { data, error } = await safeClient.from<EmailSignature>('email_signatures', (q) =>
      q.select('*').eq('account_id', accountId).order('is_default', { ascending: false })
    );

    if (!mountedRef.current) return;
    if (!error) setSignatures(data ?? []);
    setIsLoading(false);
  }, [accountId, mountedRef]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (sig: Partial<EmailSignature> & { html_content: string; name: string }) => {
      if (!accountId) return;

      if (sig.id) {
        const { error } = await safeClient.from('email_signatures', (q) =>
          q
            .update({
              name: sig.name,
              html_content: sig.html_content,
              is_default: sig.is_default ?? false,
            })
            .eq('id', sig.id!)
        );
        if (error) {
          log.error('Email signature save error', error);
          return;
        }
      } else {
        const { error } = await safeClient.from('email_signatures', (q) =>
          q.insert({
            account_id: accountId,
            name: sig.name,
            html_content: sig.html_content,
            is_default: sig.is_default ?? false,
          })
        );
        if (error) {
          log.error('Email signature create error', error);
          return;
        }
      }

      await load();
    },
    [accountId, load]
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await safeClient.from('email_signatures', (q) => q.delete().eq('id', id));
      if (error) {
        log.error('Email signature delete error', error);
        return;
      }
      await load();
    },
    [load]
  );

  const setDefault = useCallback(
    async (id: string) => {
      if (!accountId) return;
      await safeClient.from('email_signatures', (q) =>
        q.update({ is_default: false }).eq('account_id', accountId!)
      );
      await safeClient.from('email_signatures', (q) => q.update({ is_default: true }).eq('id', id));
      await load();
    },
    [accountId, load]
  );

  const defaultSignature = signatures.find((s) => s.is_default) ?? null;

  return { signatures, defaultSignature, isLoading, save, remove, setDefault };
}

// ──────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY
// ──────────────────────────────────────────────────────────────────────────

/** Default export. */
export default {
  useEmail,
  useEmailDraft,
  useEmailSearch,
  useEmailSLA,
  useEmailSignature,
};