import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import type { TeamConversation, TeamMember, TeamMessage } from './teamChatTypes';

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team-conversations', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      // Keyset cursor pagination on (updated_at DESC, id DESC) reduces skips/duplicates.
      // Because updated_at is mutable, a concurrent write can still move a row past the
      // cursor (omission) or into an already-fetched range (duplication). We deduplicate
      // by id after accumulation; omissions are expected to be rare and self-heal on the
      // next refetch (realtime invalidation + 30s refetchInterval).
      const PAGE = 1000;
      const { data: firstConvPage, error: convErr } = await supabase
        .from('team_conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(PAGE);
      if (convErr) throw convErr;
      const conversations = [...(firstConvPage ?? [])];
      let lastPage = firstConvPage ?? [];
      while (lastPage.length === PAGE) {
        const cursor = lastPage[lastPage.length - 1];
        const { data: page, error } = await supabase
          .from('team_conversations')
          .select('*')
          .order('updated_at', { ascending: false })
          .order('id', { ascending: false })
          .or(`updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`)
          .limit(PAGE);
        if (error) throw error;
        if (!page || page.length === 0) break;
        conversations.push(...page);
        lastPage = page;
      }
      // Dedup by id as a safety net against any residual boundary overlap.
      const seen = new Set<string>();
      const deduped = conversations.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
      conversations.length = 0;
      conversations.push(...deduped);

      if (!conversations.length) return [];

      const convIds = conversations.map(c => c.id);

      // Fetch memberships and profiles for these conversations.
      // convIds is already bounded by the keyset-paginated conversations fetch above.
      // These limits are defence-in-depth for unusually large workspaces.
      const [membershipsResult, membersResult] = await Promise.all([
        supabase
          .from('team_conversation_members')
          .select('conversation_id, last_read_at')
          .eq('profile_id', profile.id)
          .in('conversation_id', convIds)
          .limit(5_000),
        safeClient.from('team_conversation_members', q =>
          q.select('*, profile:profiles(id, name, email, avatar_url, is_active)')
           .in('conversation_id', convIds)
           .limit(10_000)
        ),
      ]);

      const lastReadMap = new Map(membershipsResult.data?.map(m => [m.conversation_id, m.last_read_at]) || []);
      const allMembers = membersResult.data || [];

      // Use DISTINCT ON RPC to guarantee exactly one (the most recent) message
      // per conversation regardless of how active any individual conversation is.
      const { data: recentMessages } = await supabase.rpc(
        'get_last_team_messages',
        { conversation_ids: convIds },
      );

      const lastMessageMap = new Map<string, { id: string; conversation_id: string; content: string; sender_id: string; created_at: string }>();
      for (const msg of recentMessages || []) {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      }

      const unreadPromises = convIds.map(async (cid) => {
        const lastRead = lastReadMap.get(cid);
        let query = supabase
          .from('team_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', cid)
          .neq('sender_id', profile.id);

        if (lastRead) {
          query = query.gt('created_at', lastRead);
        }

        const { count } = await query;
        return { cid, count: count || 0 };
      });

      const unreadResults = await Promise.all(unreadPromises);
      const unreadMap = new Map(unreadResults.map(r => [r.cid, r.count]));

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
