import { supabase } from '@/integrations/supabase/client';

export async function fetchContactPurchases(contactId: string) {
  const { data } = await supabase
    .from('contact_purchases')
    .select('*')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function createContactPurchase(payload: {
  contact_id: string;
  title: string;
  amount: number;
  purchase_type: string;
  created_by: string;
}) {
  return supabase.from('contact_purchases').insert(payload);
}
