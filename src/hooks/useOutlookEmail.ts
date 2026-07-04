/**
 * useOutlookEmail.ts — Hook para integração com Outlook via Microsoft Graph API
 *
 * Suporte completo ao Outlook/Office 365 sem IMAP TCP.
 * Usa a Edge Function outlook-oauth que chama Microsoft Graph API.
 *
 * Requer no Supabase:
 *   MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET configurados
 *
 * Fluxo OAuth2:
 * 1. startOAuth() → abre popup com URL de autorização Microsoft
 * 2. Usuário faz login e autoriza
 * 3. Callback troca o code por tokens e salva em imap_smtp_accounts
 * 4. syncInbox() busca mensagens via Graph API
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';



export interface OutlookMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  from: { emailAddress: { address: string; name?: string } };
  toRecipients: Array<{ emailAddress: { address: string; name?: string } }>;
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  conversationId: string;
}

export interface OutlookAccount {
  id: string;
  email: string;
  is_active: boolean;
  provider: string;
}

export function useOutlookEmail() {
  const [accounts, setAccounts] = useState<OutlookAccount[]>([]);
  const [messages, setMessages] = useState<OutlookMessage[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextLink, setNextLink] = useState<string | null>(null);
  const mountedRef = useMountedRef();
  const oauthHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => () => {
    if (oauthHandlerRef.current) {
      window.removeEventListener('message', oauthHandlerRef.current);
      oauthHandlerRef.current = null;
    }
  }, []);

  // Carrega contas Outlook existentes
  const loadAccounts = useCallback(async () => {
    const { data, error: dbErr } = await dbFrom('imap_smtp_accounts')
      .select('id, email, is_active, provider')
      .eq('provider', 'outlook')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (!dbErr && data && mountedRef.current) {
      setAccounts(data);
      if (data.length > 0 && !activeAccountId) {
        setActiveAccountId(data[0].id);
      }
    }
  }, [activeAccountId, mountedRef]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Iniciar fluxo OAuth com Microsoft
  const startOAuth = useCallback(async () => {
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('outlook-oauth', {
        body: { action: 'getAuthUrl' },
      });

      if (fnErr || !data?.authUrl) {
        setError('Erro ao obter URL de autorização Microsoft. Verifique MICROSOFT_CLIENT_ID nas env vars.');
        return;
      }

      // Abre popup OAuth
      const popup = window.open(data.authUrl, 'outlook_oauth', 'width=500,height=600,scrollbars=yes');
      if (!popup) {
        setError('Popup bloqueado. Por favor, permita popups para este site.');
        return;
      }

      // Escuta mensagem do popup após redirect
      const handler = async (event: MessageEvent) => {
        if (event.data?.type !== 'outlook_oauth_callback') return;
        window.removeEventListener('message', handler);
        oauthHandlerRef.current = null;

        const { code } = event.data;
        if (!code) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mountedRef.current) return;

        const { data: exchangeData, error: exchangeErr } = await supabase.functions.invoke('outlook-oauth', {
          body: { action: 'exchangeCode', code, userId: user.id },
        });

        if (!mountedRef.current) return;

        if (exchangeErr || !exchangeData?.success) {
          setError('Falha ao autenticar com Microsoft. Tente novamente.');
          return;
        }

        await loadAccounts();
      };

      oauthHandlerRef.current = handler;
      window.addEventListener('message', handler);

    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadAccounts]);

  // Sincronizar inbox do Outlook
  const syncInbox = useCallback(async (accountId?: string, link?: string) => {
    const id = accountId ?? activeAccountId;
    if (!id) return;

    setIsSyncing(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('outlook-oauth', {
        body: { action: 'syncInbox', accountId: id, pageSize: 50, nextLink: link },
      });

      if (fnErr || !data) throw new Error('Falha ao sincronizar inbox Outlook');

      if (mountedRef.current) {
        setMessages(prev => link ? [...prev, ...data.messages] : data.messages);
        setNextLink(data.nextLink ?? null);
      }
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mountedRef.current) setIsSyncing(false);
    }
  }, [activeAccountId, mountedRef]);

  // Enviar email
  const sendEmail = useCallback(async (params: {
    to: string | string[];
    cc?: string | string[];
    subject: string;
    bodyHtml: string;
  }) => {
    if (!activeAccountId) return { success: false, error: 'Nenhuma conta Outlook ativa' };

    const { data, error: fnErr } = await supabase.functions.invoke('outlook-oauth', {
      body: {
        action: 'sendMessage',
        accountId: activeAccountId,
        ...params,
      },
    });

    if (fnErr || !data?.success) {
      return { success: false, error: 'Falha ao enviar email' };
    }

    return { success: true };
  }, [activeAccountId]);

  // Marcar como lida
  const markAsRead = useCallback(async (messageId: string, isRead = true) => {
    if (!activeAccountId) return;
    await supabase.functions.invoke('outlook-oauth', {
      body: { action: 'markAsRead', accountId: activeAccountId, messageId, isRead },
    });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isRead } : m));
  }, [activeAccountId]);

  // Busca corpo completo de uma mensagem
  const getMessageBody = useCallback(async (messageId: string) => {
    if (!activeAccountId) return null;
    const { data, error: fnErr } = await supabase.functions.invoke('outlook-oauth', {
      body: { action: 'getMessageBody', accountId: activeAccountId, messageId },
    });
    if (fnErr || !data?.message) return null;
    return data.message;
  }, [activeAccountId]);

  // Desconectar conta
  const disconnect = useCallback(async (accountId: string) => {
    await dbFrom('imap_smtp_accounts').update({ is_active: false }).eq('id', accountId);
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    if (activeAccountId === accountId) setActiveAccountId(null);
  }, [activeAccountId]);

  // Auto-sync quando muda conta ativa
  useEffect(() => {
    if (activeAccountId) {
      syncInbox(activeAccountId);
    }
  }, [activeAccountId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unreadCount = messages.filter(m => !m.isRead).length;

  return {
    accounts,
    messages,
    activeAccountId,
    setActiveAccountId,
    isLoading,
    isSyncing,
    error,
    nextLink,
    unreadCount,
    startOAuth,
    syncInbox,
    sendEmail,
    markAsRead,
    getMessageBody,
    disconnect,
    loadMore: () => nextLink ? syncInbox(undefined, nextLink) : undefined,
  };
}
