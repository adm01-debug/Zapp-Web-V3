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
 *  - Não grava em `public.messages` / `public.contacts`.
 *  - O `contactId` recebido é o `remote_jid` (ex.: `5511XXXXX@s.whatsapp.net`),
 *    NÃO um UUID — derivamos o telefone via `jidToPhone`.
 *  - Joga o erro pra cima (sem swallow), pra alimentar o `SendErrorBanner`.
 */
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { jidToPhone } from '@/adapters/evolutionAdapter';
import { getLogger } from '@/lib/logger';
import { parseEvolutionError } from '@/features/inbox';
import { dbInsert } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { buildFileHash as calculateFileHash } from '@/lib/crypto';

const log = getLogger('externalMessageSender');
const DEFAULT_INSTANCE = 'wpp2';

// Audit helper — fire-and-forget but surfaces failures to the logger instead of silently dropping them.
const logAudit = (def, params) =>
  dbInsert(def, params).catch((err) => log.warn('[audit] log failed', err));

/**
 * SendError — Error enriquecido com o motivo bruto do upstream para que
 * o `SendErrorBanner` possa oferecer "Ver detalhes" sem perder a frase
 * humanizada exibida por padrão.
 */
export class SendError extends Error {
  detail: string | null;
  status?: number;
  constructor(reason: string, detail: string | null, status?: number) {
    super(reason);
    this.name = 'SendError';
    this.detail = detail;
    this.status = status;
  }
}

export interface SendExternalOptions {
  instanceName?: string;
  contactAvatar?: string | null;
  onProgress?: (progress: number) => void;
}

export interface OptimisticMessage {
  id: string;
  contact_id: string;
  agent_id: string;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  status: string;
  status_updated_at: string;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  whatsapp_connection_id: null;
  transcription: null;
  transcription_status: null;
  is_deleted: boolean;
  contactAvatar: string | null;
  media_meta: unknown;
}

export interface SendExternalResult {
  optimistic: OptimisticMessage;
  externalId: string | null;
}

function makeOptimisticBubble(
  remoteJid: string,
  content: string,
  opts: {
    messageType?: string;
    mediaUrl?: string | null;
    contactAvatar?: string | null;
    media_meta?: Record<string, unknown> | null;
  } = {}
): OptimisticMessage {
  const now = new Date().toISOString();
  // ID local começa com `optimistic:` pra reconciliação. O webhook insere
  // a mensagem real com outro id e o cursor/poll a substitui no merge.
  const id = `optimistic:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    contact_id: remoteJid,
    agent_id: 'system',
    content,
    sender: 'agent',
    message_type: opts.messageType ?? 'text',
    media_url: opts.mediaUrl ?? null,
    is_read: true,
    status: 'sending',
    status_updated_at: now,
    created_at: now,
    updated_at: now,
    external_id: null,
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    is_deleted: false,
    contactAvatar: opts.contactAvatar ?? null,
    media_meta: opts.media_meta ?? null,
  };
}

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
 * sendExternalAudio — envia PTT (push-to-talk) no modo FATOR X.
 *
 * Fluxo:
 *  1. Upload do blob no bucket privado `audio-messages` (mesmo do legacy).
 *  2. Gera signed URL (1h) — a Edge Function `evolution-api` revalida e
 *     re-assina internamente via `resolvePrivateBucketUrl` se necessário.
 *  3. Invoca `send-audio` no proxy → `/message/sendWhatsAppAudio/{instance}`.
 *  4. Devolve uma bolha otimista `message_type: 'audio'` para a UI exibir
 *     enquanto o webhook materializa a mensagem definitiva (e a substitui
 *     pelo `external_id`/`message_id` real do WhatsApp).
 *
 * Erros são propagados para alimentar o `SendErrorBanner` (sem swallow).
 */
export async function sendExternalAudio(
  remoteJid: string,
  blob: Blob,
  opts: SendExternalOptions & {
    isPtt?: boolean;
    conversationInstance?: string;
    conversationId?: string;
    conversation_id?: string;
  } = {}
): Promise<SendExternalResult> {
  const startTime = Date.now();
  const phone = jidToPhone(remoteJid);
  if (!phone) throw new Error('Contato sem JID válido para envio.');

  const instance = opts.instanceName || opts.conversationInstance || DEFAULT_INSTANCE;
  const localAudioUrl = URL.createObjectURL(blob);
  const convId = opts.conversationId || opts.conversation_id;

  const optimistic = makeOptimisticBubble(remoteJid, '[Áudio]', {
    messageType: 'audio',
    mediaUrl: localAudioUrl,
    contactAvatar: opts.contactAvatar,
    media_meta: { ptt: opts.isPtt ?? true, conversation_id: convId },
  });

  if (convId) {
    void safeClient
      .from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: convId,
          action: 'send_attempt',
          details: { status: 'starting', messageType: 'audio', isPtt: opts.isPtt ?? true },
        })
      )
      .catch((err: unknown) => log.warn('[audit] audio send_attempt log failed', err));
  }

  const formData = new FormData();
  formData.append('action', 'send-audio');
  formData.append('instanceName', instance);
  formData.append('number', phone);
  formData.append('encoding', 'true');
  formData.append('isPtt', String(opts.isPtt ?? true));
  formData.append('audio', blob, 'audio.webm');

  // Adiciona hash para cache de mídia se disponível
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
    log.error('evolution-api send-audio failed', error);
    const info = parseEvolutionError(error);

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'audio',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ error: info, is_ptt: opts.isPtt ?? true })),
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
    log.error('evolution-api send-audio error envelope', envelope);
    const info = parseEvolutionError(envelope);

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'audio',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ envelope, is_ptt: opts.isPtt ?? true })),
    });

    throw new SendError(info.reason, info.detail, info.status);
  }

  const externalId = envelope?.key?.id ?? null;

  logAudit(RPC.logOutboundEvent, {
    p_conversation_id: remoteJid,
    p_message_type: 'audio',
    p_instance_name: instance,
    p_status: 'sent',
    p_latency_ms: latency,
    p_metadata: { external_id: externalId, is_ptt: opts.isPtt ?? true },
  });

  optimistic.external_id = externalId;
  optimistic.status = 'sent';

  if (convId) {
    void safeClient
      .from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: convId,
          action: 'delivered',
          details: { status: 'success', external_id: externalId },
        })
      )
      .catch((err: unknown) => log.warn('[audit] audio delivered log failed', err));
  }

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

  if (opts.onProgress) opts.onProgress(50); // Simulation midpoint

  const { data: signed, error: signError } = await supabase.storage
    .from('whatsapp-media')
    .createSignedUrl(fileName, 3600);
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
 * Inclui retry automático para falhas de upload/sign.
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
