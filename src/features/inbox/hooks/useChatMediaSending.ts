import { useState, useRef, useCallback, useEffect } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMediaUrl } from '@/utils/normalizeMediaUrl';
import { toast } from 'sonner';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { newRequestId } from '@/lib/withRequestId';
import type { AudioMemeItem } from '@/hooks/useAudioManagement';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import { resolveContactRef, isUuidRef } from '../utils/contactRef';
import { insertAuxMessage } from './useAuxiliaryMessageLog';

/**
 * Encapsulates WhatsApp instance resolution and media-message sending
 * (stickers, custom emojis, audio memes) to keep ChatPanel lean.
 *
 * HISTORICO:
 * - Audit 02/05/2026: safe-guard em contactPhone, retry no updateMessageStatus.
 * - 2026-07-08: removida referencia a tabela fantasma `evolution_contacts`.
 *   Resolucao de instancia agora usa exclusivamente `contacts.whatsapp_connection_id`
 *   + fallback para primeira conexao ativa.
 * - 2026-07-31 (E14-A): inserts de mensagens auxiliares roteados via
 *   insertAuxMessage. JID mode: skip (Evolution API persiste automaticamente).
 *   UUID mode: insert em zapp.messages como antes.
 */
export function useChatMediaSending(
  contactId: string,
  contactPhone: string | undefined,
  instanceHint?: string
) {
  const [instanceName, setInstanceName] = useState(instanceHint ?? '');
  const [whatsappConnectionId, setWhatsappConnectionId] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  // Accept external instance hint (propagated from inbox source)
  useEffect(() => {
    if (instanceHint) setInstanceName(instanceHint);
  }, [instanceHint]);

  useEffect(() => {
    resolvedRef.current = false;
    if (!instanceHint) {
      setInstanceName('');
    }
    setWhatsappConnectionId(null);
  }, [contactId, instanceHint]);

  const { sendStickerMessage } = useEvolutionApi();

  /** Safely extract digits from phone, returns empty string if undefined */
  const getSafePhone = useCallback((): string => {
    if (!contactPhone) return '';
    return contactPhone.replace(/\D/g, '');
  }, [contactPhone]);

  /** Update message status with error logging and 1 retry */
  const updateMessageStatus = useCallback(
    async (messageId: string, status: string, externalId?: string | null) => {
      const payload: { status: string; external_id?: string | null } = { status };
      if (externalId) payload.external_id = externalId;

      try {
        const { error } = await supabase.from('messages').update(payload).eq('id', messageId);

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
    },
    []
  );

  const resolveInstance = useCallback(async (): Promise<string> => {
    if (instanceName) return instanceName;
    if (!isUuidRef(resolveContactRef(contactId))) return '';

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
          .select('instance_id, instance_name')
          .eq('id', connectionId)
          .maybeSingle();
        const resolved = conn ? evolutionInstanceName(conn) : null;
        if (resolved) {
          setInstanceName(resolved);
          return resolved;
        }
        // specific connection exists but has no routable name (UUID-only) — do not fall back
        return '';
      }

      const { data: fallbackConn } = await supabase
        .from('whatsapp_connections')
        .select('id, instance_id, instance_name')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      const fallbackResolved = fallbackConn ? evolutionInstanceName(fallbackConn) : null;
      if (fallbackResolved) {
        setInstanceName(fallbackResolved);
        const connId = (fallbackConn as unknown as { id?: string }).id;
        if (connId) setWhatsappConnectionId(connId);
        return fallbackResolved;
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
    const resolved = instanceName || (await resolveInstance());
    if (!resolved || !contactPhone) {
      toast.error('Conexao WhatsApp nao disponivel.');
      return null;
    }
    return resolved;
  }, [instanceName, resolveInstance, contactPhone]);

  const handleSendSticker = useCallback(
    async (stickerUrl: string) => {
      const inst = await ensureInstance();
      if (!inst) return;

      const phone = getSafePhone();
      if (!phone) {
        toast.error('Telefone do contato nao disponivel.');
        return;
      }

      try {
        // E14-A: roteamento correto UUID→messages / JID→skip
        const { id: messageId, mode: insertMode } = await insertAuxMessage({
          contactId,
          whatsappConnectionId,
          content: '[Sticker]',
          messageType: 'sticker',
          mediaUrl: stickerUrl,
        });

        let externalId: string | null = null;

        try {
          const result = await sendStickerMessage(inst, phone, stickerUrl);
          externalId = (result as any)?.key?.id || null;
        } catch (err: unknown) {
          if (messageId && insertMode === 'local') await updateMessageStatus(messageId, 'failed');
          toast.error(err instanceof Error ? err.message : 'Erro ao enviar figurinha');
          return;
        }

        if (!externalId) {
          if (messageId && insertMode === 'local') await updateMessageStatus(messageId, 'failed');
          toast.error('Erro ao enviar figurinha: falha na API');
          return;
        }

        if (messageId && insertMode === 'local') {
          await updateMessageStatus(messageId, 'sent', externalId);
        }

        // Auto-save sticker
        try {
          const { data: existing } = await supabase
            .from('stickers')
            .select('id')
            .eq('image_url', stickerUrl)
            .maybeSingle();

          if (!existing) {
            const {
              data: { user },
            } = await supabase.auth.getUser();
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
    },
    [
      ensureInstance,
      contactId,
      whatsappConnectionId,
      sendStickerMessage,
      getSafePhone,
      updateMessageStatus,
    ]
  );

  const handleSendCustomEmoji = useCallback(
    async (emojiUrl: string) => {
      const inst = await ensureInstance();
      if (!inst) return;

      const phone = getSafePhone();
      if (!phone) {
        toast.error('Telefone do contato nao disponivel.');
        return;
      }

      try {
        const isUrl = emojiUrl.startsWith('http');
        const trace = newRequestId('emoji');

        const apiPromise = isUrl
          ? supabase.functions.invoke('evolution-api', {
              method: 'POST',
              body: {
                action: 'send-media',
                instanceName: inst,
                number: phone,
                mediaUrl: emojiUrl,
                mediaType: 'image',
              },
              headers: trace.headers,
            })
          : supabase.functions.invoke('evolution-api', {
              method: 'POST',
              body: { action: 'send-text', instanceName: inst, number: phone, text: emojiUrl },
              headers: trace.headers,
            });

        // E14-A: roteamento correto via insertAuxMessage
        const auxPromise = insertAuxMessage({
          contactId,
          whatsappConnectionId,
          content: isUrl ? '[Emoji]' : emojiUrl,
          messageType: isUrl ? 'image' : 'text',
          mediaUrl: isUrl ? emojiUrl : null,
          requestId: trace.requestId,
        });

        const results = await Promise.allSettled([apiPromise, auxPromise]);
        const apiResult =
          results[0].status === 'fulfilled' ? results[0].value : { error: true, data: null };
        const auxResult =
          results[1].status === 'fulfilled'
            ? results[1].value
            : { id: null, mode: 'skip' as const };

        const messageId = auxResult.id;
        const externalId = apiResult?.data?.key?.id || null;

        if (results[0].status === 'rejected') {
          if (messageId && auxResult.mode === 'local')
            await updateMessageStatus(messageId, 'failed');
          toast.error('Erro ao enviar emoji');
          return;
        }

        if (apiResult?.error || !externalId) {
          if (messageId && auxResult.mode === 'local')
            await updateMessageStatus(messageId, 'failed');
          toast.error('Erro ao enviar emoji');
          return;
        }

        if (messageId && auxResult.mode === 'local') {
          await updateMessageStatus(messageId, 'sent', externalId);
        }
        toast.success('Emoji enviado!');
      } catch {
        toast.error('Erro ao enviar emoji');
      }
    },
    [ensureInstance, contactId, whatsappConnectionId, getSafePhone, updateMessageStatus]
  );

  const handleSendAudioMeme = useCallback(
    async (meme: AudioMemeItem | string) => {
      const inst = await ensureInstance();
      if (!inst) return;

      const phone = getSafePhone();
      if (!phone) {
        toast.error('Telefone do contato nao disponivel.');
        return;
      }

      try {
        const audioUrl = typeof meme === 'string' ? meme : meme.audio_url;
        const memeId = typeof meme === 'string' ? null : (meme.id ?? null);
        const normalizedAudioUrl = normalizeMediaUrl(audioUrl);
        const trace = newRequestId('audio');

        const apiPromise = supabase.functions.invoke('evolution-api', {
          body: {
            action: 'send-audio',
            instanceName: inst,
            number: phone,
            audio: normalizedAudioUrl,
            encoding: true,
            isPtt: true, // Audio memes MUST appear as voice notes (green waveform)
            audio_meme_id: memeId,
          },
          headers: trace.headers,
        });

        // E14-A: roteamento correto via insertAuxMessage
        const auxPromise = insertAuxMessage({
          contactId,
          whatsappConnectionId,
          content: '[Audio Meme]',
          messageType: 'audio',
          mediaUrl: normalizedAudioUrl,
          requestId: trace.requestId,
          audioMemeId: memeId,
        });

        const results = await Promise.allSettled([apiPromise, auxPromise]);
        const apiResult =
          results[0].status === 'fulfilled' ? results[0].value : { error: true, data: null };
        const auxResult =
          results[1].status === 'fulfilled'
            ? results[1].value
            : { id: null, mode: 'skip' as const };

        const messageId = auxResult.id;

        if (results[0].status === 'rejected') {
          log.error('Audio meme send failed - rejected promise');
          if (messageId && auxResult.mode === 'local')
            await updateMessageStatus(messageId, 'failed');
          toast.error('Erro ao enviar audio meme');
          return;
        }

        if (apiResult?.error || !apiResult?.data?.key?.id) {
          log.error('Audio meme send failed', apiResult?.error);
          if (messageId && auxResult.mode === 'local')
            await updateMessageStatus(messageId, 'failed');
          toast.error('Erro ao enviar audio meme');
          return;
        }

        const externalId = apiResult.data.key.id;
        if (messageId && auxResult.mode === 'local') {
          await updateMessageStatus(messageId, 'sent', externalId);
        }
        toast.success('Audio meme enviado!');
      } catch (err) {
        log.error('handleSendAudioMeme error', err);
        toast.error('Erro ao enviar audio meme');
      }
    },
    [ensureInstance, contactId, whatsappConnectionId, getSafePhone, updateMessageStatus]
  );

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
