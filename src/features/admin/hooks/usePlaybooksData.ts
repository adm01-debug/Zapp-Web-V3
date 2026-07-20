import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';

export async function fetchPlaybooks() {
  const { data } = await supabase
    .from('playbooks')
    .select('*')
    .order('category', { ascending: true });
  return data ?? [];
}

export async function savePlaybook(
  existingId: string | undefined,
  payload: {
    name: string;
    description: string | null;
    category: string;
    steps: Json;
  }
) {
  if (existingId) {
    return supabase.from('playbooks').update(payload).eq('id', existingId);
  }
  return supabase.from('playbooks').insert(payload);
}

export async function deletePlaybookById(id: string) {
  return supabase.from('playbooks').delete().eq('id', id);
}
