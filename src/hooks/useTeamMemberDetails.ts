import { useMemo } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamConversation } from '@/hooks/useTeamChat';

export interface MemberProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
  birthday: string | null;
}

const PROFILE_FIELDS =
  'id, name, email, phone, avatar_url, job_title, department, role, is_active, created_at, birthday';

export function useTeamMemberDetails(
  conversation: TeamConversation,
  currentProfileId: string | null,
) {
  const otherMemberId = useMemo(
    () =>
      conversation.type === 'direct'
        ? (conversation.members?.find((m) => m.profile_id !== currentProfileId)?.profile_id ?? null)
        : null,
    [conversation, currentProfileId],
  );

  const memberIds = useMemo(
    () => conversation.members?.map((m) => m.profile_id) ?? [],
    [conversation.members],
  );

  const { data: memberProfile, isLoading } = useQuery({
    queryKey: queryKeys.teamProfiles.memberProfile(otherMemberId || conversation.id),
    queryFn: async () => {
      if (conversation.type === 'direct' && otherMemberId) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_FIELDS)
          .eq('id', otherMemberId)
          .maybeSingle();
        if (error) throw error;
        return data as MemberProfile; // ignore-audit: MemberProfile maps a subset of profiles columns; select explicitly lists them
      }
      return null;
    },
    enabled: conversation.type === 'direct' && !!otherMemberId,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: queryKeys.teamChat.groupMembers(
      `${conversation.id}-${conversation.type}-${conversation.department_id}-${memberIds.join(',')}`,
    ),
    queryFn: async () => {
      if (conversation.type === 'department' && conversation.department_id) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_FIELDS)
          .eq('department_id', conversation.department_id);
        if (error) throw error;
        return (data || []) as MemberProfile[];
      }

      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .in('id', memberIds);
      if (error) throw error;
      return (data || []) as MemberProfile[];
    },
    enabled:
      (conversation.type === 'group' && memberIds.length > 0) ||
      (conversation.type === 'department' && !!conversation.department_id),
  });

  return { memberProfile: memberProfile ?? null, isLoading, groupMembers };
}
