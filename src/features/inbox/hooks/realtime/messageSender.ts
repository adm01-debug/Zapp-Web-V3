import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';
import { extractEvolutionMessageId } from '@/lib/evolutionMessageId';
import { invokeEvolutionWithRetry } from '@/lib/evolutionSendRetry';
import {
  buildSendIdempotencyKey,
  buildSendIdempotencyKeyFromFingerprint,
} from '@/lib/sendIdempotency';
import { toast } from '@/hooks/use-toast';
import { emitSendStatus } from './sendStatusBus';
import { dbFrom } from '@/integrations/datasource/db';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import {
  classifyAuthError,
  resolveConnection,
  buildEvolutionPayload,
  type SendMessageResult,
} from './messageSenderHelpers';

const MAX_RETRIES = 3;
const lastInstabilityToastByContact = new Map<string, number>();

const log = getLogger('MessageSender');

/**
 * Sends a message: saves to DB, dispatches via Evolution API, updates status.
 */
export async function sendMessageToContact(
  contactId: string,
  content: string,
  messageType = 'text',
  mediaUrl?: string,
  mediaPayload?: string,
  opts: { optimisticId?: string; conversationId?: string } = {}
): Promise<SendMessageResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

  const { data, error } = await dbFrom('messages')
    .insert({
      contact_id: contactId,
      agent_id: profile?.id,
      content,
      sender: 'agent',
      message_type: messageType,
      media_url: mediaUrl || null,
      is_read: true,
      status: 'sending',
    })
    .select()
    .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

  if (error) {
    log.error('Error saving message to DB:', error);
    throw error;
  }

  const effectiveId = opts.optimisticId || data.id;
  emitSendStatus(effectiveId, { status: 'sending' }, { contactId, source: 'messageSender' });

  try {
    if (opts.conversationId) {
      await safeClient.from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: opts.conversationId,
          action: 'send_attempt',
          details: { status: 'starting', messageType, hasMedia: !!(mediaUrl || mediaPayload) },
        })
      );
    }

    const { data: contact } = await dbFrom('contacts')
      .select('phone, whatsapp_connection_id')
      .eq('id', contactId)
      .maybeSingle() // ✅ fix: maybeSingle evita PGRST116;

    const { resolvedConnectionId, connection } = await resolveConnection(
      contact?.whatsapp_connection_id ?? null
    );

    if (!connection?.instance_id || connection.status !== 'connected') {
      log.warn('WhatsApp connection not active, message marked as failed');
      await dbFrom('messages')
        .update({ status: 'failed', error_reason: 'Nenhuma conexão WhatsApp ativa disponível' })
        .eq('id', data.id);

      await safeClient.from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: opts.conversationId,
          action: 'failed',
          details: { status: 'error', error_message: 'Nenhuma conexão WhatsApp ativa disponível' },
        })
      );

      throw new Error('Nenhuma conexão WhatsApp ativa disponível');
    }

    const phone = contact?.phone?.replace(/\D/g, '');
    if (!phone) {
      throw new Error('Contato sem número de telefone válido');
    }

    // The Evolution API routes every call by instance NAME, never by the internal
    // UUID (instance_id) — sending the UUID 404s and, on the connect/create-instance
    // path, previously auto-created a ghost instance named after the UUID (incident
    // 2026-07-04, PR #192). This send path used connection.instance_id directly and
    // was never covered by that fix.
    const instanceName = evolutionInstanceName(connection);
    if (!instanceName) {
      log.error(
        'WhatsApp connection has no usable instance name (only UUID available), refusing to send',
        { connectionId: resolvedConnectionId }
      );
      await dbFrom('messages')
        .update({ status: 'failed', error_reason: 'Conexão WhatsApp sem nome de instância válido' })
        .eq('id', data.id);
      await safeClient.from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: opts.conversationId,
          action: 'failed',
          details: {
            status: 'error',
            error_message:
              'Conexão WhatsApp sem nome de instância válido (instance_id parece ser um UUID)',
          },
        })
      );
      throw new Error('Conexão WhatsApp sem nome de instância válido');
    }

    const { action, body } = buildEvolutionPayload(
      instanceName,
      phone,
      content,
      messageType,
      mediaUrl,
      mediaPayload
    );

    if (opts.optimisticId) {
      emitSendStatus(
        opts.optimisticId,
        { status: 'sending' },
        { contactId, source: 'messageSender' }
      );
    }

    // Stable idempotency key per logical message. We prefer a content-aware
    // fingerprint (contact + type + content + media + 5min bucket) so that:
    //   - Automatic retries of THIS row converge (same fingerprint, same row).
    //   - Manual "Reenviar" clicks create a new row but produce the SAME key,
    //     letting Evolution dedupe on its side and preventing the recipient
    //     from receiving the same message twice.
    // We fall back to the row-id form if fingerprint hashing fails for any
    // reason (very old browser, sandboxed crypto), so the send still proceeds.
    let idemKey: string;
    try {
      idemKey = await buildSendIdempotencyKeyFromFingerprint({
        contactId,
        messageType,
        content,
        mediaUrl: mediaUrl ?? null,
      });
    } catch (e) {
      log.warn('Fingerprint key generation failed; falling back to row id', e);
      idemKey = buildSendIdempotencyKey(data.id);
    }

    const { data: apiResult, error: apiError } = await invokeEvolutionWithRetry(
      action,
      { body, headers: { 'Idempotency-Key': idemKey } },
      {
        idempotencyKey: idemKey,
        maxRetries: MAX_RETRIES,
        onRetry: (attempt, total) => {
          const sid = opts.optimisticId || data.id;
          emitSendStatus(
            sid,
            { status: 'retrying', attempt, totalRetries: total },
            { contactId, source: 'messageSender' }
          );

          safeClient
            .from('audit_logs', (q) =>
              q.insert({
                entity_type: 'conversation',
                entity_id: opts.conversationId,
                action: 'send_attempt',
                details: { status: 'retrying', attempt_number: attempt, totalRetries: total },
              })
            )
            .then(() => null)
            .catch((e: unknown) => log.warn('Failed to write retry audit log', e));

          // Persist counters so the "2/3" indicator survives a page reload.
          dbFrom('messages')
            .update({
              status: 'retrying',
              retry_attempt: attempt,
              retry_total: total,
            })
            .eq('id', data.id)
            .then(
              () => undefined,
              (e: unknown) => log.warn('Failed to persist retry counter', e)
            );
          const last = lastInstabilityToastByContact.get(contactId) ?? 0;
          if (attempt === 1 && Date.now() - last > 60_000) {
            lastInstabilityToastByContact.set(contactId, Date.now());
            toast({
              title: 'Conexão instável',
              description: `Tentando reenviar… (${attempt}/${total})`,
            });
          }
        },
      }
    );

    if (apiError || (apiResult as { error?: unknown })?.error) {
      const errPayload = apiError || (apiResult as { error?: unknown; message?: string });
      log.error('Evolution API send error:', errPayload);
      const auth = classifyAuthError(errPayload);
      const reason =
        (apiResult as { message?: string })?.message ||
        (apiError as { message?: string } | null)?.message ||
        'Falha ao enviar mensagem';

      if (auth.isAuth) {
        await dbFrom('messages')
          .update({
            status: 'failed_auth',
            whatsapp_connection_id: resolvedConnectionId,
            error_code: auth.code ? String(auth.code) : null,
            error_reason: auth.reason || reason,
          })
          .eq('id', data.id);
        const sid = opts.optimisticId || data.id;
        emitSendStatus(
          sid,
          { status: 'failed_auth', errorCode: auth.code, errorReason: auth.reason || reason },
          { contactId, source: 'messageSender' }
        );
      } else {
        await dbFrom('messages')
          .update({
            status: 'failed',
            whatsapp_connection_id: resolvedConnectionId,
            error_reason: reason,
          })
          .eq('id', data.id);
        const sid = opts.optimisticId || data.id;
        emitSendStatus(
          sid,
          { status: 'failed', errorReason: reason },
          { contactId, source: 'messageSender' }
        );
      }
      throw new Error(reason);
    }

    const externalId = extractEvolutionMessageId(apiResult);
    await dbFrom('messages')
      .update({
        status: 'sent',
        external_id: externalId,
        whatsapp_connection_id: resolvedConnectionId,
        retry_attempt: null,
        retry_total: null,
      })
      .eq('id', data.id);
    const finalSid = opts.optimisticId || data.id;
    emitSendStatus(finalSid, { status: 'sent' }, { contactId, source: 'messageSender' });

    if (opts.conversationId) {
      await safeClient.from('audit_logs', (q) =>
        q.insert({
          entity_type: 'conversation',
          entity_id: opts.conversationId,
          action: 'delivered',
          details: { status: 'success', externalId },
        })
      );
    }
  } catch (evolutionError) {
    log.error('Error sending via Evolution API:', evolutionError);
    const auth = classifyAuthError(evolutionError);
    const reason =
      evolutionError instanceof Error ? evolutionError.message : 'Falha ao enviar mensagem';
    const sid = opts.optimisticId || data.id;
    if (auth.isAuth) {
      await dbFrom('messages')
        .update({
          status: 'failed_auth',
          error_code: auth.code ? String(auth.code) : null,
          error_reason: auth.reason || reason,
        })
        .eq('id', data.id);
      emitSendStatus(
        sid,
        { status: 'failed_auth', errorCode: auth.code, errorReason: auth.reason || reason },
        { contactId, source: 'messageSender' }
      );
    } else {
      // If error came from withRetry exhausting attempts, mark failed_retries.
      await dbFrom('messages')
        .update({
          status: 'failed_retries',
          error_reason: reason,
          retry_attempt: MAX_RETRIES,
          retry_total: MAX_RETRIES,
        })
        .eq('id', data.id);
      emitSendStatus(
        sid,
        { status: 'failed_retries', totalRetries: MAX_RETRIES, errorReason: reason },
        { contactId, source: 'messageSender' }
      );
    }

    await safeClient.from('audit_logs', (q) =>
      q.insert({
        entity_type: 'conversation',
        entity_id: opts.conversationId,
        action: 'failed',
        details: {
          status: 'error',
          error_message: reason,
          authError: auth.isAuth,
          errorCode: auth.code,
        },
      })
    );
    throw evolutionError;
  }

  return data as SendMessageResult; // ignore-audit: narrows Supabase query result to local interface
}