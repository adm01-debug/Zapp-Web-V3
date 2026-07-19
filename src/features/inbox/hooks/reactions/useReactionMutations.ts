import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import { queryKeys } from '@/services/api/queryKeys';

type ApiError = Error & { code?: string; details?: string; status?: number };

const mutationLog = getLogger('useReactionMutations');

interface ReactionMutationOptions {
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
}

interface ReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user_name?: string;
}

/**
 * Analytics helper
 */
const trackReactionEvent = (
  action: 'add' | 'remove' | 'open_picker',
  data: { messageId: string; emoji?: string; status?: string; code?: number | string }
) => {
  if (!data.messageId) return;
  // Use unique key to prevent duplicate tracking of same event in rapid succession
  const eventKey = `${action}-${data.messageId}-${data.emoji || 'no-emoji'}-${Date.now()}`;
  mutationLog.info(`[Analytics] Reaction Event: ${action}`, { ...data, eventKey });

  // Forward to Operations Audit Log (audit_logs table)
  void supabase;
  void (async () => {
    try {
      await supabase.from('audit_logs').insert({
        action: `Reaction Event: ${action}`,
        entity_type: 'message_reaction',
        entity_id: data.messageId,
        details: {
          emoji: data.emoji,
          status: data.status,
          code: data.code,
          event_key: eventKey,
        },
      });
    } catch (err: unknown) {
      mutationLog.warn('[audit] reaction event log failed', err);
    }
  })();
};

export function useReactionMutations(
  messageId: string,
  profileId: string | undefined,
  options?: ReactionMutationOptions
) {
  const queryClient = useQueryClient();
  const { sendReaction } = useEvolutionApi();

  const resolveMessageContactId = async () => {
    const { data, error } = await dbFrom('messages')
      .select('contact_id')
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw error;

    if (!data?.contact_id) {
      throw new Error('Contato da mensagem não encontrado');
    }

    return data.contact_id;
  };

  const addMutation = useMutation({
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      const contactId = await resolveMessageContactId();

      const { data, error } = await supabase
        .from('message_reactions')
        .upsert(
          { message_id: messageId, user_id: profileId, contact_id: contactId, emoji },
          { onConflict: 'message_id,user_id,emoji' }
        )
        .select()
        .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

      if (error) throw error;

      if (options?.instanceName && options?.contactJid && options?.externalId) {
        try {
          await sendReaction(
            options.instanceName,
            {
              remoteJid: options.contactJid,
              fromMe: options.senderType === 'agent',
              id: options.externalId,
            },
            emoji
          );
        } catch (err) {
          mutationLog.error('Failed to send reaction via Evolution API', err);
        }
      }

      return data;
    },
    onMutate: async (emoji) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messageReactions.message(messageId) });
      const previous = queryClient.getQueryData(queryKeys.messageReactions.message(messageId));

      if (profileId) {
        queryClient.setQueryData(
          queryKeys.messageReactions.message(messageId),
          (old: Record<string, unknown>[] | undefined) => [
            ...(old || []),
            {
              id: 'temp-' + Date.now(),
              message_id: messageId,
              user_id: profileId,
              emoji,
              created_at: new Date().toISOString(),
              user_name: 'Você',
            },
          ]
        );
      }
      return { previous };
    },
    onSuccess: (data, emoji) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messageReactions.message(messageId) });
      toast.dismiss(`reaction-error-${messageId}`);
      trackReactionEvent('add', { messageId, emoji, status: 'success' });
    },
    onError: (error: ApiError, emoji, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.messageReactions.message(messageId), context.previous);
      }
      mutationLog.error('Failed to add reaction', error);

      const status = error?.status || error?.code || (error?.message?.includes('401') ? 401 : 500);
      let errorMsg = 'Erro interno no servidor (500)';

      if (status === 401 || status === '401')
        errorMsg = 'Sessão expirada. Por favor, faça login novamente.';
      else if (status === 504 || status === '504' || status === 'PGRST116')
        errorMsg = 'O servidor demorou muito para responder. Tente novamente.';
      else if (status === 403 || status === '403')
        errorMsg = 'Você não tem permissão para reagir nesta mensagem.';

      toast.error(`Erro ao adicionar reação: ${errorMsg}`, {
        id: `reaction-error-${messageId}`, // Stable ID for replacement
        className: 'bg-destructive text-destructive-foreground font-medium',
        duration: 4000,
      });

      trackReactionEvent('add', { messageId, emoji, status: 'error', code: status });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profileId)
        .eq('emoji', emoji);

      if (error) throw error;

      if (options?.instanceName && options?.contactJid && options?.externalId) {
        try {
          await sendReaction(
            options.instanceName,
            {
              remoteJid: options.contactJid,
              fromMe: options.senderType === 'agent',
              id: options.externalId,
            },
            ''
          );
        } catch (err) {
          mutationLog.error('Failed to remove reaction via Evolution API', err);
        }
      }
    },
    onMutate: async (emoji) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.messageReactions.message(messageId) });
      const previous = queryClient.getQueryData(queryKeys.messageReactions.message(messageId));

      if (profileId) {
        queryClient.setQueryData(
          queryKeys.messageReactions.message(messageId),
          (old: Array<{ user_id: string; emoji: string }> | undefined) =>
            (old || []).filter((r) => !(r.user_id === profileId && r.emoji === emoji))
        );
      }
      return { previous };
    },
    onSuccess: (data, emoji) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.messageReactions.message(messageId) });
      toast.dismiss(`reaction-error-${messageId}`);
      trackReactionEvent('remove', { messageId, emoji, status: 'success' });
    },
    onError: (error: ApiError, emoji, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.messageReactions.message(messageId), context.previous);
      }
      toast.error('Não foi possível remover sua reação. Verifique sua conexão.', {
        id: `reaction-error-${messageId}`, // Same ID to replace add errors
        className: 'bg-destructive text-destructive-foreground font-medium',
        duration: 4000,
      });
      trackReactionEvent('remove', { messageId, emoji, status: 'error' });
    },
  });

  return { addMutation, removeMutation, trackReactionEvent };
}
