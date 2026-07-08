import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMediaUrl } from '@/utils/normalizeMediaUrl';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { newRequestId } from '@/lib/withRequestId';
import { dbFrom } from '@/integrations/datasource/db';

/**
 * Encapsulates WhatsApp instance resolution and media-message sending
 * (stickers, custom emojis, audio memes) to keep ChatPanel lean.
 *
 * HISTÓRICO:
 * - Audit 02/05/2026: safe-guard em contactPhone, retry no updateMessageStatus.
 * - 2026-07-08: removida referência à tabela fantasma `evolution_contacts`.
 *   Resolução de instância agora usa exclusivamente `contacts.whatsapp_connection_id`
 *   + fallback para primeira conexão ativa.
 */
export function useChatMediaSending(contactId: string, contactPhone: string | undefined) {
  const [instanceName, setInstanceName] = useState('');
  const [whatsappConnectionId, setWhatsappConnectionId] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  const { sendStickerMessage } = useEvolutionApi();

  /** Safely extract digits from phone, returns empty string if undefined */
  const getSafePhone = useCallback((): string => {
    if (!contactPhone) return '';
    return contactPhone.replace(/\D/g, '');
  }, [contactPhone]);

  /** Update message status with error logging and 1 retry */
  const updateMessageStatus = useCallback(async (
    messageId: string,
    status: string,
    externalId?: string | null
  ) => {
    const payload: any = { status };
    if (externalId) payload.external_id = externalId;

    try {
      const { error } = await supabase
        .from('messages')
        .update(payload)
        .eq('id', messageId);

      if (error) {
        log.error(`[updateMessageStatus] First attempt failed for ${messageId}:`, error.message);
        // Retry once
        const { error: retryError } = await supabase
          .from('messages')
          .update(payload)
          .eq('id', messageId);
        if (retryError) {
          log.error(`[updateMessageStatus] Retry failed for ${messageId}:`, retryError.message);
        }
      }
    } catch (err) {
      log.error(`[updateMessageStatus] Exception for ${messageId}:`, err);
    }
  }, []);

  const resolveInstance = useCallback(async (): Promise<string> => {
    if (instanceName) return instanceName;

    try {
      let connectionId: string | null = null;

      const { data: contact } = await supabase
        .from('contacts')
        .select('whatsapp_connection_id')
        .eq('id', contactId)
        .maybeSingle();

      if (contact?.whatsapp_connection_id) {
        connectionId = contact.whatsapp_connection_id;
      }

      if (connectionId) {
        setWhatsappConnectionId(connectionId);
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('instance_id')
          .eq('id', connectionId)
          .maybeSingle();
        if (conn?.instance_id) {
          setInstanceName(conn.instance_id);
          return conn.instance_id;
        }
      }

      const { data: fallbackConn } = await supabase
        .from('whatsapp_connections')
        .select('instance_id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      if (fallbackConn?.instance_id) {
        setInstanceName(fallbackConn.instance_id);
        return fallbackConn.instance_id;
      }
    } catch (err) {
      log.error('Failed to resolve WhatsApp instance:', err);
    }
    return '';
  }, [contactId, instanceName]);

  const initResolve = useCallback(async () => {
    if (!resolvedRef.current) {
      resolvedRef.current = true;
      await resolveInstance();
    }
  }, [resolveInstance]);

  const ensureInstance = useCallback(async (): Promise<string | null> => {
    const resolved = instanceName || await resolveInstance();
    if (!resolved || !contactPhone) {
      toast.error('Conexão WhatsApp não disponível.');
      return null;
    }
    return resolved;
  }, [instanceName, resolveInstance, contactPhone]);

  const handleSendSticker = useCallback(async (stickerUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) return;

    // BUG 2 FIX: Safe phone extraction instead of non-null assertion
    const phone = getSafePhone();
    if (!phone) {
      toast.error('Telefone do contato não disponível.');
      return;
    }

    try {
      const { data: dbData , error: dbDataErr } = await supabase.from('messages').insert({
        contact_id: contactId,
        whatsapp_connection_id: whatsappConnectionId,
        content: '[Sticker]',
        message_type: 'sticker',
        media_url: stickerUrl,
        sender: 'agent',
        status: 'sending',
      }).select('id').single();

      if (dbDataErr) {
        log.error('[Sticker] DB insert failed:', dbDataErr);
      }

      const messageId = dbData?.id;
      let externalId: string | null = null;

      try {
        const result = await sendStickerMessage(inst, phone, stickerUrl);
        externalId = result?.key?.id || null;
      } catch (err: unknown) {
        if (messageId) await updateMessageStatus(messageId, 'failed');
        toast.error(err instanceof Error ? err.message : 'Erro ao enviar figurinha');
        return;
      }

      if (!externalId) {
        if (messageId) await updateMessageStatus(messageId, 'failed');
        toast.error('Erro ao enviar figurinha: falha na API');
        return;
      }

      // FALHA 5 FIX: Proper error handling on status update
      if (messageId) {
        await updateMessageStatus(messageId, 'sent', externalId);
      }

      // FALHA 6 FIX: Auto-save with error handling
      try {
        const { data: existing , error: existingErr } = await supabase
          .from('stickers')
          .select('id')
          .eq('image_url', stickerUrl)
          .maybeSingle();

        if (!existing) {
          const { data: { user } } = await supabase.auth.getUser();
          const { error: saveError } = await supabase.from('stickers').insert({
            name: `Enviada ${new Date().toLocaleDateString('pt-BR')}`,
            image_url: stickerUrl,
            category: 'enviadas',
            is_favorite: false,
            use_count: 1,
            uploaded_by: user?.id || null,
          });
          if (saveError) {
            log.error('[auto-save sticker] Failed:', saveError.message);
          }
        }
      } catch (err) {
        log.error('[auto-save sticker] Exception:', err);
      }

      toast.success('Figurinha enviada!');
    } catch {
      toast.error('Erro ao enviar figurinha');
    }
  }, [ensureInstance, contactId, contactPhone, whatsappConnectionId, sendStickerMessage, getSafePhone, updateMessageStatus]);

  const handleSendCustomEmoji = useCallback(async (emojiUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) return;

    // BUG 2 FIX
    const phone = getSafePhone();
    if (!phone) {
      toast.error('Telefone do contato não disponível.');
      return;
    }

    try {
      const isUrl = emojiUrl.startsWith('http');
      const trace = newRequestId('emoji');

      const apiPromise = isUrl
        ? supabase.functions.invoke('evolution-api', { method: 'POST', body: { action: 'send-media', instanceName: inst, number: phone, mediaUrl: emojiUrl, mediaType: 'image' }, headers: trace.headers })
        : supabase.functions.invoke('evolution-api', { method: 'POST', body: { action: 'send-text', instanceName: inst, number: phone, text: emojiUrl }, headers: trace.headers });

      const dbPromise = dbFrom('messages').insert({
        contact_id: contactId, whatsapp_connection_id: whatsappConnectionId,
        content: isUrl ? '[Emoji]' : emojiUrl, message_type: isUrl ? 'image' : 'text',
        media_url: isUrl ? emojiUrl : null, sender: 'agent', status: 'sending',
        request_id: trace.requestId,
      }).select('id').single();

      const [apiResult, dbResult] = await Promise.all([apiPromise, dbPromise]);
      const messageId = dbResult?.data?.id;
      const externalId = apiResult?.data?.key?.id || null;

      if (apiResult?.error || !externalId) {
        if (messageId) await updateMessageStatus(messageId, 'failed');
        toast.error('Erro ao enviar emoji');
        return;
      }

      // FIX: proper await instead of fire-and-forget
      if (messageId) {
        await updateMessageStatus(messageId, 'sent', externalId);
      }
      toast.success('Emoji enviado!');
    } catch {
      toast.error('Erro ao enviar emoji');
    }
  }, [ensureInstance, contactId, contactPhone, whatsappConnectionId, getSafePhone, updateMessageStatus]);

  const handleSendAudioMeme = useCallback(async (meme: any) => {
    const inst = await ensureInstance();
    if (!inst) return;

    const phone = getSafePhone();
    if (!phone) {
      toast.error('Telefone do contato não disponível.');
      return;
    }

    try {
      const audioUrl = meme.audio_url || meme;
      const memeId = meme.id || null;
      const normalizedAudioUrl = normalizeMediaUrl(audioUrl);
      const trace = newRequestId('audio');

      // DOC ARCHITECTURE COMPLIANCE:
      // We still insert into local 'messages' (Lovable Cloud) for UI persistence,
      // but if we have a memeId, the backend (FATOR X) will handle use_count++ and audio_meme_id linkage
      // when we invoke the edge function.
      
      const apiPromise = supabase.functions.invoke('evolution-api', {
        body: { 
          action: 'send-audio', 
          instanceName: inst, 
          number: phone, 
          audio: normalizedAudioUrl, // Use 'audio' as per evolution-api index.ts
          encoding: true, 
          isPtt: true, // Audio memes MUST appear as voice notes (green waveform)
          audio_meme_id: memeId
        },
        headers: trace.headers,
      });

      const dbPromise = dbFrom('messages').insert({
        contact_id: contactId, 
        whatsapp_connection_id: whatsappConnectionId,
        content: '[Áudio Meme]', 
        message_type: 'audio',
        media_url: normalizedAudioUrl, 
        sender: 'agent', 
        status: 'sending',
        request_id: trace.requestId,
        // If your local 'messages' table has audio_meme_id, propagate it
        ...(memeId ? { audio_meme_id: memeId } : {})
      }).select('id').single();

      const [apiResult, dbResult] = await Promise.all([apiPromise, dbPromise]);
      const messageId = dbResult?.data?.id;

      if (apiResult?.error || !apiResult?.data?.key?.id) {
        log.error('Audio meme send failed', apiResult?.error);
        if (messageId) await updateMessageStatus(messageId, 'failed');
        toast.error('Erro ao enviar áudio meme');
        return;
      }

      const externalId = apiResult.data.key.id;
      if (messageId) {
        await updateMessageStatus(messageId, 'sent', externalId);
      }
      toast.success('🔊 Áudio meme enviado!');
    } catch (err) {
      log.error('handleSendAudioMeme error', err);
      toast.error('Erro ao enviar áudio meme');
    }
  }, [ensureInstance, contactId, contactPhone, whatsappConnectionId, getSafePhone, updateMessageStatus]);

  return {
    instanceName,
    whatsappConnectionId,
    initResolve,
    resolveInstance,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
  };
}
