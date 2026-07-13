import { useEffect } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';
import type { EmailThread } from '@/types/gmail';
import { isMockId, mapBaseThreadRow, definedOnly } from './emailUtils';

const supabase = _supabase;

interface UseEmailRealtimeParams {
  activeAccountId: string | null;
  setThreads: React.Dispatch<React.SetStateAction<EmailThread[]>>;
}

export function useEmailRealtime({ activeAccountId, setThreads }: UseEmailRealtimeParams) {
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
            const deletedId = (payload.old as { id?: string })?.id;
            if (!deletedId) return;
            setThreads((prev) => prev.filter((t) => t.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeAccountId, setThreads]);
}
