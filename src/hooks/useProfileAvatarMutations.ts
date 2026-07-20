import { supabase } from '@/integrations/supabase/client';

export async function updateProfileAvatarUrl(
  userId: string,
  avatarUrl: string | null,
): Promise<{ error: { message: string } | null }> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('user_id', userId);
  return { error };
}
