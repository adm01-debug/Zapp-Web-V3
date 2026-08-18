import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';
import { isRlsDeniedError, rlsDeniedMessage } from '@/lib/errors/rlsError';

interface Params {
  contactId: string;
  scheduleMessage: (args: {
    contactId: string;
    content: string;
    scheduledAt: Date;
    messageType: string;
    mediaUrl?: string;
  }) => Promise<unknown>;
  onDone: () => void;
}

/**
 * Encapsulates the "schedule message" flow, including optional attachment
 * upload to the whatsapp-media bucket and signed-URL resolution.
 *
 * E39 (findings-04 A5): a signed URL do Supabase Storage expira em 7 dias
 * (TTL 604800s). Agendar mídia para MAIS de 7 dias cria uma URL quebrada na
 * hora da execução. Decisão registrada (E39.9): REJEITAR com erro claro —
 * não há maquinário de re-upload na execução, e "gerar signed URL curta +
 * re-upload" exigiria um job server-side inexistente.
 */
const MAX_MEDIA_SCHEDULE_MS = 7 * 24 * 60 * 60 * 1000; // TTL da signed URL (604800s)

export function useChatScheduleMessage({ contactId, scheduleMessage, onDone }: Params) {
  return useCallback(
    async (content: string, scheduledAt: Date, attachment?: File) => {
      try {
        // E39.9: bloqueio de agendamento inválido — mídia além do prazo da
        // signed URL. Valida ANTES do upload (não sobe arquivo à toa).
        if (attachment && scheduledAt.getTime() - Date.now() > MAX_MEDIA_SCHEDULE_MS) {
          toast({
            title: 'Prazo máximo de agendamento: 7 dias',
            description:
              'Anexos só podem ser agendados até 7 dias à frente (limite da URL assinada).',
            variant: 'destructive',
          });
          return;
        }
        let mediaUrl: string | undefined;
        let messageType = 'text';
        if (attachment) {
          const fileName = `scheduled_${crypto.randomUUID()}_${attachment.name}`;
          const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(fileName, attachment);
          if (uploadError) {
            toast({
              title: 'Erro no upload',
              description: `Falha ao anexar: ${uploadError.message}`,
              variant: 'destructive',
            });
            return;
          } else {
            const { data: signedData } = await supabase.storage
              .from('whatsapp-media')
              .createSignedUrl(fileName, 604800);
            mediaUrl = signedData?.signedUrl;
            messageType = attachment.type.startsWith('audio')
              ? 'audio'
              : attachment.type.startsWith('image')
                ? 'image'
                : attachment.type.startsWith('video')
                  ? 'video'
                  : 'document';
          }
        }
        await scheduleMessage({ contactId, content, scheduledAt, messageType, mediaUrl });
        onDone();
      } catch (err) {
        log.error('Failed to schedule message:', err);
        // CAMPANHAS-09: toast REAL em 403 — nunca silenciar nem mascarar a causa.
        toast({
          title: 'Erro ao agendar mensagem',
          description: isRlsDeniedError(err)
            ? `${rlsDeniedMessage('mensagens agendadas')} Verifique se o contato está visível para você.`
            : 'Tente novamente.',
          variant: 'destructive',
        });
      }
    },
    [contactId, scheduleMessage, onDone]
  );
}
