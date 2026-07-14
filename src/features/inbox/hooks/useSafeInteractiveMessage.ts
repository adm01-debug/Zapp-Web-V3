import { useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useSafeInteractiveMessage');
import { toast } from '@/hooks/use-toast';
import { dbFrom } from '@/integrations/datasource/db';

interface UseSafeInteractiveMessageOptions {
  contactId: string;
  whatsappConnectionId: string | undefined;
}

/**
 * Safe handlers for inserting poll/contact-card records into the messages table.
 *
 * CRITICAL FIX: The original inline handlers in ChatPanel used `status: 'sent'`
 * which falsely indicated the message was delivered to WhatsApp. In reality,
 * these messages were only inserted into the database without being sent via
 * the Evolution API.
 *
 * This hook fixes the issue by:
 * - Using `status: 'sending'` to accurately reflect that the message is
 *   pending delivery via the backend job/webhook pipeline.
 * - Adding error handling with user-facing toast notifications.
 * - Guarding against undefined `whatsappConnectionId` which could create
 *   orphan records.
 *
 * NOTE: For polls and contacts to actually reach the WhatsApp contact,
 * a backend Edge Function or webhook handler must pick up messages with
 * `status: 'sending'` and deliver them via the Evolution API. If that
 * pipeline doesn't exist yet, this status change will at least prevent
 * the UI from showing false "sent" indicators.
 */
export function useSafeInteractiveMessage({
  contactId,
  whatsappConnectionId,
}: UseSafeInteractiveMessageOptions) {
  const sendPollRecord = useCallback(
    async (poll: { name: string; options: string[] }) => {
      if (!whatsappConnectionId) {
        toast({
          title: 'Conexão WhatsApp não encontrada',
          description: 'Não foi possível enviar a enquete. Verifique a conexão.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const content = `📊 *Enquete:* ${poll.name}\n${poll.options
          .map((o, i) => `${i + 1}. ${o}`)
          .join('\n')}`;

        const { error } = await dbFrom('messages').insert({
          contact_id: contactId,
          whatsapp_connection_id: whatsappConnectionId,
          content,
          message_type: 'text',
          sender: 'agent',
          status: 'sending', // Was incorrectly 'sent' — message hasn't been delivered yet
        });

        if (error) throw error;
      } catch (err) {
        log.error('Failed to insert poll message:', err);
        toast({
          title: 'Erro ao enviar enquete',
          description: 'Não foi possível registrar a enquete. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [contactId, whatsappConnectionId],
  );

  const sendContactCardRecord = useCallback(
    async (contactName: string) => {
      if (!whatsappConnectionId) {
        toast({
          title: 'Conexão WhatsApp não encontrada',
          description: 'Não foi possível enviar o contato. Verifique a conexão.',
          variant: 'destructive',
        });
        return;
      }

      try {
        const { error } = await dbFrom('messages').insert({
          contact_id: contactId,
          whatsapp_connection_id: whatsappConnectionId,
          content: `📇 Cartão de contato: ${contactName}`,
          message_type: 'text',
          sender: 'agent',
          status: 'sending', // Was incorrectly 'sent' — message hasn't been delivered yet
        });

        if (error) throw error;
      } catch (err) {
        log.error('Failed to insert contact card message:', err);
        toast({
          title: 'Erro ao enviar contato',
          description: 'Não foi possível registrar o cartão de contato. Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [contactId, whatsappConnectionId],
  );

  return { sendPollRecord, sendContactCardRecord };
}
