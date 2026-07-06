import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { log } from '@/lib/logger';

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
 */
export function useChatScheduleMessage({ contactId, scheduleMessage, onDone }: Params) {
  return useCallback(
    async (content: string, scheduledAt: Date, attachment?: File) => {
      try {
        let mediaUrl: string | undefined;
        let messageType = 'text';
        if (attachment) {
          const fileName = `scheduled_${Date.now()}_${attachment.name}`;
          const { error: uploadError } = await supabase.storage
            .from('whatsapp-media')
            .upload(fileName, attachment);
          if (uploadError) {
            toast({
              title: 'Erro no upload',
              description: `Falha ao anexar: ${uploadError.message}`,
              variant: 'destructive',
            });
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
      }
    },
    [contactId, scheduleMessage, onDone],
  );
}
