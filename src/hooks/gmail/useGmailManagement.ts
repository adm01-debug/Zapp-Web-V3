// Unified Gmail management module consolidating gmail sub-hooks (ETAPA 20 consolidation)
// Replaces: useEmailOAuth, useEmailSync, useEmailRealtime, useEmailThreadActions
// Note: These sub-hooks are primarily for component-level composition and are not directly
// imported by the application. useEmailManagement.ts is the recommended consolidated hook.
import { useCallback, useEffect, useRef } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import type { EmailThread, EmailLabel } from '@/types/gmail';
import { isMockId, mapBaseThreadRow, definedOnly } from './emailUtils';

const supabase = _supabase;
const log = getLogger('useGmailManagement');

// ============================================================================
// OAuth Management Section
// ============================================================================

interface UseEmailOAuthParams {
  mountedRef: React.RefObject<boolean>;
  setError: (msg: string | null) => void;
  loadAccounts: () => Promise<void>;
  checkTokenStatus: () => Promise<void>;
}

interface UseEmailOAuthResult {
  startOAuth: () => Promise<void>;
}

/** Manages the Gmail OAuth popup flow: obtains an auth URL, opens a popup, validates the CSRF state token, exchanges the code for tokens, and reloads accounts on success. */
function useEmailOAuthManagement({
  mountedRef,
  setError,
  loadAccounts,
  checkTokenStatus,
}: UseEmailOAuthParams): UseEmailOAuthResult {
  const oauthInFlightRef = useRef(false);

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
          { body: { action: 'exchangeCode', code, userId: user.id } }
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
  }, [mountedRef, setError, loadAccounts, checkTokenStatus]);

  return { startOAuth };
}

// ============================================================================
// Sync Management Section
// ============================================================================

interface UseEmailSyncParams {
  activeAccountId: string | null;
  activeLabel: EmailLabel;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  loadThreads: (accountId?: string, label?: EmailLabel, pageOffset?: number) => Promise<void>;
  checkTokenStatus: () => Promise<void>;
  setError: (msg: string | null) => void;
}

interface UseEmailSyncResult {
  syncNow: (accountId?: string) => Promise<any>;
  refreshToken: (accountId?: string) => Promise<boolean | void>;
  renewWatch: (accountId?: string) => Promise<void>;
}

/** Manages Gmail inbox synchronisation: exposes syncNow to trigger a full fetch, refreshToken to silently renew OAuth credentials, and renewWatch to extend the Pub/Sub watch subscription. */
function useEmailSyncManagement({
  activeAccountId,
  activeLabel,
  isSyncing,
  setIsSyncing,
  loadThreads,
  checkTokenStatus,
  setError,
}: UseEmailSyncParams): UseEmailSyncResult {
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
    [activeAccountId, isSyncing, activeLabel, loadThreads, checkTokenStatus, setError, setIsSyncing]
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
    [activeAccountId, checkTokenStatus, setError]
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
        // Watch renewal é best-effort
      }
    },
    [activeAccountId, checkTokenStatus]
  );

  return { syncNow, refreshToken, renewWatch };
}

// ============================================================================
// Realtime Management Section
// ============================================================================

interface UseEmailRealtimeParams {
  activeAccountId: string | null;
  setThreads: React.Dispatch<React.SetStateAction<EmailThread[]>>;
}

/** Subscribes to Supabase Realtime postgres_changes on email_threads for the active Gmail account, updating thread list state on INSERT, UPDATE, and DELETE events. */
function useEmailRealtimeManagement({ activeAccountId, setThreads }: UseEmailRealtimeParams) {
  useEffect(() => {
    if (!activeAccountId || isMockId(activeAccountId)) return;

    const channel = supabase
      .channel(`email-threads-gmail-${activeAccountId}`)
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
  }, [activeAccountId, setThreads]);
}

// ============================================================================
// Thread Actions Management Section
// ============================================================================

interface UseEmailThreadActionsParams {
  setThreads: React.Dispatch<React.SetStateAction<EmailThread[]>>;
}

interface UseEmailThreadActionsResult {
  markAsRead: (threadId: string, read?: boolean) => Promise<void>;
  starThread: (threadId: string, starred?: boolean) => Promise<void>;
  archiveThread: (threadId: string) => Promise<void>;
  assignThread: (threadId: string, agentId: string | null) => Promise<void>;
}

/** Implements thread-level email actions (mark-as-read, star, archive, assign) with optimistic local state updates followed by RPC persistence, short-circuiting to in-memory-only changes for mock thread IDs. */
function useEmailThreadActionsManagement({
  setThreads,
}: UseEmailThreadActionsParams): UseEmailThreadActionsResult {
  const markAsRead = useCallback(
    async (threadId: string, read = true) => {
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
    },
    [setThreads]
  );

  const starThread = useCallback(
    async (threadId: string, starred = true) => {
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
    },
    [setThreads]
  );

  const archiveThread = useCallback(
    async (threadId: string) => {
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
    },
    [setThreads]
  );

  const assignThread = useCallback(
    async (threadId: string, agentId: string | null) => {
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
    },
    [setThreads]
  );

  return { markAsRead, starThread, archiveThread, assignThread };
}

// ============================================================================
// Orchestration Section (Re-exports individual management functions)
// ============================================================================

/** Hook: use Gmail Management. */
export {
  useEmailOAuthManagement,
  useEmailSyncManagement,
  useEmailRealtimeManagement,
  useEmailThreadActionsManagement,
};

export type { UseEmailOAuthParams, UseEmailOAuthResult };
/** Re-exported module members. */
export type { UseEmailSyncParams, UseEmailSyncResult };
/** Re-exported module members. */
export type { UseEmailRealtimeParams };
/** Re-exported module members. */
export type { UseEmailThreadActionsParams, UseEmailThreadActionsResult };
