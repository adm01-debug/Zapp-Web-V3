import { useEffect, useRef, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import type { TeamMessage } from './teamChatTypes';

const MESSAGES_PER_PAGE = 50;

export function useTeamMessages(conversationId: string | null, searchQuery: string = '') {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastReadRef = useRef<string | null>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } =
    useInfiniteQuery({
      queryKey: ['team-messages', conversationId, searchQuery],
      queryFn: async ({ pageParam }) => {
        if (!conversationId) return { messages: [], nextCursor: null };

        const { data: messages, error } = await safeClient.from<TeamMessage>(
          'team_messages',
          (q) => {
            let query = q
              .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url)')
              .eq('conversation_id', conversationId)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(MESSAGES_PER_PAGE);
            if (pageParam) {
              const [createdAt, id] = (pageParam as string).split('|');
              query = query.or(
                `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt."${id}")`
              );
            }
            if (searchQuery.trim()) {
              query = query.ilike('content', `%${searchQuery.trim()}%`);
            }
            return query;
          }
        );

        if (error) throw error;

        const sortedMessages = (messages || []).slice().reverse() as TeamMessage[];

        return {
          messages: sortedMessages,
          nextCursor:
            messages?.length === MESSAGES_PER_PAGE
              ? `${messages[messages.length - 1].created_at}|${messages[messages.length - 1].id}`
              : null,
        };
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      enabled: !!conversationId && !!profile,
      initialPageParam: null as string | null,
    });

  const messages = useMemo(() => {
    if (!data?.pages) return [];
    const allMessages = [...data.pages].reverse().flatMap((page) => page.messages);
    return allMessages;
  }, [data?.pages]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`team-messages-${conversationId}`)
      .on<TeamMessage>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'zapp', // team_messages: tabela base em zapp
          table: 'team_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!searchQuery.trim()) {
            queryClient.setQueryData(
              ['team-messages', conversationId, ''],
              (oldData: { pages: { messages: TeamMessage[] }[] } | undefined) => {
                if (!oldData || !oldData.pages) return oldData;

                const newPages = [...oldData.pages];
                if (newPages.length > 0) {
                  newPages[0] = {
                    ...newPages[0],
                    messages: [...newPages[0].messages, payload.new],
                  };
                }
                return { ...oldData, pages: newPages };
              }
            );
          }

          void queryClient.invalidateQueries({ queryKey: ['team-messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, searchQuery]);

  return {
    messages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
    lastReadRef,
  };
}
