// Message-specific handlers for evolution-webhook: incoming, outgoing, sticker, transcription

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  isRecord, normalizePhone, resolveEventJid,
  getConnectionByInstance, getContactByPhone, fetchProfilePicFromApi, persistProfilePicture,
  generatePhoneVariants,
} from "./evolution-helpers.ts";
import { persistMediaToStorage, persistMediaViaApi, parseMessageContent, isSafeMediaCdnUrl } from "./evolution-media.ts";

/** evolution-webhook-messages utilities and exports. */
export async function handleOutgoingWhatsAppMessage(
  supabase: SupabaseClient, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
) {
  const externalId = key.id;
  const evo = () => supabase.schema('evo').from('evolution_messages');

  const { data: existingMessage } = await evo().select('id')
    .eq('message_id', externalId).eq('instance_name', instance).maybeSingle();
  if (existingMessage) return;

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);
  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[FROM_ME] Ignored message ${externalId}: unresolved recipient`, { bestJid });
    return;
  }

  const contact = await getContactByPhone(supabase, phone, connection.id);
  if (!contact) return;

  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;
  if (!parsed.content && parsed.messageType === 'text') return;

  let { mediaUrl } = parsed;
  if (mediaUrl && ['image', 'video', 'audio', 'document'].includes(parsed.messageType)) {
    const msgId = key.id.replace(/[^a-zA-Z0-9]/g, '');
    const permanentUrl = await persistMediaToStorage(supabase, mediaUrl, parsed.messageType, msgId);
    if (permanentUrl) mediaUrl = permanentUrl;
    else { const apiUrl = await persistMediaViaApi(supabase, instance, data, parsed.messageType, msgId); if (apiUrl) mediaUrl = apiUrl; }
  }

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  const recentCutoff = new Date(Date.now() - 300_000).toISOString();
  const { data: pendingMessage } = await evo().select('id')
    .eq('contact_id', contact.id).eq('from_me', true).eq('message_type', parsed.messageType)
    .is('message_id', null).gte('created_at', recentCutoff)
    .order('created_at', { ascending: true }).limit(1).maybeSingle();

  if (pendingMessage?.id) {
    const { data: claimed, error: claimError } = await evo()
      .update({ status: 'sent', message_id: externalId, status_at: new Date().toISOString() })
      .eq('id', pendingMessage.id)
      .is('message_id', null)
      .select('id');
    if (claimError) { console.error('[FROM_ME] Error claiming placeholder:', claimError); return; }
    if (claimed?.length) return;
  }

  const { data: raceCheck } = await evo()
    .select('id')
    .eq('message_id', externalId)
    .eq('instance_name', instance)
    .maybeSingle();
  if (raceCheck) return;

  const { data: insertedMessage, error: msgError } = await evo().upsert({
    contact_id: contact.id,
    instance_name: instance,
    message_id: externalId,
    remote_jid: bestJid,
    from_me: true,
    direction: 'outbound',
    content: parsed.content,
    message_type: parsed.messageType,
    media_url: mediaUrl,
    agent_id: contact.assigned_to || null,
    status: 'sent',
    created_at: messageCreatedAt,
    status_at: new Date().toISOString(),
  }, { onConflict: 'message_id,instance_name', ignoreDuplicates: true }).select('id').maybeSingle();

  if (msgError) { console.error('[FROM_ME] Error inserting outgoing message:', msgError); return; }
  if (!insertedMessage) return; // ON CONFLICT DO NOTHING: concurrent writer already persisted this message
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
}

/** handle Incoming Message function. */
export async function handleIncomingMessage(
  supabase: SupabaseClient, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
  supabaseUrl: string, supabaseServiceKey: string
) {
  const payloadKey = isRecord(data.key) ? data.key : null;
  const bestJid = resolveEventJid(key, payloadKey, data);
  const phone = normalizePhone(bestJid ?? undefined);
  if (!phone || bestJid?.includes('@g.us')) {
    console.log(`[INCOMING] Ignored message ${key.id}: unresolved sender`, { bestJid });
    return;
  }
  const message = data.message as Record<string, unknown> | undefined;
  const parsed = parseMessageContent(message, data);
  if (parsed.messageType === 'reaction') return;

  let { mediaUrl } = parsed;
  const { content, messageType } = parsed;

  if (messageType === 'sticker') {
    mediaUrl = await handleStickerMedia(supabase, instance, data, message, key);
  }

  if (mediaUrl && ['image', 'video', 'audio', 'document'].includes(messageType)) {
    const msgId = key.id || `${Date.now()}`;
    const permanentUrl = await persistMediaToStorage(supabase, mediaUrl, messageType, msgId);
    if (permanentUrl) mediaUrl = permanentUrl;
    else {
      const apiUrl = await persistMediaViaApi(supabase, instance, data, messageType, msgId);
      if (apiUrl) mediaUrl = apiUrl;
    }
  }

  const connection = await getConnectionByInstance(supabase, instance);
  if (!connection) return;

  let contact = await getContactByPhone(supabase, phone, connection.id);

  if (!contact) {
    let avatarUrl: string | null = null;
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
    const { data: newContact, error: insertErr } = await supabase.from('contacts').insert({
      phone,
      name: (data.pushName as string) || phone,
      avatar_url: avatarUrl,
      whatsapp_connection_id: connection.id,
      instance_name: instance,
      remote_jid: bestJid || `${phone}@s.whatsapp.net`,
    }).select('id, avatar_url, assigned_to, name').single();
    if (insertErr && insertErr.code === '23505') {
      const phonesVariants = generatePhoneVariants(phone);
      const { data: existing } = await supabase.from('contacts').select('id, avatar_url, assigned_to, name')
        .in('phone', phonesVariants).eq('whatsapp_connection_id', connection.id).limit(1).maybeSingle();
      if (existing) {
        contact = existing;
        await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', existing.id);
        console.log(`[CONTACT] Recovered existing contact ${existing.id} after duplicate insert conflict (instance: ${instance})`);
      }
    } else {
      contact = newContact;
    }
  } else if (!contact.avatar_url || (() => { try { return new URL(contact.avatar_url).hostname.endsWith('.whatsapp.net'); } catch { return false; } })()) {
    const picUrl = await fetchProfilePicFromApi(instance, phone);
    if (picUrl) {
      const avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
      if (avatarUrl) await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', contact.id);
    }
  }

  if (!contact) return;

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  const evo = () => supabase.schema('evo').from('evolution_messages');

  const { data: existingMessage } = await evo()
    .select('id, status, content').eq('message_id', key.id).eq('instance_name', instance).maybeSingle();

  if (existingMessage?.id) {
    const preservedStatus = existingMessage.status && existingMessage.status !== 'received' ? existingMessage.status : 'received';
    const preservedContent = existingMessage.status === 'deleted' ? (existingMessage.content || '[Mensagem apagada]') : content;
    const { error: updateErr } = await evo().update({
      contact_id: contact.id,
      content: preservedContent,
      message_type: messageType,
      media_url: mediaUrl,
      from_me: false,
      direction: 'inbound',
      status: preservedStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', existingMessage.id);
    if (updateErr) console.error('[INCOMING] Error updating existing message:', { updateErr, messageId: existingMessage.id });
    if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, contact.id, existingMessage.id, mediaUrl, supabaseUrl, supabaseServiceKey);
    return;
  }

  const { data: insertedMessage, error: msgError } = await evo().insert({
    contact_id: contact.id,
    instance_name: instance,
    message_id: key.id,
    from_me: false,
    direction: 'inbound',
    content,
    message_type: messageType,
    media_url: mediaUrl,
    status: 'received',
    remote_jid: bestJid || `${phone}@s.whatsapp.net`,
    push_name: (data.pushName as string) || null,
    created_at: messageCreatedAt,
  }).select('id').maybeSingle();

  if (msgError) {
    if (msgError.code === '23505') return; // concurrent webhook already inserted this message
    console.error('Error inserting message:', { msgError, externalId: key.id, bestJid, phone, messageType, content });
    return;
  }
  if (!insertedMessage) return; // ON CONFLICT DO NOTHING: concurrent writer won the race
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
  if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, contact.id, insertedMessage.id, mediaUrl, supabaseUrl, supabaseServiceKey);
}

/** handle Sticker Media function. */
export async function handleStickerMedia(
  supabase: SupabaseClient, instance: string, data: Record<string, unknown>,
  message: Record<string, unknown> | undefined, key: { id: string }
): Promise<string | null> {
  let mediaUrl: string | null = null;

  const uploadBase64Sticker = async (base64Data: string): Promise<string | null> => {
    try {
      const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, '');
      const binaryStr = atob(cleanB64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      if (bytes.length < 50) return null;
      const fileName = `sticker_${Date.now()}_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
      const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000' });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(`stickers/${fileName}`);
        return urlData.publicUrl;
      }
      return null;
    } catch { return null; }
  };

  const b64Direct = (data.base64 as string) || ((message?.stickerMessage as Record<string, unknown>)?.base64 as string);
  if (b64Direct) mediaUrl = await uploadBase64Sticker(b64Direct);

  if (!mediaUrl) {
    const directMediaUrl = (data.mediaUrl as string) || ((message?.stickerMessage as Record<string, unknown>)?.mediaUrl as string);
    if (directMediaUrl && isSafeMediaCdnUrl(directMediaUrl)) {
      try {
        const resp = await fetch(directMediaUrl, { signal: AbortSignal.timeout(10000), redirect: 'error' });
        if (resp.ok) {
          const arrayBuf = await resp.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          if (bytes.length > 100) {
            const fileName = `sticker_${Date.now()}_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
            const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000' });
            if (!uploadErr) { const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(`stickers/${fileName}`); mediaUrl = urlData.publicUrl; }
          }
        }
      } catch (dlErr) { console.error('[STICKER] mediaUrl download error:', dlErr); }
    }
  }

  if (!mediaUrl) {
    try {
      const evolutionUrl = Deno.env.get('EVOLUTION_API_URL');
      const evolutionKey = Deno.env.get('EVOLUTION_API_KEY');
      if (evolutionUrl && evolutionKey) {
        const apiUrl = `${evolutionUrl.replace(/\/+$/, '')}/chat/getBase64FromMediaMessage/${instance}`;
        const resp = await fetch(apiUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': evolutionKey },
          body: JSON.stringify({ message: { key: data.key, message: data.message }, convertToMp4: false }),
          signal: AbortSignal.timeout(15000),
        });
        if (resp.ok) {
          const result = await resp.json();
          const b64 = (result.base64 as string) || (result.data as string) || (result.media as string);
          if (b64) mediaUrl = await uploadBase64Sticker(b64);
        }
      }
    } catch (apiErr) { console.error('[STICKER] API fetch error:', apiErr); }
  }

  if (mediaUrl) {
    try {
      const { data: existing } = await supabase.from('stickers').select('id').eq('image_url', mediaUrl).maybeSingle();
      if (!existing) {
        let category = 'recebidas';
        try {
          const classifyResp = await fetch(`${(Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))}/functions/v1/classify-sticker`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}` },
            body: JSON.stringify({ image_url: mediaUrl }), signal: AbortSignal.timeout(20000),
          });
          if (classifyResp.ok) { const classifyResult = await classifyResp.json(); category = classifyResult.category || 'recebidas'; }
        } catch { /* classification failed, use default */ }
        await supabase.from('stickers').insert({ name: `Recebida ${new Date().toLocaleDateString('pt-BR')}`, image_url: mediaUrl, category, is_favorite: false, use_count: 0 });
      }
    } catch { /* save error */ }
  }

  return mediaUrl;
}

export async function handleAudioTranscription(supabase: SupabaseClient, _contactId: string, messageId: string, mediaUrl: string, supabaseUrl: string, supabaseServiceKey: string) {
  const { data: globalSetting } = await supabase.from('global_settings')
    .select('value').eq('key', 'auto_transcription_enabled').maybeSingle();
  if (globalSetting?.value === 'false') return;

  const evo = () => supabase.schema('evo').from('evolution_messages');

  await evo().update({ transcription_status: 'processing', updated_at: new Date().toISOString() }).eq('id', messageId);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-transcribe-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ audioUrl: mediaUrl, messageId }),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const result = await response.json();
      await evo().update({ transcription: result.text, transcription_status: 'completed', updated_at: new Date().toISOString() }).eq('id', messageId);
    } else {
      await evo().update({ transcription_status: 'failed', updated_at: new Date().toISOString() }).eq('id', messageId);
    }
  } catch {
    await evo().update({ transcription_status: 'failed', updated_at: new Date().toISOString() }).eq('id', messageId);
  }
}
