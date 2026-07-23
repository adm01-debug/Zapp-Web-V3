/**
 * externalMessageSender — envio de mensagens no modo FATOR X.
 *
 * O Inbox em modo `USE_EXTERNAL_DB=true` exibe conversas vindas de
 * `evolution_messages`. Esta função envia via Edge Function `evolution-api`
 * (mesmo proxy usado pelo sender legado) e devolve uma "bolha otimista" no
 * formato esperado pelo `useExternalMessages.addMessage` — o webhook
 * canônico assume a fonte da verdade segundos depois.
 *
 * Diferenças vs `messageSender.ts` (legacy):
 *  - Não grava em `messages` / `contacts` (views zapp).
 *  - O `contactId` recebido é o `remote_jid` (ex.: `5511XXXXX@s.whatsapp.net`),
 *    NÃO um UUID — derivamos o telefone via `jidToPhone`.
 *  - Joga o erro pra cima (sem swallow), pra alimentar o `SendErrorBanner`.
 */
import { supabase } from '@/integrations/supabase/client';
import { jidToPhone } from '@/adapters/evolutionAdapter';
import { getLogger } from '@/lib/logger';
import { parseEvolutionError } from '@/features/inbox';
import { dbInsert } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { buildFileHash as calculateFileHash } from '@/lib/crypto';
import {
  DEFAULT_INSTANCE,
  SendError,
  SendExternalOptions,
  SendExternalResult,
  makeOptimisticBubble,
} from './externalSenderTypes';

// Re-export types and audio sender so consumers importing from this module continue to work.
/** @see externalSenderTypes for shared types used across external sender modules. */
export * from './externalSenderTypes';
/** @see externalAudioSender for audio PTT/voice-note sending to the Evolution external DB. */
export * from './externalAudioSender';

const log = getLogger('externalMessageSender');

// Audit helper — fire-and-forget but surfaces failures to the logger instead of silently dropping them.
const logAudit = (def: unknown, params: unknown) =>
  dbInsert(def as never, params as never).catch((err) => log.warn('[audit] log failed', err));

/** Sends a text message directly to the Evolution external database, writes an optimistic message row, and logs an outbound audit entry; returns the new message ID and external WhatsApp key on success. */
export async function sendExternalText(
  remoteJid: string,
  content: string,
  opts: SendExternalOptions = {}
): Promise<SendExternalResult> {
  const phone = jidToPhone(remoteJid);
  if (!phone) throw new Error('Contato sem JID válido para envio.');
  const instance = opts.instanceName || DEFAULT_INSTANCE;

  const optimistic = makeOptimisticBubble(remoteJid, content, {
    contactAvatar: opts.contactAvatar,
  });

  // Log de auditoria (FATOR X)
  logAudit(RPC.rpc_log_service_event, {
    p_instance: instance,
    p_event_type: 'message_send',
    p_message: `Enviando texto para ${phone}`,
    p_remote_jid: remoteJid,
    p_payload: { content },
  });

  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: {
      action: 'send-text',
      instanceName: instance,
      number: phone,
      text: content,
    },
  });

  if (error) {
    log.error('evolution-api send-text failed', error);
    const info = parseEvolutionError(error);

    logAudit(RPC.rpc_log_service_event, {
      p_instance: instance,
      p_event_type: 'error',
      p_level: 'error',
      p_message: `Falha no envio para ${phone}: ${info.reason}`,
      p_remote_jid: remoteJid,
      p_payload: { error: info },
    });

    throw new SendError(info.reason, info.detail, info.status);
  }

  // O proxy embrulha falhas de upstream em 200 + { error: true, message }.
  const envelope = data as {
    error?: boolean;
    message?: string;
    status?: number;
    response?: unknown;
    key?: { id?: string };
  } | null;
  if (envelope?.error) {
    log.error('evolution-api send-text error envelope', envelope);
    const info = parseEvolutionError(envelope);

    logAudit(RPC.rpc_log_service_event, {
      p_instance: instance,
      p_event_type: 'error',
      p_level: 'error',
      p_message: `Erro na resposta da API para ${phone}: ${info.reason}`,
      p_remote_jid: remoteJid,
      p_payload: { envelope },
    });

    throw new SendError(info.reason, info.detail, info.status);
  }

  const externalId = envelope?.key?.id ?? null;
  optimistic.external_id = externalId;
  optimistic.status = 'sent';
  return { optimistic, externalId };
}

/**
 * sendExternalMedia — envia imagens, vídeos ou documentos no modo FATOR X.
 */
export async function sendExternalMedia(
  remoteJid: string,
  file: File,
  opts: SendExternalOptions & { caption?: string } = {}
): Promise<SendExternalResult> {
  const phone = jidToPhone(remoteJid);
  if (!phone) throw new Error('Contato sem JID válido para envio.');
  const instance = opts.instanceName || DEFAULT_INSTANCE;

  const safeKey = remoteJid.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${safeKey}/${Date.now()}_${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(fileName, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    log.error('media upload failed', uploadError);
    throw new Error(uploadError.message || 'Falha no upload do arquivo');
  }

  if (opts.onProgress) opts.onProgress(50);

  const { data: signed, error: signError } = await supabase.storage
    .from('whatsapp-media')
    .createSignedUrl(fileName, 604800) // ✅ fix: 7d TTL (era 1h — URLs quebravam após 1h);
  if (signError || !signed?.signedUrl) {
    log.error('media signed url failed', signError);
    throw new Error(signError?.message || 'Falha ao gerar URL do arquivo');
  }

  const type = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('video/')
      ? 'video'
      : 'document';
  const optimistic = makeOptimisticBubble(remoteJid, opts.caption || file.name, {
    messageType: type,
    mediaUrl: signed.signedUrl,
    contactAvatar: opts.contactAvatar,
  });

  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: {
      action: 'send-media',
      instanceName: instance,
      number: phone,
      mediaUrl: signed.signedUrl,
      mediaType: type,
      caption: opts.caption,
      fileName: file.name,
    },
  });

  if (error) {
    log.error('evolution-api send-media failed', error);
    const info = parseEvolutionError(error);
    throw new SendError(info.reason, info.detail, info.status);
  }
  const envelope = data as {
    error?: boolean;
    message?: string;
    status?: number;
    response?: unknown;
    key?: { id?: string };
  } | null;
  if (envelope?.error) {
    log.error('evolution-api send-media error envelope', envelope);
    const info = parseEvolutionError(envelope);
    throw new SendError(info.reason, info.detail, info.status);
  }

  const externalId = envelope?.key?.id ?? null;
  optimistic.external_id = externalId;
  optimistic.status = 'sent';
  return { optimistic, externalId };
}

/**
 * sendExternalPtv — envia vídeo-nota circular (ptv) no modo FATOR X.
 */
export async function sendExternalPtv(
  remoteJid: string,
  blob: Blob,
  opts: SendExternalOptions & { conversationInstance?: string } = {}
): Promise<SendExternalResult> {
  const startTime = Date.now();
  const phone = jidToPhone(remoteJid);
  if (!phone) throw new Error('Contato sem JID válido para envio.');
  const instance = opts.instanceName || opts.conversationInstance || DEFAULT_INSTANCE;

  const localVideoUrl = URL.createObjectURL(blob);
  const optimistic = makeOptimisticBubble(remoteJid, '[Vídeo-nota]', {
    messageType: 'video',
    mediaUrl: localVideoUrl,
    contactAvatar: opts.contactAvatar,
  });

  if (opts.onProgress) opts.onProgress(50);

  const formData = new FormData();
  formData.append('action', 'send-ptv');
  formData.append('instanceName', instance);
  formData.append('number', phone);
  formData.append('video', blob, 'video.mp4');

  try {
    const hash = await calculateFileHash(blob);
    formData.append('mediaHash', hash);
  } catch (e) {
    log.debug('Hash calculation skipped', e);
  }

  const { data, error } = await supabase.functions.invoke('evolution-api', {
    body: formData,
  });

  const latency = Date.now() - startTime;

  if (error) {
    log.error('evolution-api send-ptv failed', error);
    const info = parseEvolutionError(error);

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'video_ptv',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ error: info })),
    });

    throw new SendError(info.reason, info.detail, info.status);
  }

  const envelope = data as {
    error?: boolean;
    message?: string;
    status?: number;
    response?: unknown;
    key?: { id?: string };
  } | null;
  if (envelope?.error) {
    log.error('evolution-api send-ptv error envelope', envelope);
    const info = parseEvolutionError(envelope);

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'video_ptv',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ envelope })),
    });

    throw new SendError(info.reason, info.detail, info.status);
  }

  const externalId = envelope?.key?.id ?? null;

  logAudit(RPC.logOutboundEvent, {
    p_conversation_id: remoteJid,
    p_message_type: 'video_ptv',
    p_instance_name: instance,
    p_status: 'sent',
    p_latency_ms: latency,
    p_metadata: { external_id: externalId },
  });

  optimistic.external_id = externalId;
  optimistic.status = 'sent';
  return { optimistic, externalId };
}