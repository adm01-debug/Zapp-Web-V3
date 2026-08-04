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
 * 3. Registering the handoff in `conversation_transfers` (+ optional
 *    `transfer_comments` with the TransferDialog message) so
 *    `rpc_list_transfers_paginated` has rows to list in the admin UI.
 * 4. Providing proper error handling with user-facing feedback.
 *
 * The audit writes (3) are best-effort: a denial there must never break the
 * transfer itself (contacts update + timeline message already succeeded).
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
        const authUserId = userData.user?.id ?? null;

        // Identidade do agente: zapp.profiles (user_id = auth.uid()). O
        // restante do app referencia agentes por profiles.id (assigned_to,
        // queue_members.profile_id, agent_stats.profile_id), então o registro
        // de transferência usa o mesmo id para RLS/RPCs baterem.
        let profile: { id: string; name: string | null } | null = null;
        let contact: Record<string, unknown> | null = null;
        let conversation: { id: string } | null = null;
        try {
          const [profileRes, contactRes, conversationRes] = await Promise.all([
            authUserId
              ? dbFrom('profiles').select('id, name').eq('user_id', authUserId).maybeSingle()
              : Promise.resolve({ data: null as { id: string; name: string | null } | null, error: null }),
            dbFrom('contacts')
              .select('name, remote_jid, queue_id, instance_name')
              .eq('id', contactId)
              .maybeSingle(),
            dbFrom('conversations')
              .select('id')
              .eq('contact_id', contactId)
              .limit(1)
              .maybeSingle(),
          ]);
          profile = profileRes?.data ?? null;
          contact = contactRes?.data ?? null;
          conversation = conversationRes?.data ?? null;
        } catch (lookupErr) {
          // Lookups são best-effort: a transferência principal não depende deles.
          log.warn('Transfer context lookup failed, proceeding with nulls:', lookupErr);
        }
        const agentId = profile?.id ?? authUserId;

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

        // Audit trail: conversation_transfers + transfer_comments — alimenta
        // rpc_list_transfers_paginated (admin). Best-effort: falha aqui não
        // desfaz a transferência já efetuada.
        try {
          const transferPayload: Record<string, unknown> = {
            contact_id: contactId,
            contact_name: (contact as { name?: string | null } | null)?.name ?? null,
            remote_jid: (contact as { remote_jid?: string | null } | null)?.remote_jid ?? null,
            from_agent_id: agentId,
            from_queue_id: (contact as { queue_id?: string | null } | null)?.queue_id ?? null,
            transfer_type: type,
            status: 'closed',
            reason: message ?? null,
            source_conversation_id: conversation?.id ?? null,
            source_instance:
              (contact as { instance_name?: string | null } | null)?.instance_name ??
              whatsappConnectionId ??
              null,
            created_at: new Date().toISOString(),
          };
          if (type === 'agent') {
            transferPayload.to_agent_id = targetId;
          } else {
            transferPayload.to_queue_id = targetId;
          }

          const { data: transferRow, error: transferErr } = await dbFrom('conversation_transfers')
            .insert(transferPayload)
            .select('id')
            .single();

          if (transferErr) throw transferErr;

          // Comentário do TransferDialog: vira transfer_comments (content é
          // NOT NULL — só escreve quando há mensagem).
          if (message && transferRow?.id) {
            const { error: commentErr } = await dbFrom('transfer_comments').insert({
              transfer_id: transferRow.id,
              agent_id: agentId,
              author_instance: whatsappConnectionId ?? '', // coluna NOT NULL
              author_name: profile?.name ?? 'Atendente',
              content: message,
              created_at: new Date().toISOString(),
            });
            if (commentErr) throw commentErr;
          }
        } catch (auditErr) {
          log.error('Transfer audit write failed (transfer still completed):', auditErr);
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
