import { supabase } from '@/integrations/supabase/client';

export async function invalidateUserSession(userId: string) {
  return supabase
    .from('profiles')
    .update({ session_invalidated_at: new Date().toISOString() })
    .eq('user_id', userId);
}
