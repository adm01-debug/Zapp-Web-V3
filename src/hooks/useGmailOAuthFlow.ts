// Re-export from consolidated useIntegrationManagement module (ETAPA 42 consolidation)
import { useGmailOAuthFlowManagement } from '@/hooks/useIntegrationManagement';
import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailRefreshToken, emailRegisterWatch, emailRevokeAccount } from '@/hooks/gmail/gmailApi';
import { emailMappers } from '@/utils/emailMappers';

const log = getLogger('useEmailOAuthFlow');

// 5 minutos antes da expiração → refresh proativo
const REFRESH_AHEAD_MS = 5 * 60 * 1000;
// Intervalo de verificação do token
const CHECK_INTERVAL_MS = 60 * 1000;

export type TokenStatus = 'loading' | 'valid' | 'expiring' | 'expired' | 'disconnected';

export interface EmailAccount {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  picture_url: string | null;
  token_expiry: string | null;
  is_active: boolean;
  created_at: string;
  watch_expiry?: string | null;
}

interface UseEmailOAuthFlowReturn {
  accounts: EmailAccount[];
  tokenStatus: Record<string, TokenStatus>;
  isLoading: boolean;
  startOAuth: () => void;
  disconnect: (accountId: string) => Promise<void>;
  refreshNow: (accountId: string) => Promise<void>;
  ensureWatch: (accountId: string) => Promise<void>;
}

export function useGmailOAuthFlow() {
  return useGmailOAuthFlowManagement();
}

export function useEmailOAuthFlow(): UseEmailOAuthFlowReturn {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [tokenStatus, setTokenStatus] = useState<Record<string, TokenStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const refreshingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const oauthInFlightRef = useRef(false);
  const oauthCleanupRef = useRef<(() => void) | null>(null);

  // ── Carrega contas ──────────────────────────────────────────────────

  const loadAccounts = useCallback(async () => {
    const { data, error } = await safeClient.from<Record<string, unknown>>('email_accounts', (q) =>
      q
        .select(
          'id, user_id, email:email_address, display_name, picture_url, token_expiry:token_expires_at, is_active, created_at'
        )
        .eq('is_active', true)
        .order('created_at')
    );

    if (error) {
      log.error('Erro ao carregar contas Email', error);
      return;
    }

    setAccounts(emailMappers.accounts(data ?? []));
    setIsLoading(false);
  }, []);

  // ── Calcula status do token ─────────────────────────────────────────

  const computeStatuses = useCallback((accs: EmailAccount[]) => {
    const now = Date.now();
    const statuses: Record<string, TokenStatus> = {};

    for (const acc of accs) {
      const expiry = new Date(acc.token_expiry).getTime();
      if (expiry < now) {
        statuses[acc.id] = 'expired';
      } else if (expiry - now < REFRESH_AHEAD_MS) {
        statuses[acc.id] = 'expiring';
      } else {
        statuses[acc.id] = 'valid';
      }
    }

    setTokenStatus(statuses);
    return statuses;
  }, []);

  // ── Refresh de token ────────────────────────────────────────────────

  const refreshNow = useCallback(async (accountId: string) => {
    if (refreshingRef.current.has(accountId)) return;
    refreshingRef.current.add(accountId);

    setTokenStatus((prev) => ({ ...prev, [accountId]: 'loading' }));

    try {
      const result = await emailRefreshToken(accountId);

      // Atualiza token_expiry local
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === accountId ? { ...a, token_expiry: result.data?.expiresAt ?? a.token_expiry } : a
        )
      );
      setTokenStatus((prev) => ({ ...prev, [accountId]: 'valid' }));

      log.info(`Token refreshed for account ${accountId}, expires at ${result.data?.expiresAt}`);
    } catch (err) {
      log.error(`Falha ao refreshar token para conta ${accountId}`, err);
      setTokenStatus((prev) => ({ ...prev, [accountId]: 'expired' }));
      toast.error('Sessão Email expirada', {
        description: 'Reconecte sua conta Email nas configurações.',
        duration: 8000,
      });
    } finally {
      refreshingRef.current.delete(accountId);
    }
  }, []);

  // ── Auto-refresh loop ───────────────────────────────────────────────

  const checkAndRefresh = useCallback(
    async (accs: EmailAccount[]) => {
      const statuses = computeStatuses(accs);

      for (const acc of accs) {
        const status = statuses[acc.id];
        if (status === 'expiring' || status === 'expired') {
          await refreshNow(acc.id);
        }
      }
    },
    [computeStatuses, refreshNow]
  );

  // ── Ensure Pub/Sub watch ────────────────────────────────────────────

  const ensureWatch = useCallback(
    async (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc) return;

      // Renova watch se faltam menos de 24h para expirar
      const watchExpiry = acc.watch_expiry ? new Date(acc.watch_expiry).getTime() : 0;
      const renewThreshold = 24 * 60 * 60 * 1000;

      if (!acc.watch_expiry || watchExpiry - Date.now() < renewThreshold) {
        try {
          const result = await emailRegisterWatch(accountId);
          setAccounts((prev) =>
            prev.map((a) =>
              a.id === accountId
                ? { ...a, watch_expiry: result.data?.watchExpiry ?? a.watch_expiry }
                : a
            )
          );
          log.info(
            `Pub/Sub watch renovado para ${accountId}, expira em ${result.data?.watchExpiry}`
          );
        } catch (err) {
          log.warn(`Não foi possível renovar watch para ${accountId}`, err);
        }
      }
    },
    [accounts]
  );

  // ── OAuth initiate ──────────────────────────────────────────────────

  const startOAuth = useCallback(() => {
    // Guarda contra clique duplo / chamadas concorrentes: sem isto, dois
    // listeners 'message' ficariam ativos e ambos tentariam exchangeCode
    // com o MESMO code de uso único, fazendo a 2ª tentativa falhar no servidor.
    if (oauthInFlightRef.current) return;
    oauthInFlightRef.current = true;

    // Monta URL de autorização (Edge Function email-oauth retorna a URL)
    supabase.functions
      .invoke('gmail-oauth', { body: { action: 'getAuthUrl' } })
      .then(({ data, error }) => {
        if (error || !data?.url) {
          toast.error('Não foi possível iniciar a autenticação Email');
          oauthInFlightRef.current = false;
          return;
        }
        // Abre popup OAuth
        const popup = window.open(data.url, 'email-oauth', 'width=500,height=600,scrollbars=yes');
        if (!popup) {
          toast.error('Popup bloqueado. Permita popups para este site.');
          oauthInFlightRef.current = false;
          return;
        }

        // `settled` evita cleanup duplo entre o poll de popup.closed e o
        // handler de mensagem (ex.: a mensagem já fechou o popup via
        // popup?.close() — sem essa flag, o próximo tick do poll veria
        // popup.closed===true e tentaria limpar de novo).
        let settled = false;
        let closeCheckInterval: ReturnType<typeof setInterval> | null = null;

        const cleanupListeners = () => {
          window.removeEventListener('message', onMessage);
          if (closeCheckInterval !== null) clearInterval(closeCheckInterval);
          oauthCleanupRef.current = null;
        };
        oauthCleanupRef.current = cleanupListeners;

        // Listener para message do popup.
        // Protocolo real do backend gmail-oauth (callback GET):
        //   { type: 'gmail-oauth-code',  code }   -> trocar code por tokens (exchangeCode)
        //   { type: 'gmail-oauth-error', error }  -> falha
        const onMessage = async (event: MessageEvent) => {
          if (settled) return;
          const msg = event.data;
          if (msg?.type === 'gmail-oauth-error') {
            settled = true;
            cleanupListeners();
            popup?.close();
            toast.error('Falha na autenticação Email', { description: String(msg.error ?? '') });
            oauthInFlightRef.current = false;
            return;
          }
          if (msg?.type !== 'gmail-oauth-code') return; // mensagem de outra origem/tipo: ignora, sem remover o listener
          settled = true;
          cleanupListeners();
          popup?.close();
          if (!msg.code) {
            toast.error('Código de autorização ausente na resposta do Google.');
            oauthInFlightRef.current = false;
            return;
          }
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
              toast.error('Sessão expirada. Faça login novamente.');
              return;
            }
            // exchangeCode exige { code, userId } (ver supabase/functions/gmail-oauth)
            const { data: result, error: exErr } = await supabase.functions.invoke('gmail-oauth', {
              body: { action: 'exchangeCode', code: msg.code, userId: user.id },
            });
            if (exErr || result?.error) {
              toast.error('Não foi possível concluir a conexão Email', {
                description: String(exErr?.message ?? result?.error ?? ''),
              });
              return;
            }
            await loadAccounts();
            toast.success(`Conta Email conectada${result?.email ? `: ${result.email}` : ''}`);
          } catch (err) {
            log.error('Erro ao concluir OAuth Email', err);
            toast.error('Erro ao concluir a autenticação Email');
          } finally {
            oauthInFlightRef.current = false;
          }
        };
        window.addEventListener('message', onMessage);

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
      });
  }, [loadAccounts]);

  // ── Disconnect ───────────────────────────────────────────────────

  const disconnect = useCallback(async (accountId: string) => {
    try {
      await emailRevokeAccount(accountId);
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      setTokenStatus((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
      toast.success('Conta Email desconectada');
    } catch (err) {
      log.error('Erro ao desconectar conta Email', err);
      toast.error('Não foi possível desconectar a conta Email');
    }
  }, []);

  // ── Effects ───────────────────────────────────────────────────

  // Carga inicial
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // Realtime: recarregar quando conta muda
  useEffect(() => {
    const channel = supabase
      .channel('email_accounts_changes')
      .on('postgres_changes', { event: '*', schema: 'email_app', table: 'email_accounts' }, () =>
        loadAccounts()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [loadAccounts]);

  // Auto-refresh timer
  useEffect(() => {
    if (accounts.length === 0) return;

    checkAndRefresh(accounts);

    timerRef.current = setInterval(() => {
      checkAndRefresh(accounts);
    }, CHECK_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [accounts, checkAndRefresh]);

  // Ensure Pub/Sub watch para todas as contas ativas
  useEffect(() => {
    for (const acc of accounts) {
      ensureWatch(acc.id);
    }
  }, [accounts.map((a) => a.id).join(','), ensureWatch]);

  // Cleanup OAuth listeners if component unmounts mid-flow
  useEffect(() => {
    return () => {
      oauthCleanupRef.current?.();
    };
  }, []);

  return {
    accounts,
    tokenStatus,
    isLoading,
    startOAuth,
    disconnect,
    refreshNow,
    ensureWatch,
  };
}
