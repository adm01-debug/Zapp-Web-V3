import { useCallback } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import type { EmailLabel } from '@/types/gmail';
import { isMockId } from './emailUtils';

const supabase = _supabase;

interface UseEmailSyncParams {
  activeAccountId: string | null;
  activeLabel: EmailLabel;
  isSyncing: boolean;
  setIsSyncing: (v: boolean) => void;
  loadThreads: (accountId?: string, label?: EmailLabel, pageOffset?: number) => Promise<void>;
  checkTokenStatus: () => Promise<void>;
  setError: (msg: string | null) => void;
}

export function useEmailSync({
  activeAccountId,
  activeLabel,
  isSyncing,
  setIsSyncing,
  loadThreads,
  checkTokenStatus,
  setError,
}: UseEmailSyncParams) {
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
