// @ts-nocheck
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { emailMappers } from '@/utils/emailMappers';
import { EmailLabelInfo as EmailLabel } from '@/types/gmail';
import { getLogger } from '@/lib/logger';

/** Re-exported module members. */
export type { EmailLabel };

const log = getLogger('useEmailLabels');

/** Hook: SYSTEM_LABELS. */
export const SYSTEM_LABELS: Array<{ id: string; name: string; icon: string; color: string }> = [
  { id: 'INBOX', name: 'Inbox', icon: 'inbox', color: 'hsl(var(--primary))' },
  { id: 'STARRED', name: 'Favoritos', icon: 'star', color: 'hsl(var(--warning))' },
  { id: 'IMPORTANT', name: 'Importantes', icon: 'flag', color: 'hsl(var(--warning))' },
  { id: 'SENT', name: 'Enviados', icon: 'send', color: 'hsl(var(--success))' },
  { id: 'DRAFTS', name: 'Rascunhos', icon: 'draft', color: 'hsl(var(--muted-foreground))' },
  { id: 'SPAM', name: 'Spam', icon: 'block', color: 'hsl(var(--destructive))' },
  { id: 'TRASH', name: 'Lixeira', icon: 'delete', color: 'hsl(var(--muted-foreground))' },
];

/** Hook: use Email Labels. */
export function useEmailLabels(accountId: string | null) {
  const queryClient = useQueryClient();
  const key = ['email-labels', accountId] as const;

  const { data: labels = [], isLoading, error: queryError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error: dbErr } = await safeClient.from('email_labels', (q) =>
        q.select('*').eq('account_id', accountId!).order('name', { ascending: true })
      );
      if (dbErr) {
        log.warn('Email labels load error', dbErr.message);
        throw new Error('Não foi possível carregar as pastas do Email.');
      }
      return emailMappers.labels(Array.isArray(data) ? data : []);
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

  const error = queryError instanceof Error ? queryError.message : null;

  const loadLabels = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key]
  );

  const syncLabels = useCallback(async () => {
    if (!accountId) return;
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
        body: { action: 'syncLabels', accountId },
      });
      if (!fnErr && data?.success) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    } catch {
      // ignore
    }
  }, [accountId, queryClient, key]);

  const getLabelCount = useCallback(
    async (labelId: string): Promise<{ thread_count: number; unread_count: number }> => {
      if (!accountId) return { thread_count: 0, unread_count: 0 };
      const { data } = await safeClient.from<{ id: string; unread_count: number }>(
        'email_threads',
        (q) =>
          q.select('id, unread_count').eq('account_id', accountId).contains('label_ids', [labelId])
      );
      const threads = data ?? [];
      return {
        thread_count: threads.length,
        unread_count: threads.reduce((s, t) => s + (t.unread_count ?? 0), 0),
      };
    },
    [accountId]
  );

  const systemLabels = SYSTEM_LABELS.map((sl) => ({
    id: `system-${sl.id}`,
    account_id: accountId ?? '',
    email_label_id: sl.id,
    name: sl.name,
    type: 'system' as const,
    color: sl.color,
  }));

  const userLabels = labels.filter((l) => l.type === 'user');
  const allLabels = [...systemLabels, ...userLabels];

  return {
    labels,
    userLabels,
    systemLabels,
    allLabels,
    isLoading,
    error,
    loadLabels,
    syncLabels,
    getLabelCount,
    SYSTEM_LABELS,
  };
}
