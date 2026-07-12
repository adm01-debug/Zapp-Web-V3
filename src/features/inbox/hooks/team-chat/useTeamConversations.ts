import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/features/auth';
import type { TeamConversation, TeamMember, TeamMessage } from './teamChatTypes';

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team-conversations', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      // Fetch conversations directly - RLS will filter to what the user can see
      const { data: conversations, error: convErr } = await supabase
        .from('team_conversations')
        .select('*')
        .order('updated_at', { ascending: false });

      if (convErr) throw convErr;
      if (!conversations?.length) return [];

      const convIds = conversations.map(c => c.id);

      // Fetch memberships and profiles for these conversations
      const [membershipsResult, membersResult] = await Promise.all([
        supabase
          .from('team_conversation_members')
          .select('conversation_id, last_read_at')
          .eq('profile_id', profile.id)
          .in('conversation_id', convIds),
        supabase
          .from('team_conversation_members')
          .select('*, profile:profiles(id, name, email, avatar_url, is_active)')
          .in('conversation_id', convIds),
      ]);

      const lastReadMap = new Map(membershipsResult.data?.map(m => [m.conversation_id, m.last_read_at]) || []);
      const allMembers = membersResult.data || [];

      const { data: recentMessages } = await supabase
        .from('team_messages')
        .select('id, conversation_id, content, sender_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(convIds.length * 2);

      const lastMessageMap = new Map<string, { id: string; conversation_id: string; content: string; sender_id: string; created_at: string }>();
      for (const msg of recentMessages || []) {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      }

      // Optimization: Fetch all unread messages in single batch query instead of N+1 per conversation
      // Only fetch unread messages (created after last_read) for each conversation
      const { data: unreadMessages } = await supabase
        .from('team_messages')
        .select('conversation_id, created_at')
        .in('conversation_id', convIds)
        .neq('sender_id', profile.id);

      const unreadMap = new Map<string, number>();
      convIds.forEach(cid => {
        const lastRead = lastReadMap.get(cid);
        const unreadForConv = (unreadMessages || [])
          .filter(m => m.conversation_id === cid && (!lastRead || new Date(m.created_at) > new Date(lastRead)))
          .length;
        unreadMap.set(cid, unreadForConv);
        }
      });

      const enriched: TeamConversation[] = conversations.map(conv => {
        const members = ((allMembers || []).filter(m => m.conversation_id === conv.id)) as unknown as TeamMember[];
        const lastMsg = lastMessageMap.get(conv.id) || null;

        let displayName = conv.name;
        if (conv.type === 'direct' && !conv.name) {
          const other = members.find(m => m.profile_id !== profile.id);
          displayName = other?.profile?.name || 'Chat Direto';
        }

        return {
          ...conv,
          type: conv.type as 'direct' | 'group' | 'department',
          name: displayName,
          avatar_url: conv.type === 'direct' && !conv.avatar_url
            ? members.find(m => m.profile_id !== profile.id)?.profile?.avatar_url
            : conv.avatar_url,
          members,
          last_message: lastMsg as TeamMessage | null,
          unread_count: unreadMap.get(conv.id) || 0,
        };
      });

      return enriched;
    },
    enabled: !!profile,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('team-chat-updates')
      // Wave 1: team_messages is a view in public — repoint to zapp base table
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'team_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      // Wave 1: team_conversations and team_conversation_members are views in public — zapp is base schema
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'team_conversations' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'zapp', table: 'team_conversation_members' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, queryClient]);

  return query;
}
