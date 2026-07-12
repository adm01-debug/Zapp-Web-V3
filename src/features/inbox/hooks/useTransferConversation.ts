import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTransferConversation');
import { dbFrom } from '@/integrations/datasource/db';

interface UseTransferConversationOptions {
  contactId: string;
  whatsappConnectionId: string | undefined;
}

/**
 * Hook that provides a real implementation for conversation transfer.
 *
 * Previously, `handleTransfer` in ChatPanel was a stub that only displayed
 * a success toast without performing any database update. This hook fixes
 * that critical gap by:
 *
 * 1. Updating `contacts.assigned_to` (agent transfer) or
 *    `contacts.queue_id` (queue transfer) in Supabase.
 * 2. Inserting a system message in the conversation timeline so the
 *    transfer is auditable.
 * 3. Providing proper error handling with user-facing feedback.
 */
export function useTransferConversation({ contactId, whatsappConnectionId }: UseTransferConversationOptions) {
  const transferConversation = useCallback(
    async (type: 'agent' | 'queue', targetId: string, message?: string) => {
      try {
        const updateData: Record<string, string | null> = {};

        if (type === 'agent') {
          updateData.assigned_to = targetId;
        } else {
          updateData.queue_id = targetId;
          // When transferring to a queue, remove the current agent assignment
          // so the queue router can pick the next available agent.
          updateData.assigned_to = null;
        }

        const { error } = await dbFrom('contacts')
          .update(updateData)
          .eq('id', contactId);

        if (error) throw error;

        // Register transfer note in messages timeline for audit trail
        const transferNote = message
          ? `🔄 Transferência: ${message}`
          : type === 'agent'
            ? '🔄 Chat transferido para outro atendente.'
            : '🔄 Chat transferido para outra fila.';

        const { data: userData } = await supabase.auth.getUser();
        const agentId = userData.user?.id;

        await dbFrom('messages').insert({
          contact_id: contactId,
          whatsapp_connection_id: whatsappConnectionId ?? null,
          content: transferNote,
          message_type: 'text',
          sender: 'agent',
          status: 'sent',
          agent_id: agentId,
        });

        toast({
          title: 'Chat transferido!',
          description:
            type === 'agent'
              ? 'O chat foi transferido para outro atendente.'
              : 'O chat foi transferido para outra fila.',
        });
      } catch (err) {
        log.error('Transfer failed:', err);
        toast({
          title: 'Erro na transferência',
          description:
            'Não foi possível transferir o chat. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [contactId, whatsappConnectionId],
  );

  return { transferConversation };
}
