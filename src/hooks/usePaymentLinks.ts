import { supabase } from '@/integrations/supabase/client';

export async function fetchPaymentLinks() {
  const { data } = await supabase
    .from('payment_links')
    .select('*')
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createPaymentLink(params: {
  title: string;
  description: string | null;
  amount: number;
  payment_method: string;
  payment_url: string;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('payment_links').insert(params);
  return { error: error ? new Error(error.message) : null };
}

export async function deletePaymentLink(id: string): Promise<void> {
  await supabase.from('payment_links').delete().eq('id', id);
}
