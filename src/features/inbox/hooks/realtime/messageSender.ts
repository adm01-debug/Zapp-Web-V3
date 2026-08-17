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

// ── F4-15: caches de leitura para eliminar round-trips repetidos ────────────
// Antes, cada envio fazia 8 queries no caminho feliz (getUser + profiles +
// contacts + insert + audit send_attempt + connections + update + audit
// delivered). Com getSession() (local, sem rede) + cache de profile (agente
// estável na sessão) + cache de contact (phone/connection mudam raramente,
// TTL 30s no padrão whatsappConnectionsCache) + audit em lote, o caminho
// feliz cai para ~3 queries por mensagem.
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000; // 5min — agent_id não muda na sessão
const CONTACT_CACHE_TTL_MS = 30 * 1000; // 30s — phone/connection mudam raramente

const profileCache = new Map<string, { id: string | null; expiresAt: number }>();
const profileInflight = new Map<string, Promise<string | null>>();
const contactCache = new Map<
  string,
  { phone: string | null; whatsapp_connection_id: string | null; expiresAt: number }
>();
const contactInflight = new Map<
  string,
  Promise<{ phone: string | null; whatsapp_connection_id: string | null } | null>
>();

/** Busca profile.id com cache TTL + in-flight dedup (coalesce rajadas). */
async function getCachedProfileId(userId: string): Promise<string | null> {
  const cached = profileCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.id;
  const inflight = profileInflight.get(userId);
  if (inflight) return inflight;
  const promise = (async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116
    // Só popula o cache em sucesso — erro transitório não vira cache negativo.
    if (!error) {
      const id = ((data as { id?: string } | null)?.id ?? null) as string | null;
      profileCache.set(userId, { id, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
      return id;
    }
    return null;
  })().finally(() => profileInflight.delete(userId));
  profileInflight.set(userId, promise);
  return promise;
}

/** Busca phone/whatsapp_connection_id do contato com cache TTL + in-flight dedup. */
async function getCachedContact(
  contactId: string
): Promise<{ phone: string | null; whatsapp_connection_id: string | null } | null> {
  const cached = contactCache.get(contactId);
  if (cached && cached.expiresAt > Date.now()) {
    return { phone: cached.phone, whatsapp_connection_id: cached.whatsapp_connection_id };
  }
  const inflight = contactInflight.get(contactId);
  if (inflight) return inflight;
  const promise = (async () => {
    const { data, error } = await dbFrom('contacts')
      .select('phone, whatsapp_connection_id')
      .eq('id', contactId)
      .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116
    // Só popula o cache em sucesso — erro transitório não vira cache negativo.
    if (error) return null;
    const row = (data ?? null) as {
      phone: string | null;
      whatsapp_connection_id: string | null;
    } | null;
    contactCache.set(contactId, {
      phone: row?.phone ?? null,
      whatsapp_connection_id: row?.whatsapp_connection_id ?? null,
      expiresAt: Date.now() + CONTACT_CACHE_TTL_MS,
    });
    return row;
  })().finally(() => contactInflight.delete(contactId));
  contactInflight.set(contactId, promise);
  return promise;
}

// ── F4-15: batcher de audit_logs ────────────────────────────────────────────
// Antes, cada envio gravava 2 inserts de audit_logs separados (send_attempt +
// delivered) — 2 round-trips por mensagem. Com o batcher, os rows são
// acumulados num buffer e descarregados em UM insert multi-row (flush por
// debounce de AUDIT_FLUSH_MS ou ao atingir AUDIT_BATCH_MAX). Em rajadas de
// envios concorrentes (fila com MAX_CONCURRENT_SENDS), N envios viram ~1
// insert de audit. Telemetria não-crítica (padrão F4-17): falha de flush é
// logada e descartada, nunca bloqueia o envio.
interface AuditRow {
  entity_type: string;
  entity_id?: string;
  action: string;
  details?: Record<string, unknown>;
}

const AUDIT_FLUSH_MS = 100;
const AUDIT_BATCH_MAX = 25;
const auditBuffer: AuditRow[] = [];
let auditFlushTimer: ReturnType<typeof setTimeout> | null = null;
let auditFlushInFlight: Promise<void> | null = null;

function scheduleAuditFlush(): void {
  if (auditFlushTimer !== null || auditFlushInFlight !== null) return;
  auditFlushTimer = setTimeout(() => {
    auditFlushTimer = null;
    void flushAuditBatch();
  }, AUDIT_FLUSH_MS);
}

/** Enfileira um row de audit_logs (fire-and-forget; flush em lote). */
function enqueueAudit(row: AuditRow): void {
  auditBuffer.push(row);
  if (auditBuffer.length >= AUDIT_BATCH_MAX) {
    if (auditFlushTimer !== null) {
      clearTimeout(auditFlushTimer);
      auditFlushTimer = null;
    }
    void flushAuditBatch();
  } else {
    scheduleAuditFlush();
  }
}

/** Descarrega o buffer em UM insert multi-row. Nunca lança. */
async function flushAuditBatch(): Promise<void> {
  if (auditFlushInFlight) {
    // Aguarda o flush em curso; o buffer residual é tratado por ele ou pelo
    // próximo scheduleAuditFlush.
    await auditFlushInFlight;
    return;
  }
  if (auditBuffer.length === 0) return;
  const rows = auditBuffer.splice(0, AUDIT_BATCH_MAX);
  auditFlushInFlight = (async () => {
    try {
      await safeClient.from('audit_logs', (q) => q.insert(rows));
    } catch (e) {
      log.warn('Failed to write batched audit logs', e);
    } finally {
      auditFlushInFlight = null;
      if (auditBuffer.length > 0) scheduleAuditFlush();
    }
  })();
  await auditFlushInFlight;
}

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
  // F4-15: agrupa round-trips — getSession() é LOCAL (sem rede; getUser()
  // fazia 1 round-trip ao /auth/v1/user a cada envio) e profile + contact
  // vêm de caches TTL com in-flight dedup (0 queries no caminho feliz com
  // cache quente). Semântica preservada: `profile?.id` e `contact?.phone`
  // seguem iguais.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? '';
  const [profileId, contact] = await Promise.all([
    userId ? getCachedProfileId(userId) : Promise.resolve(null),
    getCachedContact(contactId),
  ]);

  const { data, error } = await dbFrom('messages')
    .insert({
      contact_id: contactId,
      agent_id: profileId,
      content,
      sender: 'agent',
      message_type: messageType,
      media_url: mediaUrl || null,
      is_read: true,
      // FIX #6: 'sending' viola CHECK constraint eolution_messages_status_check
      // Valores válidos: received|sent|delivered|read|deleted|pending|played|failed
      // DB-side defesa: fn_messages_instead_of_insert normaliza sending←pending
      status: 'pending',
    })
    .select()
    .maybeSingle(); // ✅ fix: maybeSingle evita PGRST116;

  if (error) {
    log.error('Error saving message to DB:', error);
    throw error;
  }

  const effectiveId = opts.optimisticId || data.id;
  emitSendStatus(effectiveId, { status: 'sending' }, { contactId, source: 'messageSender' });

  // Etapa 66: alimenta a gamificação REAL (GamificationProvider escuta este
  // evento e incrementa XP/mensagens). Fire-and-forget — não afeta o envio.
  window.dispatchEvent(new CustomEvent('zapp:message-sent'));

  try {
    if (opts.conversationId) {
      // F4-15: audit de send_attempt entra no batcher (fire-and-forget,
      // flush em lote multi-row) — não bloqueia o caminho de envio.
      enqueueAudit({
        entity_type: 'conversation',
        entity_id: opts.conversationId,
        action: 'send_attempt',
        details: { status: 'starting', messageType, hasMedia: !!(mediaUrl || mediaPayload) },
      });
    }

    // F4-15: `contact` já veio do Promise.all inicial (paralelo com profiles).
    const { resolvedConnectionId, connection } = await resolveConnection(
      contact?.whatsapp_connection_id ?? null
    );

    if (!connection?.instance_id || connection.status !== 'connected') {
      log.warn('WhatsApp connection not active, message marked as failed');
      await dbFrom('messages')
        .update({ status: 'failed', error_reason: 'Nenhuma conexão WhatsApp ativa disponível' })
        .eq('id', data.id);

      // F4-15: audit via batcher + flush explícito (erro é caminho raro —
      // garante a gravação antes do throw sem custo no caminho feliz).
      enqueueAudit({
        entity_type: 'conversation',
        entity_id: opts.conversationId,
        action: 'failed',
        details: { status: 'error', error_message: 'Nenhuma conexão WhatsApp ativa disponível' },
      });
      await flushAuditBatch();

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
      // F4-15: audit via batcher + flush explícito (caminho de erro raro).
      enqueueAudit({
        entity_type: 'conversation',
        entity_id: opts.conversationId,
        action: 'failed',
        details: {
          status: 'error',
          error_message:
            'Conexão WhatsApp sem nome de instância válido (instance_id parece ser um UUID)',
        },
      });
      await flushAuditBatch();
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
    // fingerprint (contact + type + content + media + 1min bucket) so that:
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

          // F4-15: audit via batcher (fire-and-forget, flush em lote).
          enqueueAudit({
            entity_type: 'conversation',
            entity_id: opts.conversationId,
            action: 'send_attempt',
            details: { status: 'retrying', attempt_number: attempt, totalRetries: total },
          });

          // Persist counters so the "2/3" indicator survives a page reload.
          // DB-side triggers normalize 'retrying' -> 'pending' via CHECK constraint protection
          dbFrom('messages')
            .update({
              status: 'retrying', // DB trigger remaps to 'pending' via messages_update_trigger
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
              description: `Tentando reenviar... (${attempt}/${total})`,
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
            // DB trigger normalizes 'failed_auth' -> 'failed' via messages_update_trigger
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
    // F4-19: extractEvolutionMessageId pode retornar null se a Evolution API
    // responder 200 sem key.id. Marca como sent_unverified e agenda reconciliação.
    const effectiveStatus = externalId ? 'sent' : 'sent_unverified';
    // F4-15: finalize (update de status) + audit 'delivered' são
    // independentes — rodam em PARALELO (antes: 2 awaits sequenciais). O
    // audit vai pelo batcher com flush explícito (1 insert multi-row para
    // N envios concorrentes; tolera falha — telemetria não-crítica, F4-17).
    await Promise.all([
      dbFrom('messages')
        .update({
          status: effectiveStatus,
          external_id: externalId ?? null,
          whatsapp_connection_id: resolvedConnectionId,
          retry_attempt: null,
          retry_total: null,
        })
        .eq('id', data.id),
      opts.conversationId
        ? (enqueueAudit({
            entity_type: 'conversation',
            entity_id: opts.conversationId,
            action: 'delivered',
            details: { status: 'success', externalId },
          }),
          flushAuditBatch())
        : Promise.resolve(null),
    ]);
    const finalSid = opts.optimisticId || data.id;
    emitSendStatus(finalSid, { status: 'sent' }, { contactId, source: 'messageSender' });
  } catch (evolutionError) {
    log.error('Error sending via Evolution API:', evolutionError);
    const auth = classifyAuthError(evolutionError);
    const reason =
      evolutionError instanceof Error ? evolutionError.message : 'Falha ao enviar mensagem';
    const sid = opts.optimisticId || data.id;
    if (auth.isAuth) {
      await dbFrom('messages')
        .update({
          // DB trigger normalizes 'failed_auth' -> 'failed' via messages_update_trigger
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
      // DB trigger normalizes 'failed_retries' -> 'failed' via messages_update_trigger
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

    // F4-15: audit de falha via batcher + flush explícito (caminho raro;
    // garante a gravação antes do throw sem custo no caminho feliz).
    enqueueAudit({
      entity_type: 'conversation',
      entity_id: opts.conversationId,
      action: 'failed',
      details: {
        status: 'error',
        error_message: reason,
        authError: auth.isAuth,
        errorCode: auth.code,
      },
    });
    await flushAuditBatch();
    throw evolutionError;
  }

  return data as SendMessageResult; // ignore-audit: narrows Supabase query result to local interface
}
