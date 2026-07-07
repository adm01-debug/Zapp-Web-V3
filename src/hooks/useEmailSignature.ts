/**
 * useEmailSignature.ts — Gerenciamento de assinaturas de email por conta Email
 */

import { useCallback, useEffect, useState } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';

export interface EmailSignature {
  id: string;
  account_id: string;
  name: string;
  html_content: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmailSignature(accountId: string | null) {
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) { setSignatures([]); return; }
    setIsLoading(true);
    const { data, error } = await safeClient.from<EmailSignature>('email_signatures', q =>
      q.select('*').eq('account_id', accountId).order('is_default', { ascending: false })
    );
    if (!error) setSignatures(data ?? []);
    setIsLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (sig: Partial<EmailSignature> & { html_content: string; name: string }) => {
    if (!accountId) return;

    if (sig.id) {
      const { error } = await safeClient.from('email_signatures', q =>
        q.update({ name: sig.name, html_content: sig.html_content, is_default: sig.is_default ?? false }).eq('id', sig.id!)
      );
      if (error) { toast.error('Erro ao salvar assinatura'); return; }
    } else {
      const { error } = await safeClient.from('email_signatures', q =>
        q.insert({ account_id: accountId, name: sig.name, html_content: sig.html_content, is_default: sig.is_default ?? false })
      );
      if (error) { toast.error('Erro ao criar assinatura'); return; }
    }

    toast.success('Assinatura salva');
    await load();
  }, [accountId, load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await safeClient.from('email_signatures', q => q.delete().eq('id', id));
    if (error) { toast.error('Erro ao excluir assinatura'); return; }
    toast.success('Assinatura excluída');
    await load();
  }, [load]);

  const setDefault = useCallback(async (id: string) => {
    if (!accountId) return;
    await safeClient.from('email_signatures', q =>
      q.update({ is_default: false }).eq('account_id', accountId!)
    );
    await safeClient.from('email_signatures', q =>
      q.update({ is_default: true }).eq('id', id)
    );
    await load();
  }, [accountId, load]);

  const defaultSignature = signatures.find(s => s.is_default) ?? null;

  return { signatures, defaultSignature, isLoading, save, remove, setDefault };
}
