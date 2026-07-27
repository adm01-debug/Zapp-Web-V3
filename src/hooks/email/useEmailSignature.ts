import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailSignature');

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

const EMAIL_SIGNATURES_KEY = (accountId: string | null) =>
  ['email-signatures', accountId] as const;

/** Manages email signatures per account with create, update, delete, and default selection. */
export function useEmailSignature(accountId: string | null) {
  const queryClient = useQueryClient();

  const { data: signatures = [], isLoading } = useQuery({
    queryKey: EMAIL_SIGNATURES_KEY(accountId),
    queryFn: async () => {
      if (!accountId) return [] as EmailSignature[];
      const { data, error } = await safeClient.from<EmailSignature>('email_signatures', (q) =>
        q.select('*').eq('account_id', accountId).order('is_default', { ascending: false })
      );
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!accountId,
    staleTime: 30_000,
  });

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
            .eq('id', sig.id ?? '')
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

      await queryClient.invalidateQueries({ queryKey: EMAIL_SIGNATURES_KEY(accountId) });
    },
    [accountId, queryClient]
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await safeClient.from('email_signatures', (q) => q.delete().eq('id', id));
      if (error) {
        log.error('Email signature delete error', error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: EMAIL_SIGNATURES_KEY(accountId) });
    },
    [accountId, queryClient]
  );

  const setDefault = useCallback(
    async (id: string) => {
      if (!accountId) return;
      // Set the new default first so there is always at least one default signature.
      // Clear others second: if this fails, two rows have is_default=true (harmless)
      // rather than zero rows (which would break the UI).
      const { error: setErr } = await safeClient.from('email_signatures', (q) =>
        q.update({ is_default: true }).eq('id', id)
      );
      if (setErr) return;
      await safeClient.from('email_signatures', (q) =>
        q
          .update({ is_default: false })
          .eq('account_id', accountId ?? '')
          .neq('id', id)
      );
      await queryClient.invalidateQueries({ queryKey: EMAIL_SIGNATURES_KEY(accountId) });
    },
    [accountId, queryClient]
  );

  const defaultSignature = signatures.find((s) => s.is_default) ?? null;

  return { signatures, defaultSignature, isLoading, save, remove, setDefault };
}
