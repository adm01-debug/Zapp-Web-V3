import { useCallback, useRef } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const supabase = _supabase;
const log = getLogger('useEmailOAuth');

interface UseEmailOAuthParams {
  mountedRef: React.RefObject<boolean>;
  setError: (msg: string | null) => void;
  loadAccounts: () => Promise<void>;
  checkTokenStatus: () => Promise<void>;
}

export function useEmailOAuth({
  mountedRef,
  setError,
  loadAccounts,
  checkTokenStatus,
}: UseEmailOAuthParams) {
  const oauthInFlightRef = useRef(false);

  const startOAuth = useCallback(async () => {
    // Guard against double-click: two concurrent listeners would both try to
    // exchangeCode with the same single-use code, causing the 2nd to fail.
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
        // Origin guard: only accept messages from our own app origin.
        // Prevents cross-origin pages from injecting a crafted oauth code.
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

      // Detect manual popup close to reset the in-flight guard.
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
