import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Hook: use Download Permission. */
export function useDownloadPermission() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['download-permission', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('profiles')
        .select('can_download')
        .eq('user_id', user.id)
        .single();
      if (error || !data) return false;
      return data.can_download === true;
    },
    enabled: !!user,
    initialData: false,
  });

  return { canDownload: data ?? false, isLoading };
}
