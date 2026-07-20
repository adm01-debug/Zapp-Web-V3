import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';

export async function fetchInboxCustomScopes() {
  const { data } = await supabase
    .from('inbox_custom_scopes')
    .select('*')
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function createInboxCustomScope(payload: {
  label: string;
  name: string;
  description: string;
  filter_criteria: Json;
}) {
  return supabase.from('inbox_custom_scopes').insert([payload]);
}

export async function deleteInboxCustomScopeById(id: string) {
  return supabase.from('inbox_custom_scopes').delete().eq('id', id);
}
