import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getLogger } from '@/lib/logger';

const log = getLogger('useScheduledMediaUpload');

interface UploadResult {
  mediaUrl: string | undefined;
  messageType: string;
}

/**
 * Handles media upload for scheduled messages with proper error handling.
 *
 * Fixes two issues from the original inline implementation in ChatPanel:
 *
 * 1. **Signed URL TTL was 1 hour (3600s)** — if a message is scheduled for
 *    the next day, the URL would expire before the sending job runs.
 *    Now uses 7 days (604800s).
 *
 * 2. **Upload errors were silently swallowed** — if the upload failed, the
 *    message was scheduled without the attachment and the agent never knew.
 *    Now shows a destructive toast and returns undefined mediaUrl so the
 *    caller can decide whether to proceed without media.
 */
export function useScheduledMediaUpload() {
  const uploadScheduledMedia = useCallback(async (attachment: File): Promise<UploadResult> => {
    const fileName = `scheduled_${Date.now()}_${attachment.name}`;

    const { error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, attachment);

    if (uploadError) {
      log.error('Scheduled media upload failed:', uploadError);
      toast({
        title: 'Erro no upload do anexo',
        description: `Não foi possível anexar "${attachment.name}": ${uploadError.message}. A mensagem será agendada sem o anexo.`,
        variant: 'destructive',
      });
      return { mediaUrl: undefined, messageType: 'text' };
    }

    // Use 7-day TTL (604800s) instead of 1-hour to support messages
    // scheduled days in advance.
    const { data: signedData } = await supabase.storage
      .from('whatsapp-media')
      .createSignedUrl(fileName, 604800);

    const mediaUrl = signedData?.signedUrl;

    const messageType = attachment.type.startsWith('audio')
      ? 'audio'
      : attachment.type.startsWith('image')
        ? 'image'
        : attachment.type.startsWith('video')
          ? 'video'
          : 'document';

    return { mediaUrl, messageType };
  }, []);

  return { uploadScheduledMedia };
}
