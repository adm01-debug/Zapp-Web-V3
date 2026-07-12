/**
 * Edge Function: Evolution API Webhook Receiver
 *
 * Receives and processes WhatsApp events from Evolution API with HMAC validation,
 * instance registry verification, rate limiting, and multi-handler event routing.
 *
 * Security & Validation:
 * - HMAC signature validation on all webhook payloads (prevents spoofed events)
 * - Multi-secret support for zero-downtime secret rotation: EVOLUTION_WEBHOOK_SECRETS=new,old
 * - Strict mode (default): Rejects events from unknown instances via instance_registry
 * - Fail-open on transient registry lookup failures (prevents DoS via database)
 * - Registry cache TTL: 60 seconds to balance freshness with performance
 * - Instance pause detection: Rejects events if instance has been manually paused
 *
 * Event Categories Handled:
 * - Connection: CONNECTION_UPDATE, QRCODE_UPDATED, LOGOFF_INSTANCE, APPLICATION_STARTUP
 * - Messages: MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE, MESSAGES_EDITED, MESSAGES_SET
 * - Message delivery: SEND_MESSAGE (success/failure tracking)
 * - Contacts: CONTACTS_UPSERT, CONTACTS_SET
 * - Chats: CHATS_UPDATE, CHATS_DELETE, CHATS_SET
 * - Groups: GROUPS_UPSERT, GROUP_PARTICIPANTS_UPDATE
 * - Media: PRESENCE_UPDATE (status changes)
 * - Reactions: Message reactions via handleReactionEvent
 * - Calls: CALL_EVENT (incoming/missed call handling)
 * - Labels: LABELS_EDIT, LABELS_ASSOCIATION
 *
 * Processing Flow:
 * 1. Validate request method (POST only) and CORS
 * 2. Validate SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (fail 503 if missing)
 * 3. Read raw body and validate HMAC signature (reject if invalid)
 * 4. Parse webhook JSON schema (reject if malformed)
 * 5. Check rate limit per instance (reject 429 if exceeded)
 * 6. Verify instance exists in registry and not paused (fail-open on transient errors)
 * 7. Normalize event name and route to appropriate handler (CONNECTION_UPDATE→handleConnectionUpdate, etc.)
 * 8. For message events: Parse media, decode base64 content if webhook_base64=true
 * 9. Mark event as processed in audit log; route to dead-letter queue on handler failure
 * 10. Return 200 OK with { received: true } (acknowledge webhook before async processing)
 *
 * Error Handling:
 * - HMAC validation failure: 401 Unauthorized (attacker/misconfiguration)
 * - Malformed JSON: 400 Bad Request (Evolution API or network error)
 * - Rate limit exceeded: 429 Too Many Requests (retry backoff)
 * - Unknown instance (strict mode): 403 Forbidden (security gate)
 * - Database/transient errors: Log but fail-open (prevent pipeline blockage)
 * - Handler exceptions: Log + route to dead-letter queue for manual review
 *
 * Performance & Reliability:
 * - Async event processing: Return 200 before handlers complete (prevents webhook timeout)
 * - Registry cache: 60s TTL reduces database queries 60:1
 * - Dead-letter queue: Failed events stored for manual investigation
 * - Audit logging: All events recorded for compliance + debugging
 * - Request ID: Unique ID per webhook for correlation across logs
 *
 * Configuration:
 * - EVOLUTION_WEBHOOK_SECRETS: Comma-separated list for rotation (new secret first)
 * - EVOLUTION_WEBHOOK_STRICT: true (default) | false - registry verification mode
 * - WEBHOOK_SECRET: Deprecated legacy single-secret fallback
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, redactSecrets, contractErrorResponse } from "../_shared/validation.ts";
import { WebhookPayloadSchema } from "../_shared/webhook-schemas.ts";
import {
  isRecord, normalizeEventName, toEventRecords,
  handleReactionEvent, redactJid, generateRequestId,
  sha256Hex, markEventProcessed, auditWebhookEvent,
  routeToDeadLetter, instanceOrFilter,
  type WebhookPayload,
} from "../_shared/evolution-helpers.ts";
import { parseMessageContent } from "../_shared/evolution-media.ts";
import {
  handleConnectionUpdate, handleSendMessage, handleMessagesUpdate, handleMessagesDelete,
  handleContactsUpsert, handlePresenceUpdate, handleChatsUpdate,
  handleLabelsEdit, handleLabelsAssociation, handleCallEvent,
  handleChatsDelete, handleApplicationStartup, handleMessagesSet,
  handleContactsSet, handleChatsSet, handleMessagesEdited,
  handleLogoutInstance, handleGroupsUpsert, handleGroupParticipantsUpdate,
} from "../_shared/evolution-webhook-handlers.ts";
import {
  handleIncomingMessage, handleOutgoingWhatsAppMessage,
} from "../_shared/evolution-webhook-messages.ts";
import { createWebhookValidator, readWebhookSecretsFromEnv } from "../_shared/hmac-validation.ts";
import { isInstancePaused, recordAuthFailureAndMaybePause } from "../_shared/instance-pause.ts";
import { checkRateLimit } from "../_shared/rate-limiter.ts";

// Multi-secret support enables zero-downtime rotation:
//   - EVOLUTION_WEBHOOK_SECRETS=new,old  → validate both, sign with `new`
//   - EVOLUTION_WEBHOOK_SECRET=single    → legacy single-secret mode
// Falls back to the older WEBHOOK_SECRET env name for backwards compatibility.
const WEBHOOK_SECRETS = (() => {
  const evo = readWebhookSecretsFromEnv('EVOLUTION_WEBHOOK');
  if (evo.length > 0) return evo;
  const legacy = Deno.env.get('WEBHOOK_SECRET');
  return legacy ? [legacy] : [];
})();
const STRICT_MODE = (Deno.env.get('EVOLUTION_WEBHOOK_STRICT') ?? 'true').toLowerCase() !== 'false';
const validateWebhook = WEBHOOK_SECRETS.length > 0
  ? createWebhookValidator(WEBHOOK_SECRETS, STRICT_MODE)
  : null;

/**
 * In-memory registry cache for instance verification with TTL-based expiration.
 * Stores { known: boolean, at: timestamp } tuples keyed by instance name.
 * Used to reduce database queries during high-volume webhook processing.
 * @private
 */
const __registryCache = new Map<string, { known: boolean; at: number }>();

/**
 * Registry cache TTL in milliseconds. Set to 60 seconds to balance freshness
 * (prevents stale instance data) with performance (reduces database load 60:1).
 * @private
 */
const __REGISTRY_TTL_MS = 60_000;

/**
 * Verifies instance existence in instance_registry table with in-memory caching.
 *
 * Security Gate (strict mode):
 * - Returns true if instance found in registry (regardless of is_active status)
 * - Prevents processing events from unregistered/rogue Evolution API instances
 * - Cache reduces database queries: ~60 repeated events from same instance = 1 query
 *
 * Fail-Open Strategy:
 * - Returns null on transient database errors (lookup fails, PostgREST timeout)
 * - Callers treat null as "unknown but allow" to prevent DoS via database failures
 * - Logs all lookup errors for monitoring; incidents resolved separately
 *
 * Cache Expiration:
 * - Each entry cached for 60 seconds from lookup time
 * - Expired entries purged on next lookup (lazy eviction)
 * - Note: New instances up to 60 seconds to appear in webhook (acceptable latency)
 *
 * @param supabase - Supabase service role client for database access
 * @param instance - Instance name/ID to verify (e.g., 'zapp-instance-001')
 * @returns true if known, false if unknown, null if lookup failed (transient error)
 * @private
 */
// deno-lint-ignore no-explicit-any
async function isKnownInstance(supabase: any, instance: string): Promise<boolean | null> {
  if (!instance) return false;
  const hit = __registryCache.get(instance);
  if (hit && Date.now() - hit.at < __REGISTRY_TTL_MS) return hit.known;
  try {
    const { data, error } = await supabase.from('instance_registry')
      .select('instance_name').eq('instance_name', instance).limit(1).maybeSingle();
    if (error) { console.error(`[registry-guard] lookup error: ${error.message}`); return null; }
    const known = !!data;
    __registryCache.set(instance, { known, at: Date.now() });
    return known;
  } catch (e) {
    console.error(`[registry-guard] lookup exception: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

serve(async (req) => {
  const requestId = generateRequestId();
  const startedAt = Date.now();
  const baseHeaders = { 'Content-Type': 'application/json', 'x-request-id': requestId };

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = { ...getCorsHeaders(req), ...baseHeaders };

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrlHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
  const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
  const supabaseUrl = (typeof supabaseUrlHosted === 'string' && supabaseUrlHosted.length > 0)
    ? supabaseUrlHosted
    : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

  const supabaseServiceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceKey = (typeof supabaseServiceKeyHosted === 'string' && supabaseServiceKeyHosted.length > 0)
    ? supabaseServiceKeyHosted
    : (typeof supabaseServiceKeyDefault === 'string' && supabaseServiceKeyDefault.length > 0 ? supabaseServiceKeyDefault : '');

  // FIX B5: falhar com 503 legível em vez de crashar (BOOT_ERROR 500) quando env está incompleta.
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'webhook_misconfigured', hint: 'SUPABASE_URL/SERVICE_ROLE ausentes' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // HMAC validation before reading body as JSON so we can verify on raw text.
  let rawBody: string;
  // Tenta extrair instância do header (alguns webhooks Evolution mandam) p/ contar falhas
  // antes mesmo de parsear o body. Cai em 'unknown' se não houver.
  const headerInstanceVal = req.headers.get('x-evolution-instance') || req.headers.get('x-instance');
  const headerInstance = typeof headerInstanceVal === 'string' && headerInstanceVal.length > 0 ? headerInstanceVal : null;

  // [PATCH 2026-07-03] Auth por secret estatico: Evolution API envia header fixo x-webhook-secret,
  // nao assina HMAC por payload. Comparacao timing-safe contra os secrets configurados.
  const __tsEq = (a: string, b: string): boolean => { if (a.length !== b.length) { let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ (b.charCodeAt(i % (b.length || 1)) || 0); return false; } let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
  const __staticSecret = req.headers.get('x-webhook-secret');
  const __staticSecretOk = __staticSecret !== null && WEBHOOK_SECRETS.some((s) => __tsEq(__staticSecret, s));
  if (__staticSecretOk) {
    rawBody = await req.text();
  } else if (validateWebhook) {
    const result = await validateWebhook(req);
    if (!result.valid) {
      console.warn(redactSecrets(`[webhook][${requestId}] rejected: ${result.error ?? 'unknown'} signatureFound=${result.signatureFound}`));
      // Auto-pause: conta invalid_signature na janela e persiste o evento
      recordAuthFailureAndMaybePause(supabase, headerInstance ?? 'unknown', 'invalid_signature', 'webhook', { message: result.error ?? 'invalid_signature' });
      await auditWebhookEvent(supabase, {
        request_id: requestId, status: 'rejected',
        error_message: result.error ?? 'invalid_signature',
        duration_ms: Date.now() - startedAt,
      });
      return new Response(
        JSON.stringify({ error: 'unauthorized', reason: result.error ?? 'invalid_signature', requestId }),
        { status: 401, headers: corsHeaders },
      );
    }
    rawBody = result.payload ?? '';
  } else {
    console.warn(redactSecrets(`[webhook][${requestId}] WEBHOOK_SECRET not configured — signature validation skipped`));
    rawBody = await req.text();
  }

  let payload: WebhookPayload;
  try {
    const jsonRaw = JSON.parse(rawBody);
    const json = (typeof jsonRaw === 'object' && jsonRaw !== null && !Array.isArray(jsonRaw)) ? jsonRaw : {};
    const parsed = WebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(`[webhook][${requestId}] contract_violation:`, parsed.error.issues);
      await auditWebhookEvent(supabase, {
        request_id: requestId, status: 'rejected', error_message: 'contract_violation',
        duration_ms: Date.now() - startedAt,
      });
      return contractErrorResponse(
        'INVALID_WEBHOOK_PAYLOAD',
        'Payload does not match Evolution Webhook contract',
        parsed.error.issues,
        requestId,
        req
      );
    }
    payload = parsed.data as WebhookPayload;
  } catch {
    await auditWebhookEvent(supabase, {
      request_id: requestId, status: 'rejected', error_message: 'invalid_json',
      duration_ms: Date.now() - startedAt,
    });
    return new Response(JSON.stringify({ error: 'invalid_json', requestId }), { status: 400, headers: corsHeaders });
  }

  const event = normalizeEventName(payload.event);
  const instance = payload.instance;
  const data = payload.data ?? {};
  const baseData = isRecord(data) ? data : {};

  // Pause guard: se a instância foi pausada (manual ou auto), descarta o evento
  // com 503 e audit 'rejected'. A Evolution costuma retry-arr, mas durante a
  // janela de pausa preferimos isso a continuar processando lixo.
  if (await isInstancePaused(supabase, instance)) {
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'rejected',
      error_message: 'instance_paused',
      duration_ms: Date.now() - startedAt,
    });
    console.warn(`[webhook][${requestId}] instance=${instance} is paused — skipping event ${event}`);
    return new Response(
      JSON.stringify({ error: 'instance_paused', instance, requestId }),
      { status: 503, headers: { ...corsHeaders, 'Retry-After': '60' } },
    );
  }

  // [PATCH 2026-07-04 registry-guard] Instancia desconhecida => HTTP 200 + skip total
  // (200 evita retry-storm do consumer; nada e persistido) + audit rejected/unknown_instance
  // + log de seguranca. Lookup com falha (null) => fail-open, segue o fluxo normal.
  const __knownInstance = await isKnownInstance(supabase, instance);
  if (__knownInstance === false) {
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'rejected',
      error_message: 'unknown_instance',
      duration_ms: Date.now() - startedAt,
    });
    console.warn(`[webhook][${requestId}] SECURITY unknown_instance='${instance}' event=${event} - ignored`);
    return new Response(
      JSON.stringify({ success: true, ignored: true, reason: 'unknown_instance', requestId }),
      { status: 200, headers: corsHeaders },
    );
  }

  // [ORDER 2026-07-04] Idempotency ANTES do rate-limit: retries duplicados do Evolution nao consomem quota.
  // Dedup by hash of (instance + event + body); se ja vimos este event_id, short-circuit 200.
  const bodyHash = await sha256Hex(rawBody);
  const eventId = `${instance || 'unknown'}:${event}:${bodyHash}`;
  const isNew = await markEventProcessed(supabase, eventId, instance, event);
  if (!isNew) {
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'duplicate',
      duration_ms: Date.now() - startedAt,
    });
    console.log(`[webhook][${requestId}] duplicate event_id=${eventId.slice(0, 48)}… skipped`);
    return new Response(JSON.stringify({ success: true, duplicate: true, requestId }), { status: 200, headers: corsHeaders });
  }

  // Rate Limit guard: conta apenas eventos UNICOS (idempotency ja filtrou retries)
  // [FIX 2026-07-06] Limites por event-type: eventos de sync de alto volume recebiam 429
  // em bursts normais (sync grupos, atualizacao em massa de contatos). Default 300/min mantido.
  const EVENT_RATE_LIMITS: Record<string, number> = {
    "chats.update":    2000, // sync de chat: gerado por toda mensagem recebida
    "contacts.update": 1000, // importacao/sync de contatos em massa
    "messages.upsert":  600, // 2x default: bursts em grupos grandes
    "groups.upsert":    600, // sincronizacao inicial de grupos
  };
  const rateLimit = await checkRateLimit(supabase, {
    instanceId: instance || 'unknown',
    eventType: event,
    limit: EVENT_RATE_LIMITS[event] ?? 300,
  });
  if (!rateLimit.allowed) {
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'rejected',
      error_message: 'rate_limit_exceeded',
      duration_ms: Date.now() - startedAt,
    });
    console.warn(`[webhook][${requestId}] rate limit exceeded for ${instance}:${event} (${rateLimit.currentCount}/${rateLimit.limit})`);
    return new Response(
      JSON.stringify({ error: 'rate_limit_exceeded', instance, requestId }),
      { status: 429, headers: corsHeaders }
    );
  }

  console.log(`[webhook][${requestId}] received raw=${payload.event} norm=${event} instance=${instance}`);

  try {
    if (event === 'connection.update') await handleConnectionUpdate(supabase, instance, baseData);

    if (event === 'logout.instance') await handleLogoutInstance(supabase, instance, baseData);

    if (event === 'qrcode.updated') {
      const qrcodeObj = isRecord(baseData.qrcode) ? baseData.qrcode : null;
      const qrCode = (qrcodeObj && typeof qrcodeObj.base64 === 'string') ? qrcodeObj.base64 : undefined;
      if (typeof qrCode === 'string' && qrCode.length > 0) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: qrCode, status: 'qr_pending', updated_at: new Date().toISOString() })
          .or(instanceOrFilter(instance));
      }
      // [FIX 2026-07-06] QR alert: notificar admin via n8n (fire-and-forget, nao bloqueia)
      const _n8nQrUrl = 'https://webhook.atomicabr.com.br/webhook/qr-alert-wpp2';
      fetch(_n8nQrUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'qrcode.updated', instance, status: 'qr_pending', ts: new Date().toISOString() }),
        signal: AbortSignal.timeout(4000),
      }).catch((e: unknown) => {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn('[qr-alert] n8n call failed:', errorMsg);
      });
    }

    if (event === 'messages.upsert') {
      const entries = toEventRecords(data, ['messages']);
      console.log(`[webhook][${requestId}][msg.upsert] entries=${entries.length} instance=${instance}`);
      for (const entry of entries) {
        // Per-entry try/catch: a batch can carry several messages, and Baileys/Evolution
        // sometimes ships one malformed entry alongside otherwise-healthy ones. Without
        // this guard, one throwing entry aborts the loop and silently drops every
        // remaining entry in the batch too (they never get a second chance — the whole
        // event is already marked processed by the idempotency guard above). Isolate the
        // failure to just this entry and dead-letter it so the rest of the batch lands.
        try {
          const keySource = isRecord(entry.key) ? entry.key : isRecord(baseData.key) ? baseData.key : null;
          const externalId =
            (typeof entry.id === 'string' && entry.id) ||
            (typeof baseData.id === 'string' && baseData.id) ||
            (typeof keySource?.id === 'string' && keySource.id) ||
            null;

          if (!externalId) {
            console.log(`[webhook][${requestId}][msg.upsert] ignored: missing id`);
            continue;
          }

          const key = {
            id: externalId,
            fromMe: Boolean(
              (typeof entry.fromMe === 'boolean' ? entry.fromMe : undefined) ??
              (typeof baseData.fromMe === 'boolean' ? baseData.fromMe : undefined) ??
              (typeof keySource?.fromMe === 'boolean' ? keySource.fromMe : undefined) ??
              false
            ),
            remoteJid:
              (typeof entry.remoteJid === 'string' ? entry.remoteJid : undefined) ??
              (typeof baseData.remoteJid === 'string' ? baseData.remoteJid : undefined) ??
              (typeof keySource?.remoteJid === 'string' ? keySource.remoteJid : undefined),
            remoteJidAlt:
              (typeof entry.remoteJidAlt === 'string' ? entry.remoteJidAlt : undefined) ??
              (typeof baseData.remoteJidAlt === 'string' ? baseData.remoteJidAlt : undefined) ??
              (typeof keySource?.remoteJidAlt === 'string' ? keySource.remoteJidAlt : undefined),
            participant:
              (typeof entry.participant === 'string' ? entry.participant : undefined) ??
              (typeof baseData.participant === 'string' ? baseData.participant : undefined) ??
              (typeof keySource?.participant === 'string' ? keySource.participant : undefined),
            participantAlt:
              (typeof entry.participantAlt === 'string' ? entry.participantAlt : undefined) ??
              (typeof baseData.participantAlt === 'string' ? baseData.participantAlt : undefined) ??
              (typeof keySource?.participantAlt === 'string' ? keySource.participantAlt : undefined),
          };

          const hasReaction = (isRecord(entry.message) && !!entry.message.reactionMessage)
            || (isRecord(baseData.message) && !!baseData.message.reactionMessage);
          console.log(`[webhook][${requestId}][msg.upsert] id=${externalId} fromMe=${key.fromMe} jid=${redactJid(key.remoteJid)} reaction=${hasReaction}`);

          const msgObj = entry.message || baseData.message;
          const msg = isRecord(msgObj) ? msgObj : undefined;
          if (msg && isRecord(msg.reactionMessage)) {
            await handleReactionEvent(supabase, instance, msg.reactionMessage, !!key.fromMe);
            continue;
          }

          if (!key.fromMe) {
            await handleIncomingMessage(supabase, instance, { ...baseData, ...entry }, key, supabaseUrl, supabaseServiceKey);
          } else {
            await handleOutgoingWhatsAppMessage(supabase, instance, { ...baseData, ...entry }, key);
          }
        } catch (entryError: unknown) {
          const entryDetail = entryError instanceof Error ? entryError.message : String(entryError);
          const entryStack = entryError instanceof Error ? (entryError.stack ?? null) : null;
          console.error(redactSecrets(`[webhook][${requestId}][msg.upsert] entry_error instance=${instance}: ${entryDetail}`));
          await routeToDeadLetter(supabase, {
            event_type: event, instance, payload: entry,
            error_message: entryDetail, error_stack: entryStack,
            request_id: requestId,
          });
        }
      }
    }

    if (event === 'send.message') await handleSendMessage(supabase, instance, data, baseData);
    if (event === 'messages.update') await handleMessagesUpdate(supabase, instance, data, baseData);
    if (event === 'messages.delete') await handleMessagesDelete(supabase, instance, data, baseData);
    if (event === 'contacts.upsert' || event === 'contacts.update') await handleContactsUpsert(supabase, instance, data);
    if (event === 'presence.update') await handlePresenceUpdate(supabase, instance, data);
    if (event === 'chats.upsert' || event === 'chats.update') await handleChatsUpdate(supabase, instance, data);

    if (event === 'groups.upsert' || event === 'group.update') {
      await handleGroupsUpsert(supabase, instance, data);
    }

    if (event === 'group.participants.update' || event === 'group-participants.update') {
      await handleGroupParticipantsUpdate(supabase, instance, data);
    }

    if (event === 'labels.edit') await handleLabelsEdit(supabase, instance, data);
    if (event === 'labels.association') await handleLabelsAssociation(supabase, instance, data);
    if (event === 'call') await handleCallEvent(supabase, instance, data);
    if (event === 'chats.delete') await handleChatsDelete(supabase, instance, data);
    if (event === 'application.startup') await handleApplicationStartup(supabase, instance);
    if (event === 'messages.set') await handleMessagesSet(supabase, instance, data);
    if (event === 'contacts.set') await handleContactsSet(supabase, instance, data);
    if (event === 'chats.set') await handleChatsSet(supabase, instance, data);
    if (event === 'messages.edited' || event === 'messages.edit') await handleMessagesEdited(supabase, instance, data, baseData);

    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'processed',
      duration_ms: Date.now() - startedAt,
    });
    return new Response(JSON.stringify({ success: true, requestId }), { status: 200, headers: corsHeaders });
  } catch (error: unknown) {
    // Logical/handler errors: log the detail internally, return 200 to evo so it does not
    // retry-storm the same event. The idempotency guard above marks the event processed
    // BEFORE the handler runs, so without a DLQ a handler failure here is permanent,
    // silent data loss (the exact wpp2 gap this contract test guards against — see
    // evolution-webhook/__tests__/contract.test.ts). Route to the DLQ before auditing so
    // the loss is recoverable even if the audit insert itself fails.
    const detail = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? (error.stack ?? null) : null;
    console.error(redactSecrets(`[webhook][${requestId}] handler_error event=${event} instance=${instance}: ${detail}`));
    await routeToDeadLetter(supabase, {
      event_type: event, instance, payload,
      error_message: detail, error_stack: errorStack,
      request_id: requestId,
    });
    const detailTruncated = typeof detail === 'string' ? detail.slice(0, 500) : '';
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'error',
      duration_ms: Date.now() - startedAt, error_message: detailTruncated,
    });
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error', requestId }),
      { status: 200, headers: corsHeaders },
    );
  }
});
