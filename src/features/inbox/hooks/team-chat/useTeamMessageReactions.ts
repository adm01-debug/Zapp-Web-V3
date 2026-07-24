import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';

/** Raw reaction row from the team_message_reactions table, linking a profile's emoji choice to a specific team message. */
export interface TeamReaction {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
  created_at: string;
}

/** Derived reaction summary for a single emoji: total count, whether the current agent reacted, and the list of profile IDs who reacted. */
export interface AggregatedReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  profileIds: string[];
}

/** Manages emoji reactions on team-chat messages: fetch, add, remove, and realtime subscription per conversation. */
export function useTeamMessageReactions(conversationId: string | undefined) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const { data: reactions = [] } = useQuery({
    queryKey: queryKeys.teamChat.reactions(conversationId),
    queryFn: async () => {
      if (!conversationId) return [];
      // Fetch all reactions for messages in this conversation
      const { data: msgs } = await supabase
        .from('team_messages')
        .select('id')
        .eq('conversation_id', conversationId);
      const ids = (msgs || []).map((m: { id: string }) => m.id);
      if (!ids.length) return [];
      const { data, error } = await safeClient.from<TeamReaction>('team_message_reactions', (q) =>
        q.select('*').in('message_id', ids)
      );
      if (error) throw error;
      return (data || []) as TeamReaction[];
    },
    enabled: !!conversationId,
  });

  // Realtime sync
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`team-reactions-${conversationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_message_reactions' },
        () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.reactions(conversationId) });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  const toggle = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!profile) throw new Error('Not authenticated');
      const existing = reactions.find(
        (r) => r.message_id === messageId && r.profile_id === profile.id && r.emoji === emoji
      );
      if (existing) {
        const { error } = await safeClient.from('team_message_reactions', (q) =>
          q.delete().eq('id', existing.id)
        );
        if (error) throw error;
      } else {
        const { error } = await safeClient.from('team_message_reactions', (q) =>
          q.insert({ message_id: messageId, profile_id: profile.id, emoji })
        );
        if (error) throw error;
      }
    },
    onMutate: async ({ messageId, emoji }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.teamChat.reactions(conversationId) });
      const previousReactions = queryClient.getQueryData<TeamReaction[]>(
        queryKeys.teamChat.reactions(conversationId)
      );

      if (profile && previousReactions) {
        const existingIdx = previousReactions.findIndex(
          (r) => r.message_id === messageId && r.profile_id === profile.id && r.emoji === emoji
        );

        const newReactions = [...previousReactions];
        if (existingIdx > -1) {
          newReactions.splice(existingIdx, 1);
        } else {
          newReactions.push({
            id: 'temp-' + Math.random(),
            message_id: messageId,
            profile_id: profile.id,
            emoji,
            created_at: new Date().toISOString(),
          });
        }
        queryClient.setQueryData(queryKeys.teamChat.reactions(conversationId), newReactions);
      }

      return { previousReactions };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.reactions(conversationId) });
    },
    onError: (err: { status?: number; code?: string | number } & Error, _variables, context) => {
      if (context?.previousReactions) {
        queryClient.setQueryData(queryKeys.teamChat.reactions(conversationId), context.previousReactions);
      }
      const e = err as { status?: number; code?: string };
      const status = e?.status || e?.code;
      const message = status === 401 ? 'Não autorizado' : 'Erro interno no servidor';
      toast({
        title: 'Erro ao reagir',
        description: message,
        variant: 'destructive',
      });
    },
  });

  function aggregate(messageId: string): AggregatedReaction[] {
    const filtered = reactions.filter((r) => r.message_id === messageId);
    const map = new Map<string, AggregatedReaction>();
    for (const r of filtered) {
      const cur = map.get(r.emoji) || {
        emoji: r.emoji,
        count: 0,
        reactedByMe: false,
        profileIds: [],
      };
      cur.count += 1;
      cur.profileIds.push(r.profile_id);
      if (profile && r.profile_id === profile.id) cur.reactedByMe = true;
      map.set(r.emoji, cur);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.emoji.localeCompare(b.emoji);
    });
  }

  return { reactions, aggregate, toggle: toggle.mutate, isToggling: toggle.isPending };
}