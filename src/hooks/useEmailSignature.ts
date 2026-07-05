/**
 * useEmailSignature.ts — Gerenciamento de assinaturas de email por conta Email
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase as _supabase } from '@/integrations/supabase/client';

interface SigQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select(cols: string): SigQuery;
  eq(col: string, val: unknown): SigQuery;
  order(col: string, opts: { ascending: boolean }): SigQuery;
  update(vals: Record<string, unknown>): SigQuery;
  insert(vals: Record<string, unknown>): SigQuery;
  delete(): SigQuery;
}
const supabase = _supabase as unknown as { from: (t: string) => SigQuery };
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
    const { data, error } = await supabase
      .from('email_signatures')
      .select('*')
      .eq('account_id', accountId)
      .order('is_default', { ascending: false });

    if (!error) setSignatures((data ?? []) as EmailSignature[]);
    setIsLoading(false);
  }, [accountId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (sig: Partial<EmailSignature> & { html_content: string; name: string }) => {
    if (!accountId) return;

    if (sig.id) {
      const { error } = await supabase
        .from('email_signatures')
        .update({ name: sig.name, html_content: sig.html_content, is_default: sig.is_default ?? false })
        .eq('id', sig.id);
      if (error) { toast.error('Erro ao salvar assinatura'); return; }
    } else {
      const { error } = await supabase
        .from('email_signatures')
        .insert({ account_id: accountId, name: sig.name, html_content: sig.html_content, is_default: sig.is_default ?? false });
      if (error) { toast.error('Erro ao criar assinatura'); return; }
    }

    toast.success('Assinatura salva');
    await load();
  }, [accountId, load]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('email_signatures').delete().eq('id', id);
    if (error) { toast.error('Erro ao excluir assinatura'); return; }
    toast.success('Assinatura excluída');
    await load();
  }, [load]);

  const setDefault = useCallback(async (id: string) => {
    if (!accountId) return;
    // Remove default de todas
    await supabase
      .from('email_signatures')
      .update({ is_default: false })
      .eq('account_id', accountId);
    // Define nova
    await supabase
      .from('email_signatures')
      .update({ is_default: true })
      .eq('id', id);
    await load();
  }, [accountId, load]);

  const defaultSignature = signatures.find(s => s.is_default) ?? null;

  return { signatures, defaultSignature, isLoading, save, remove, setDefault };
}
