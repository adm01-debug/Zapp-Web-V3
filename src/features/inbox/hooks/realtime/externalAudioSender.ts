/**
 * sendExternalAudio — envia PTT (push-to-talk) no modo Evolution DB.
 *
 * Fluxo:
 *  1. Upload do blob via FormData para a Edge Function `evolution-api`.
 *  2. Invoca `send-audio` no proxy → `/message/sendWhatsAppAudio/{instance}`.
 *  3. Devolve uma bolha otimista `message_type: 'audio'` para a UI exibir
 *     enquanto o webhook materializa a mensagem definitiva.
 *
 * Erros são propagados para alimentar o `SendErrorBanner` (sem swallow).
 */
import { safeClient } from '@/integrations/supabase/safeClient';
import { jidToPhone } from '@/adapters/evolutionAdapter';
import { sendAudio } from '@/lib/whatsappAdapter';
import { buildSendIdempotencyKeyFromFingerprint } from '@/lib/sendIdempotency';
import { getLogger } from '@/lib/logger';
import { parseEvolutionError } from '@/features/inbox';
import { dbInsert } from '@/integrations/datasource/db';
import { RPC } from '@/integrations/datasource/rpcCatalog';
import { buildFileHash as calculateFileHash } from '@/lib/crypto';
import { emitSendStatus } from './sendStatusBus';
import {
  DEFAULT_INSTANCE,
  SendError,
  SendExternalOptions,
  SendExternalResult,
  makeOptimisticBubble,
} from './externalSenderTypes';

const log = getLogger('externalAudioSender');

const logAudit = (def: unknown, params: unknown) =>
  dbInsert(def as never, params as never).catch((err) => log.warn('[audit] log failed', err));

/** Encodes a Blob as base64 through a FileReader. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g. "data:audio/webm;base64,")
      const base64 = result.split(',')[1] || result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Encodes a Blob as base64, inserts a PTT/voice-note row into the Evolution external DB, writes an optimistic messages row, and logs an outbound audit entry; returns the new message ID on success. */
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
  // Status transitório no bus — a UI troca a bolha para "enviando" imediatamente.
  emitSendStatus(optimistic.id, { status: 'sending' }, { contactId: remoteJid, source: 'send-audio' });

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

  // Converter blob para base64 — Evolution API espera base64 no campo "audio", não binary
  const audioBase64 = await blobToBase64(blob);
  let mediaHash: string | undefined;
  try {
    mediaHash = await calculateFileHash(blob);
  } catch (e) {
    log.debug('Hash calculation skipped', e);
  }

  let data: unknown;
  let error: unknown;
  try {
    // Fingerprint estável: mediaHash (hash do blob) identifica o conteúdo —
    // a blob URL local seria instável entre retries do mesmo envio.
    const idemKey = await buildSendIdempotencyKeyFromFingerprint({
      contactId: remoteJid,
      messageType: 'audio',
      content: '[Áudio]',
      mediaUrl: mediaHash ?? null,
    });
    data = await sendAudio({
      remoteJid,
      audioUrl: audioBase64,
      instance,
      ptt: opts.isPtt ?? true,
      encoding: true,
      mediaHash,
    }, idemKey);
  } catch (err) {
    error = err;
  }

  const latency = Date.now() - startTime;

  if (error) {
    log.error('evolution-api send-audio failed', error);
    const info = parseEvolutionError(error);
    emitSendStatus(
      optimistic.id,
      { status: 'failed', errorCode: info.status, errorReason: info.reason },
      { contactId: remoteJid, source: 'send-audio' }
    );

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'audio',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ error: info, is_ptt: opts.isPtt ?? true })),
    });

    URL.revokeObjectURL(localAudioUrl);
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
    emitSendStatus(
      optimistic.id,
      { status: 'failed', errorCode: info.status, errorReason: info.reason },
      { contactId: remoteJid, source: 'send-audio' }
    );

    logAudit(RPC.logOutboundEvent, {
      p_conversation_id: remoteJid,
      p_message_type: 'audio',
      p_instance_name: instance,
      p_status: 'failed',
      p_latency_ms: latency,
      p_error_code: String(info.status),
      p_metadata: JSON.parse(JSON.stringify({ envelope, is_ptt: opts.isPtt ?? true })),
    });

    URL.revokeObjectURL(localAudioUrl);
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
  emitSendStatus(optimistic.id, { status: 'sent' }, { contactId: remoteJid, source: 'send-audio' });

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
