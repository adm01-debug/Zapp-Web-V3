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
        .maybeSingle();
      if (error || !data) return false;
      return data.can_download === true;
    },
    enabled: !!user,
    initialData: false,
    // Perfil do usuário logado é quase-estático — staleTime longo evita
    // refetch do profiles?select=can_download&user_id=... a cada mount.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  return { canDownload: data ?? false, isLoading };
}
