import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
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
  const key = useMemo(() => ['email-labels', accountId] as const, [accountId]);

  const { data: labels = [], isLoading, error: queryError } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!accountId) return [];
      // A view email_labels (zapp) expõe as colunas gmail_account_id /
      // gmail_label_id / label_type — espelho de gmail_labels, que é a tabela
      // que a edge gmail-sync (action syncLabels) realmente grava. A query
      // antiga usava account_id/email_label_id/type → erro 400 de coluna.
      const { data, error: dbErr } = await safeClient.from('email_labels', (q) =>
        q.select('*').eq('gmail_account_id', accountId).order('name', { ascending: true })
      );
      if (dbErr) {
        log.warn('Email labels load error', dbErr.message);
        throw new Error('Não foi possível carregar as pastas do Email.');
      }
      return (Array.isArray(data) ? data : []).map((rowRaw) => {
        const row = rowRaw as Record<string, unknown>;
        return {
          id: (row.id as string) ?? (row.gmail_label_id as string),
          account_id: row.gmail_account_id as string,
          email_label_id: (row.gmail_label_id as string) ?? (row.id as string),
          name: (row.name as string) ?? '',
          type: row.label_type === 'system' ? 'system' : 'user',
          color: row.color as string | null | undefined,
          thread_count: (row.message_count as number | null) ?? undefined,
          unread_count: (row.unread_count as number | null) ?? undefined,
        } as EmailLabel;
      });
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
      // gmail-sync syncLabels responde { synced } (não { success }) — o check
      // antigo (data?.success) nunca invalidava a query após sincronizar.
      if (!fnErr && data && typeof data === 'object' && 'synced' in data) {
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

  const createLabel = useCallback(
    async (
      name: string,
      options?: {
        labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
        messageListVisibility?: 'show' | 'hide';
        color?: Record<string, string>;
      }
    ): Promise<{ label: unknown } | null> => {
      if (!accountId) return null;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
          body: { action: 'createLabel', accountId, name, ...options },
        });
        if (fnErr) throw fnErr;
        await queryClient.invalidateQueries({ queryKey: key });
        return data as { label: unknown };
      } catch (err) {
        log.error('createLabel error', err);
        return null;
      }
    },
    [accountId, queryClient, key]
  );

  const updateLabel = useCallback(
    async (
      labelId: string,
      patches: {
        name?: string;
        labelListVisibility?: 'labelShow' | 'labelShowIfUnread' | 'labelHide';
        messageListVisibility?: 'show' | 'hide';
        color?: Record<string, string>;
      }
    ): Promise<{ label: unknown } | null> => {
      if (!accountId) return null;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
          body: { action: 'updateLabel', accountId, labelId, ...patches },
        });
        if (fnErr) throw fnErr;
        await queryClient.invalidateQueries({ queryKey: key });
        return data as { label: unknown };
      } catch (err) {
        log.error('updateLabel error', err);
        return null;
      }
    },
    [accountId, queryClient, key]
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<{ deleted: boolean } | null> => {
      if (!accountId) return null;
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('gmail-sync', {
          body: { action: 'deleteLabel', accountId, labelId },
        });
        if (fnErr) throw fnErr;
        await queryClient.invalidateQueries({ queryKey: key });
        return data as { deleted: boolean };
      } catch (err) {
        log.error('deleteLabel error', err);
        return null;
      }
    },
    [accountId, queryClient, key]
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
    createLabel,
    updateLabel,
    deleteLabel,
    SYSTEM_LABELS,
  };
}
