import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { useAuth } from '@/features/auth';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import type { TeamMessage } from './teamChatTypes';
import { queryKeys } from '@/services/api/queryKeys';

interface TeamMessagePage {
  messages: TeamMessage[];
  [key: string]: unknown;
}

interface TeamMessageCache {
  pages: TeamMessagePage[];
  pageParams?: unknown[];
  [key: string]: unknown;
}

export function useUpdateTeamMessageStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      status,
      conversationId,
    }: {
      messageId: string;
      status: 'delivered' | 'read';
      conversationId: string;
    }) => {
      const { error } = await safeClient.from('team_messages', (q) =>
        q.update({ status }).eq('id', messageId)
      );
      if (error) throw error;
      return { conversationId, messageId, status };
    },
    onSuccess: (data) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.teamChat.allMessages(data.conversationId) },
        (oldData: TeamMessageCache | undefined): TeamMessageCache | undefined => {
          if (!oldData?.pages) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === data.messageId ? { ...m, status: data.status } : m
            ),
          }));
          return { ...oldData, pages: newPages };
        }
      );
    },
    onError: (err: Error) => log.error('[useUpdateTeamMessageStatus]', err),
  });
}

export function useSendTeamMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      replyToId,
      mediaUrl,
      mediaType,
    }: {
      conversationId: string;
      content: string;
      replyToId?: string;
      mediaUrl?: string;
      mediaType?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('team_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
          reply_to_id: replyToId || null,
          media_url: mediaUrl || null,
          media_type: mediaType || null,
        })
        .select()
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;
      if (error) throw error;
      const { error: touchErr } = await supabase
        .from('team_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (touchErr) log.warn('[useSendTeamMessage] touch updated_at failed', touchErr);
      return data;
    },
    onSuccess: (data, vars) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.teamChat.allMessages(vars.conversationId) },
        (oldData: TeamMessageCache | undefined): TeamMessageCache | undefined => {
          if (!oldData?.pages) return oldData;
          const newPages = [...oldData.pages];
          if (newPages.length > 0) {
            const msgWithSender: TeamMessage = {
              ...data,
              sender: {
                id: profile?.id ?? '',
                name: profile?.name ?? '',
                avatar_url: profile?.avatar_url ?? null,
              },
            };
            newPages[0] = {
              ...newPages[0],
              messages: [...newPages[0].messages, msgWithSender],
            };
          }
          return { ...oldData, pages: newPages };
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
    },
    onError: () => {
      toast({ title: 'Erro ao enviar mensagem', variant: 'destructive' });
    },
  });
}

export function useDeleteTeamMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      conversationId,
    }: {
      messageId: string;
      conversationId: string;
    }) => {
      const { error } = await supabase.from('team_messages').delete().eq('id', messageId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.teamChat.allMessages(vars.conversationId) },
        (oldData: TeamMessageCache | undefined): TeamMessageCache | undefined => {
          if (!oldData?.pages) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.filter((m) => m.id !== vars.messageId),
          }));
          return { ...oldData, pages: newPages };
        }
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir mensagem', variant: 'destructive' });
    },
  });
}

export function useEditTeamMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      content,
      conversationId,
    }: {
      messageId: string;
      content: string;
      conversationId: string;
    }) => {
      const { error } = await supabase
        .from('team_messages')
        .update({ content, is_edited: true, updated_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
      return { conversationId };
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.teamChat.allMessages(vars.conversationId) },
        (oldData: TeamMessageCache | undefined): TeamMessageCache | undefined => {
          if (!oldData?.pages) return oldData;
          const newPages = oldData.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              m.id === vars.messageId ? { ...m, content: vars.content, is_edited: true } : m
            ),
          }));
          return { ...oldData, pages: newPages };
        }
      );
    },
    onError: () => {
      toast({ title: 'Erro ao editar mensagem', variant: 'destructive' });
    },
  });
}

export function useCreateTeamConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      type,
      name,
      memberIds = [],
      departmentId,
    }: {
      type: 'direct' | 'group' | 'department';
      name?: string;
      memberIds?: string[];
      departmentId?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');

      // Conversa direta: reaproveita 1:1 existente entre os dois perfis.
      // Sem loop N+1 e sem .single() (que gerava 406/PGRST116 quando não havia linha).
      if (type === 'direct' && memberIds.length === 1) {
        const otherId = memberIds[0];
        const { data: mine, error: mineErr } = await supabase
          .from('team_conversation_members')
          .select('conversation_id')
          .eq('profile_id', profile.id);
        if (mineErr) throw mineErr;
        const myConvIds = (mine ?? []).map((m) => m.conversation_id);
        if (myConvIds.length > 0) {
          const { data: shared, error: sharedErr } = await supabase
            .from('team_conversation_members')
            .select('conversation_id')
            .eq('profile_id', otherId)
            .in('conversation_id', myConvIds);
          if (sharedErr) throw sharedErr;
          const sharedIds = (shared ?? []).map((m) => m.conversation_id);
          if (sharedIds.length > 0) {
            const { data: existingConv, error: convLookupErr } = await supabase
              .from('team_conversations')
              .select('*')
              .in('id', sharedIds)
              .eq('type', 'direct')
              .limit(1)
              .maybeSingle();
            if (convLookupErr) throw convLookupErr;
            if (existingConv) return existingConv;
          }
        }
      }

      // Conversa de departamento: única por departamento (índice UNIQUE parcial no banco)
      if (type === 'department' && departmentId) {
        const { data: deptRows, error: deptErr } = await safeClient.from(
          'team_conversations',
          (q) => q.select('*').eq('department_id', departmentId).eq('type', 'department').limit(1)
        );
        if (deptErr) throw deptErr;
        const existingDeptConv = deptRows?.[0] ?? null;
        if (existingDeptConv) return existingDeptConv;
      }

      const { data: convRows, error: convErr } = await safeClient.from('team_conversations', (q) =>
        q
          .insert({
            type,
            name: name || null,
            created_by: profile.id,
            department_id: departmentId || null,
          })
          .select()
      );
      const conv = (convRows?.[0] ?? null) as { id: string } | null;

      if (convErr) throw convErr;
      if (!conv) throw new Error('Failed to create conversation');

      // Membros deduplicados (o banco também garante UNIQUE (conversation_id, profile_id)).
      // Em conversas de departamento, apenas o criador é adicionado para consistência de UI.
      const memberProfileIds =
        type !== 'department' ? [...new Set([profile.id, ...memberIds])] : [profile.id];
      const { error: memError } = await supabase
        .from('team_conversation_members')
        .insert(memberProfileIds.map((pid) => ({ conversation_id: conv.id, profile_id: pid })));
      if (memError) throw memError;

      return conv;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
    },
    onError: () => {
      toast({ title: 'Erro ao criar conversa', variant: 'destructive' });
    },
  });
}

export function useToggleMuteConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, muted }: { conversationId: string; muted: boolean }) => {
      if (!profile) throw new Error('Not authenticated');
      const { error: muteError } = await supabase
        .from('team_conversation_members')
        .update({ is_muted: muted })
        .eq('conversation_id', conversationId)
        .eq('profile_id', profile.id);
      if (muteError) throw muteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
    },
    onError: () => {
      toast({ title: 'Erro ao alterar silenciar', variant: 'destructive' });
    },
  });
}

export function useTransferTeamConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      conversationId,
      departmentId,
      metadata,
    }: {
      conversationId: string;
      departmentId: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data: rows, error } = await safeClient.from('team_conversations', (q) =>
        q
          .update({
            department_id: departmentId,
            metadata: metadata || {},
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .select()
      );
      if (error) throw error;
      return rows?.[0] ?? null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teamChat.conversations() });
      toast({ title: 'Conversa transferida com sucesso' });
    },
    onError: () => {
      toast({ title: 'Erro ao transferir conversa', variant: 'destructive' });
    },
  });
}
