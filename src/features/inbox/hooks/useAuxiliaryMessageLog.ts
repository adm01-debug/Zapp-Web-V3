/**
 * useAuxiliaryMessageLog — roteamento de inserts de mensagens auxiliares.
 *
 * PROBLEMA D-17:
 * useChatMediaSending.ts inseria sticker/emoji/audio em zapp.messages
 * com contact_id = JID → PostgREST 400 ("invalid input syntax for type uuid").
 * Mensagens nao apareciam no historico local apos o envio.
 *
 * SOLUCAO:
 * - UUID → insert em zapp.messages (historico local, UI otimista)
 * - JID  → skip: Evolution API persiste em evo.evolution_messages
 *          automaticamente via webhook ao confirmar o envio.
 *          A mensagem aparece no chat via Realtime subscription.
 *
 * Erros sao logados e absorvidos — nunca propagados ao caller,
 * pois a mensagem ja foi enviada via WhatsApp independentemente.
 */

import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { resolveContactRef, isUuidRef } from '@/features/inbox/utils/contactRef';

export interface AuxMessageInsert {
  contactId: string;
  whatsappConnectionId: string | null;
  content: string;
  messageType: string;
  mediaUrl?: string | null;
  /** Status inicial. Default: 'sending' (UUID) ou ignorado (JID). */
  status?: string;
  requestId?: string | null;
  audioMemeId?: string | null;
}

export interface AuxMessageResult {
  /** ID da linha inserida; null se JID mode ou erro. */
  id: string | null;
  /**
   * 'local' = inseriu em zapp.messages (UUID contact)
   * 'skip'  = JID mode, Evolution API grava automaticamente
   */
  mode: 'local' | 'skip';
}

/**
 * Registra uma mensagem auxiliar no banco correto baseado no tipo do contactId.
 * Nunca lanca excecao — retorna { id: null, mode } em caso de erro.
 */
export async function insertAuxMessage(
  payload: AuxMessageInsert
): Promise<AuxMessageResult> {
  const {
    contactId,
    whatsappConnectionId,
    content,
    messageType,
    mediaUrl = null,
    status = 'sending',
    requestId = null,
    audioMemeId = null,
  } = payload;

  const ref = resolveContactRef(contactId);

  if (!ref) {
    log.warn('[insertAuxMessage] contactId invalido — omitindo insert:', contactId);
    return { id: null, mode: 'skip' };
  }

  if (!isUuidRef(ref)) {
    // JID mode: Evolution API grava em evo.evolution_messages via webhook.
    // Nenhum insert local necessario — a mensagem aparece via Realtime.
    return { id: null, mode: 'skip' };
  }

  // UUID mode: insert no historico local para UI otimista.
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        contact_id: ref.uuid,
        whatsapp_connection_id: whatsappConnectionId,
        content,
        message_type: messageType,
        media_url: mediaUrl,
        sender: 'agent',
        status,
        ...(requestId ? { request_id: requestId } : {}),
        ...(audioMemeId ? { audio_meme_id: audioMemeId } : {}),
      })
      .select('id')
      .maybeSingle();

    if (error) {
      log.error('[insertAuxMessage] insert falhou:', error.message, { contactId, messageType });
      return { id: null, mode: 'local' };
    }

    return { id: data?.id ?? null, mode: 'local' };
  } catch (err) {
    log.error('[insertAuxMessage] excecao:', err, { contactId, messageType });
    return { id: null, mode: 'local' };
  }
}
