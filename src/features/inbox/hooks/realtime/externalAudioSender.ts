// @ts-nocheck
/**
 * sendExternalAudio — envia PTT (push-to-talk) no modo FATOR X.
 *
 * Fluxo:
 *  1. Upload do blob via FormData para a Edge Function `evolution-api`.
 *  2. Invoca `send-audio` no proxy → `/message/sendWhatsAppAudio/{instance}`.
 *  3. Devolve uma bolha otimista `message_type: 'audio'` para a UI exibir
 *     enquanto o webhook materializa a mensagem definitiva.
 *
 * Erros são propagados para alimentar o `SendErrorBanner` (sem swallow).
 */
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
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

const log = getLogger('externalAudioSender');

const logAudit = (def: unknown, params: unknown) =>
  dbInsert(def as never, params as never).catch((err) => log.warn('[audit] log failed', err));

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