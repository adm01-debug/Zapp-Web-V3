import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useTransferConversation');
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';

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
export function useTransferConversation({
  contactId,
  whatsappConnectionId,
}: UseTransferConversationOptions) {
  const transferConversation = useCallback(
    async (type: 'agent' | 'queue', targetId: string, message?: string) => {
      if (!isValidUUID(contactId)) {
        log.warn('transferConversation: contactId is not a valid UUID, skipping', { contactId });
        return;
      }
      try {
        const { data: userData } = await supabase.auth.getUser();
        const agentId = userData.user?.id;

        // INBOX-12: ler a atribuição atual antes da transferência para compor o
        // audit trail em conversation_transfers (from_agent_id/from_queue_id).
        const { data: current } = await dbFrom('contacts')
          .select('assigned_to, queue_id, name, remote_jid, instance_name')
          .eq('id', contactId)
          .maybeSingle();

        const updateData: Record<string, string | null> = {};

        if (type === 'agent') {
          updateData.assigned_to = targetId;
        } else {
          updateData.queue_id = targetId;
          // When transferring to a queue, remove the current agent assignment
          // so the queue router can pick the next available agent.
          updateData.assigned_to = null;
        }

        const { error } = await dbFrom('contacts').update(updateData).eq('id', contactId);

        if (error) throw error;

        // Register transfer note in messages timeline for audit trail
        const transferNote = message
          ? `🔄 Transferência: ${message}`
          : type === 'agent'
            ? '🔄 Chat transferido para outro atendente.'
            : '🔄 Chat transferido para outra fila.';

        await dbFrom('messages').insert({
          contact_id: contactId,
          whatsapp_connection_id: whatsappConnectionId ?? null,
          content: transferNote,
          message_type: 'text',
          sender: 'agent',
          status: 'sent',
          agent_id: agentId,
        });

        // INBOX-12: persistir a transferência em conversation_transfers (audit
        // trail + fonte para o realtime) e transfer_comments quando houver
        // mensagem. Escritas não-fatais: a transferência em si (contacts +
        // timeline) já foi concluída; falha aqui só degrada a auditoria.
        const now = new Date().toISOString();
        const { data: transferRow, error: transferErr } = await supabase
          .from('conversation_transfers')
          .insert({
            contact_id: contactId,
            contact_name: current?.name ?? null,
            from_agent_id: current?.assigned_to ?? null,
            to_agent_id: type === 'agent' ? targetId : null,
            to_queue_id: type === 'queue' ? targetId : null,
            transfer_type: type,
            status: 'pending',
            reason: message ?? (type === 'agent'
              ? 'Transferência para outro atendente'
              : 'Transferência para outra fila'),
            remote_jid: current?.remote_jid ?? '',
            source_instance: current?.instance_name ?? '',
            target_instance: current?.instance_name ?? '',
            ticket_number: `T-${Date.now().toString(36).toUpperCase()}`,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .maybeSingle();

        if (transferErr) {
          log.error('conversation_transfers insert failed:', transferErr);
        } else if (message && transferRow?.id && agentId) {
          const { error: commentErr } = await supabase
            .from('transfer_comments')
            .insert({
              transfer_id: transferRow.id,
              agent_id: agentId,
              author_instance: current?.instance_name ?? '',
              author_name: 'Agente',
              content: message,
            });
          if (commentErr) {
            log.error('transfer_comments insert failed:', commentErr);
          }
        }

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
          description: 'Não foi possível transferir o chat. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [contactId, whatsappConnectionId]
  );

  return { transferConversation };
}
