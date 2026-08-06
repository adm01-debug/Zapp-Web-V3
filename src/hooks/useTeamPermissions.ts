import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useTeamPermissions(enabled: boolean) {
  const rolesQuery = useQuery({
    queryKey: queryKeys.adminOps.userRoles(),
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('id, user_id, role');
      if (error) throw error;
      return data || [];
    },
    enabled,
    // user_roles é quase-estático — evita refetch a cada mount/navegação.
    staleTime: 5 * 60_000,
  });

  const permissionsQuery = useQuery({
    queryKey: queryKeys.userProfile.permissionsList(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('permissions')
        .select('id, name, description, category');
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  const profilesQuery = useQuery({
    queryKey: queryKeys.userProfile.forPermissions(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role')
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled,
    staleTime: 5 * 60_000,
  });

  return {
    roles: rolesQuery.data ?? [],
    permissions: permissionsQuery.data ?? [],
    profiles: profilesQuery.data ?? [],
    isLoading: rolesQuery.isLoading,
  };
}
