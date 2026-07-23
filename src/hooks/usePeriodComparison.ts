import { supabase } from '@/integrations/supabase/client';

export async function fetchConversationClosuresCount(
  from: string,
  to?: string,
): Promise<number> {
  let q = supabase
    .from('conversation_closures')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', from);
  if (to) q = q.lt('created_at', to);
  const { count } = await q;
  return count ?? 0;
}
