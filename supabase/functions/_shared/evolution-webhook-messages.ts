// Message-specific handlers for evolution-webhook: incoming, outgoing, sticker, transcription

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evolutionClient } from "./providers/evolution/index.ts";
import {
  isRecord, normalizePhone, resolveEventJid,
  getConnectionByInstance, getContactByPhone, fetchProfilePicFromApi, persistProfilePicture,
  generatePhoneVariants,
} from "./evolution-helpers.ts";
import { persistMediaToStorage, persistMediaViaApi, parseMessageContent, isSafeMediaCdnUrl } from "./evolution-media.ts";
import { getStoragePublicUrl } from "./storage-url.ts";
import { ingestMessage } from "./ingest-port.ts";

/** evolution-webhook-messages utilities and exports. */

/**
 * ADR-001 / ADR-004: extrai bucket + path canônicos de uma URL do Storage self-hosted.
 * Só popula campos para URLs do nosso storage — CDN externo (mmg.whatsapp.net etc) retorna nulls.
 * Usar estes campos em vez de construir mediaUrl absoluta em código downstream.
 */
function extractStorageFields(url: string | null | undefined): {
  media_bucket: string | null;
  media_path: string | null;
  media_status: 'ready' | null;
} {
  if (!url) return { media_bucket: null, media_path: null, media_status: null };
  const BUCKETS = ['whatsapp-media', 'audio-messages', 'avatars', 'stickers'];
  for (const bucket of BUCKETS) {
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) {
      const path = url.slice(idx + marker.length).split('?')[0].split('#')[0];
      return { media_bucket: bucket, media_path: path, media_status: 'ready' };
    }
  }
  return { media_bucket: null, media_path: null, media_status: null };
}

export async function handleOutgoingWhatsAppMessage(
  supabase: SupabaseClient<any, any>, instance: string, data: Record<string, unknown>,
  key: { remoteJid?: string; remoteJidAlt?: string; participant?: string; participantAlt?: string; fromMe: boolean; id: string },
) {
  const externalId = key.id;
  const evo = () => supabase.from('evolution_messages');

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
  const { ingestMeta: outIngestMeta, quotedMessageId: outQuotedId, captionText: outCaption } = parsed;

  let { mediaUrl } = parsed;
  if (parsed.messageType === 'audio' && mediaUrl) {
    const msgId = key.id.replace(/[^a-zA-Z0-9]/g, '');
    const apiUrl = await persistMediaViaApi(supabase, instance, data, parsed.messageType, msgId);
    if (apiUrl) mediaUrl = apiUrl;
  } else if (mediaUrl && ['image', 'video', 'document'].includes(parsed.messageType)) {
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
    // F3-edge: claim via RPC canônico (rpc_claim_outbound_message)
    const claimResult = await supabase.rpc('rpc_claim_outbound_message', {
      p_row_id: pendingMessage.id, p_message_id: externalId,
    });
    if (claimResult.error) { console.error('[FROM_ME] Error claiming placeholder:', claimResult.error); return; }
    if (claimResult.data?.claimed) return; // race winner claimed the row
  }

  const { data: raceCheck } = await evo()
    .select('id')
    .eq('message_id', externalId)
    .eq('instance_name', instance)
    .maybeSingle();
  if (raceCheck) return;

  // F4: ingestMessage via RPC canônico (ON CONFLICT DO NOTHING + campos ricos ADR-004)
  const storageOut = extractStorageFields(mediaUrl);
  const outResult = await ingestMessage(supabase, {
    provider: 'evolution', instanceRef: instance, remoteJid: bestJid!,
    messageId: externalId, messageType: parsed.messageType, content: parsed.content ?? '',
    fromMe: true, direction: 'outbound',
    timestamp: new Date(messageCreatedAt), contactId: contact.id,
    mediaUrl: mediaUrl ?? undefined,
    mediaBucket: storageOut.media_bucket ?? undefined,
    mediaPath: storageOut.media_path ?? undefined,
    mediaStatus: storageOut.media_status ?? undefined,
    ingestMeta: outIngestMeta ?? undefined,
    mediaMeta: outIngestMeta ?? undefined,
    quotedMessageId: outQuotedId ?? undefined,
    caption: outCaption ?? undefined,
    status: 'sent', statusAt: new Date().toISOString(),
  });
  if (!outResult.ok) { console.error('[FROM_ME] Error inserting outgoing message:', outResult.error); return; }
  if (!outResult.rowId) return; // ON CONFLICT DO NOTHING: concurrent writer already persisted this message
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
}

/** [FIX 2026-08-12] Avatar em background: nunca bloquear o insert da mensagem
 *  no fetch/upload da foto de perfil — com volume alto, o isolate do edge-runtime
 *  era cancelado (early termination) antes do insert da mensagem e mensagens de
 *  contatos NOVOS se perdiam (~22-40%). Fire-and-forget com EdgeRuntime.waitUntil:
 *  sem ele, a promise é cancelada quando a resposta HTTP retorna.
 */
function persistAvatarInBackground(
  supabase: SupabaseClient<any, any>,
  instance: string,
  phone: string,
  contactId: string,
): void {
  const task = (async () => {
    try {
      const picUrl = await fetchProfilePicFromApi(instance, phone);
      if (!picUrl) return;
      const avatarUrl = await persistProfilePicture(supabase, phone, picUrl);
      if (avatarUrl) {
        await supabase.from('contacts').update({ avatar_url: avatarUrl }).eq('id', contactId);
      }
    } catch (e) {
      console.warn('[AVATAR-BG] failed:', e instanceof Error ? e.message : String(e));
    }
  })();
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) {
    rt.waitUntil(task);
  } else {
    // Fallback (testes/outros runtimes): apenas evita unhandled rejection
    task.catch(() => {});
  }
}

/** handle Incoming Message function. */
export async function handleIncomingMessage(
  supabase: SupabaseClient<any, any>, instance: string, data: Record<string, unknown>,
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
  const { content, messageType, ingestMeta, quotedMessageId, captionText } = parsed;

  if (messageType === 'sticker') {
    mediaUrl = await handleStickerMedia(supabase, instance, data, message, key);
  }

  if (messageType === 'audio' && mediaUrl) {
    // Áudios do WhatsApp CDN são sempre encrypted (.enc) — magic bytes nunca batem.
    // Pular a tentativa de download direto e ir direto para a API, que decripta server-side.
    const msgId = key.id || `${Date.now()}`;
    const apiUrl = await persistMediaViaApi(supabase, instance, data, messageType, msgId);
    if (apiUrl) mediaUrl = apiUrl;
  } else if (mediaUrl && ['image', 'video', 'document'].includes(messageType)) {
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
    const { data: newContact, error: insertErr } = await supabase.from('contacts').insert({
      phone,
      name: (data.pushName as string) || phone,
      // [FIX 2026-08-12] avatar_url em background (persistAvatarInBackground) —
      // criar o contato SEM avatar não bloqueia o insert da mensagem.
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
        if (!existing.avatar_url) persistAvatarInBackground(supabase, instance, phone, existing.id);
      } else {
        // [OBS 2026-08-12] 23505 sem recovery = unique em phone/remote_jid aponta para linha
        // que o getContactByPhone/recover não encontra (ex.: soft-deleted ou variant não coberta).
        // Sem este log, a mensagem seria descartada silenciosamente em `if (!contact) return`.
        console.warn('[CONTACT] Duplicate insert conflict (23505) but NO existing contact found for recovery', {
          messageId: key.id, phone, instance, remoteJid: bestJid, variants: phonesVariants,
        });
      }
    } else {
      if (insertErr) {
        // [OBS 2026-08-12] Causa do incidente de perda de inbound (chk_lead_status_vocab):
        // erro ≠ 23505 era engolido silenciosamente -> contact=null -> mensagem descartada.
        // Agora logado para diagnóstico imediato de qualquer nova violação.
        console.error('[CONTACT] Insert FAILED (non-23505) — message WILL NOT be mirrored', {
          messageId: key.id, phone, instance, remoteJid: bestJid,
          code: insertErr.code, message: insertErr.message, details: insertErr.details, hint: insertErr.hint,
        });
      } else if (!newContact) {
        console.warn('[CONTACT] Insert returned no row without error (0 rows? unexpected)', {
          messageId: key.id, phone, instance, remoteJid: bestJid,
        });
      }
      contact = newContact;
      if (contact) persistAvatarInBackground(supabase, instance, phone, contact.id);
    }
  } else if (!contact.avatar_url || (() => { try { return new URL(contact.avatar_url).hostname.endsWith('.whatsapp.net'); } catch { return false; } })()) {
    persistAvatarInBackground(supabase, instance, phone, contact.id);
  }

  if (!contact) return;

  const messageCreatedAt = (data.messageTimestamp as number)
    ? new Date((data.messageTimestamp as number) * 1000).toISOString() : new Date().toISOString();

  const evo = () => supabase.from('evolution_messages');

  const { data: existingMessage } = await evo()
    .select('id, status, content').eq('message_id', key.id).eq('instance_name', instance).maybeSingle();

  if (existingMessage?.id) {
    const preservedStatus = existingMessage.status && existingMessage.status !== 'received' ? existingMessage.status : 'received';
    const preservedContent = existingMessage.status === 'deleted' ? (existingMessage.content || '[Mensagem apagada]') : content;
    const storageFields = extractStorageFields(mediaUrl);
    // F3-edge: update via RPC canônico (rpc_update_incoming_message)
    const updResult = await supabase.rpc('rpc_update_incoming_message', {
      p_row_id: existingMessage.id,
      p_contact_id: contact.id,
      p_content: preservedContent,
      p_message_type: messageType,
      p_media_url: mediaUrl ?? null,
      p_media_bucket: storageFields.media_bucket,
      p_media_path: storageFields.media_path,
      p_media_status: storageFields.media_status,
      p_status: preservedStatus,
      p_ingest_meta: ingestMeta ?? null,
      p_quoted_message_id: quotedMessageId ?? null,
    });
    if (updResult.error) console.error('[INCOMING] Error updating existing message:', { error: updResult.error, messageId: existingMessage.id });
    if (messageType === 'audio' && mediaUrl) await handleAudioTranscription(supabase, contact.id, existingMessage.id, mediaUrl, supabaseUrl, supabaseServiceKey);
    return;
  }

  // F4: ingestMessage via RPC canônico (ON CONFLICT DO NOTHING + campos ricos ADR-004)
  const storageIn = extractStorageFields(mediaUrl);
  const inResult = await ingestMessage(supabase, {
    provider: 'evolution', instanceRef: instance,
    remoteJid: bestJid || `${phone}@s.whatsapp.net`,
    messageId: key.id, messageType, content,
    fromMe: false, direction: 'inbound',
    timestamp: new Date(messageCreatedAt), contactId: contact.id,
    pushName: (data.pushName as string) || undefined,
    mediaUrl: mediaUrl ?? undefined,
    mediaBucket: storageIn.media_bucket ?? undefined,
    mediaPath: storageIn.media_path ?? undefined,
    mediaStatus: storageIn.media_status ?? undefined,
    ingestMeta: ingestMeta ?? undefined,
    mediaMeta: ingestMeta ?? undefined,
    quotedMessageId: quotedMessageId ?? undefined,
    caption: captionText ?? undefined,
  });
  if (!inResult.ok) {
    console.error('Error inserting message:', { error: inResult.error, externalId: key.id, bestJid, phone, messageType, content });
    return;
  }
  if (!inResult.rowId) return; // ON CONFLICT DO NOTHING: concurrent writer won the race
  await supabase.from('contacts').update({ updated_at: new Date().toISOString() }).eq('id', contact.id);
  if (messageType === 'audio' && mediaUrl && inResult.rowId) await handleAudioTranscription(supabase, contact.id, inResult.rowId, mediaUrl, supabaseUrl, supabaseServiceKey);
}

/** handle Sticker Media function. */
export async function handleStickerMedia(
  supabase: SupabaseClient<any, any>, instance: string, data: Record<string, unknown>,
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
      // P6-fix: filename deterministico por messageId (remove Date.now() que causava duplicatas).
      const fileName = `sticker_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
      const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
      if (!uploadErr) {
        return getStoragePublicUrl('whatsapp-media', `stickers/${fileName}`);
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
            // P6-fix: filename deterministico por messageId (remove Date.now() que causava duplicatas).
            const fileName = `sticker_${key.id.replace(/[^a-zA-Z0-9]/g, '')}.webp`;
            const { error: uploadErr } = await supabase.storage.from('whatsapp-media').upload(`stickers/${fileName}`, bytes, { contentType: 'image/webp', cacheControl: '31536000', upsert: true });
            if (!uploadErr) { mediaUrl = getStoragePublicUrl('whatsapp-media', `stickers/${fileName}`); }
          }
        }
      } catch (dlErr) { console.error('[STICKER] mediaUrl download error:', dlErr); }
    }
  }

  if (!mediaUrl) {
    try {
      {
        const resp = await evolutionClient.post(
          `chat/getBase64FromMediaMessage/${instance}`,
          { message: { key: data.key, message: data.message }, convertToMp4: false },
          { timeoutMs: 30000 },
        );
        if (resp.ok) {
          const result = (resp.data ?? {}) as Record<string, unknown>;
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

/** Transcribes an audio message via the configured AI provider and persists the result to the message record. */
export async function handleAudioTranscription(supabase: SupabaseClient<any, any>, _contactId: string, messageId: string, mediaUrl: string, supabaseUrl: string, supabaseServiceKey: string) {
  const { data: globalSetting } = await supabase.from('global_settings')
    .select('value').eq('key', 'auto_transcription_enabled').maybeSingle();
  if (globalSetting?.value === 'false') return;

  // F4: transcription status via RPC
  await supabase.rpc('rpc_update_message_transcription', { p_message_uuid: messageId, p_status: 'processing' });

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-transcribe-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({ audioUrl: mediaUrl, messageId }),
      signal: AbortSignal.timeout(30000),
    });

    if (response.ok) {
      const result = await response.json();
      await supabase.rpc('rpc_update_message_transcription', { p_message_uuid: messageId, p_status: 'completed', p_transcription: result.text });
    } else {
      await supabase.rpc('rpc_update_message_transcription', { p_message_uuid: messageId, p_status: 'failed' });
    }
  } catch {
    await supabase.rpc('rpc_update_message_transcription', { p_message_uuid: messageId, p_status: 'failed' });
  }
}
