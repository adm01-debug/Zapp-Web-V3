import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface TeamProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean | null;
}

export function useActiveTeamProfiles(
  enabled: boolean,
  queryKey: readonly unknown[],
  excludeId?: string,
) {
  return useQuery({
    queryKey,
    queryFn: async (): Promise<TeamProfile[]> => {
      let q = supabase
        .from('profiles')
        .select('id, name, email, avatar_url, is_active')
        .eq('is_active', true)
        .order('name');
      if (excludeId) q = q.neq('id', excludeId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled,
  });
}

export function useAddConversationMembers(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberIds: string[]) => {
      const { error } = await supabase.from('team_conversation_members').insert(
        memberIds.map((pid) => ({
          conversation_id: conversationId,
          profile_id: pid,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.allMessages(conversationId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.groupMembers(conversationId) });
    },
  });
}
