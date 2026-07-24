import { createZappAdminClient } from "../_shared/db-client.ts";
import { getCorsHeaders, handleCors, redactSecrets, contractErrorResponse } from "../_shared/validation.ts";
import { timingSafeStringEqual } from "../_shared/auth.ts";
import { initSentry, captureException } from "../_shared/sentry.ts";
import { WebhookPayloadSchema } from "../_shared/webhook-schemas.ts";
import {
  isRecord, normalizeEventName, toEventRecords,
  handleReactionEvent, redactJid, generateRequestId,
  sha256Hex, markEventProcessed, unmarkEventProcessed, auditWebhookEvent,
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

// [PATCH 2026-07-04 registry-guard] So processa eventos de instancias cadastradas em
// instance_registry (existencia, nao is_active - evita perda de dados de instancia nova
// ainda nao ativada). Cache em memoria TTL 60s. Fail-open (null) em erro de lookup para
// nao derrubar o pipeline por falha transitoria do PostgREST.
const __registryCache = new Map<string, { known: boolean; at: number }>();
const __REGISTRY_TTL_MS = 60_000;
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

Deno.serve(async (req) => {
  initSentry('evolution-webhook');

  const requestId = generateRequestId();
  const startedAt = Date.now();
  const baseHeaders = { 'Content-Type': 'application/json', 'x-request-id': requestId };

  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = { ...getCorsHeaders(req), ...baseHeaders };

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // FIX B5: falhar com 503 legível em vez de crashar (BOOT_ERROR 500) quando env está incompleta.
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'webhook_misconfigured', hint: 'SUPABASE_URL/SERVICE_ROLE ausentes' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const supabase = createZappAdminClient();

  // HMAC validation before reading body as JSON so we can verify on raw text.
  let rawBody: string;
  // Tenta extrair instância do header (alguns webhooks Evolution mandam) p/ contar falhas
  // antes mesmo de parsear o body. Cai em 'unknown' se não houver.
  const headerInstance = req.headers.get('x-evolution-instance') || req.headers.get('x-instance') || null;

  // [PATCH 2026-07-03] Auth por secret estatico: Evolution API envia header fixo x-webhook-secret,
  // nao assina HMAC por payload. Comparacao timing-safe contra os secrets configurados.
  const __staticSecret = req.headers.get('x-webhook-secret');
  const __staticSecretOk = __staticSecret !== null && WEBHOOK_SECRETS.some((s) => timingSafeStringEqual(__staticSecret, s));
  if (__staticSecretOk) {
    rawBody = await req.text();
  } else if (validateWebhook) {
    const result = await validateWebhook(req);
    if (!result.valid) {
      console.warn(redactSecrets(`[webhook][${requestId}] rejected: ${result.error ?? 'unknown'} signatureFound=${result.signatureFound}`));
      // Auto-pause: conta invalid_signature na janela e persiste o evento
      recordAuthFailureAndMaybePause(supabase, headerInstance ?? 'unknown', 'invalid_signature', 'webhook', { message: result.error ?? 'invalid_signature' });
      await auditWebhookEvent(supabase, {
        request_id: requestId, status: 'rejected', status_code: 401,
        error_message: result.error ?? 'invalid_signature',
        duration_ms: Date.now() - startedAt,
      });
      return new Response(
        JSON.stringify({ error: 'unauthorized', reason: result.error ?? 'invalid_signature', requestId }),
        { status: 401, headers: corsHeaders },
      );
    }
    rawBody = result.payload ?? '';
  } else if (STRICT_MODE) {
    // [A-1 FIX 2026-07-12] Fail-CLOSED: sem nenhum secret configurado, o webhook
    // ficava público (aceitava qualquer POST). Um deploy sem o secret provisionado
    // deixava qualquer um injetar eventos/mensagens falsas, criar contatos e
    // disparar alertas. Em modo estrito (default), rejeitamos com 503 até que o
    // secret esteja presente — nunca aceitamos tráfego não autenticado.
    console.error(redactSecrets(`[webhook][${requestId}] NO webhook secret configured and STRICT_MODE=on — refusing (fail-closed)`));
    await auditWebhookEvent(supabase, {
      request_id: requestId, status: 'rejected', status_code: 503,
      error_message: 'webhook_secret_unconfigured',
      duration_ms: Date.now() - startedAt,
    });
    return new Response(
      JSON.stringify({ error: 'webhook_misconfigured', reason: 'no_secret_configured', requestId }),
      { status: 503, headers: { ...corsHeaders, 'Retry-After': '120' } },
    );
  } else {
    console.warn(redactSecrets(`[webhook][${requestId}] WEBHOOK_SECRET not configured and STRICT_MODE=off — signature validation skipped`));
    rawBody = await req.text();
  }

  let payload: WebhookPayload;
  try {
    const json = JSON.parse(rawBody);
    const parsed = WebhookPayloadSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(`[webhook][${requestId}] contract_violation:`, parsed.error.issues);
      await auditWebhookEvent(supabase, {
        request_id: requestId, status: 'rejected', status_code: 422, error_message: 'contract_violation',
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
      request_id: requestId, status: 'rejected', status_code: 400, error_message: 'invalid_json',
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
      request_id: requestId, instance, event_type: event, status: 'rejected', status_code: 503,
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
      request_id: requestId, instance, event_type: event, status: 'rejected', status_code: 200,
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
  // [FIX-07 2026-07-12 S2] Apply NFC Unicode normalization before hashing to prevent
  // normalization attacks where semantically identical messages with different Unicode
  // representations (e.g., café as precomposed U+00E9 vs combining U+0301) bypass dedup.
  const normalizedBody = rawBody.normalize('NFC');
  const bodyHash = await sha256Hex(normalizedBody);
  const eventId = `${instance || 'unknown'}:${event}:${bodyHash}`;
  const isNew = await markEventProcessed(supabase, eventId, instance, event);
  if (!isNew) {
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'duplicate', status_code: 200,
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
  const WINDOW_SECONDS = 60; // [FIX 2026-07-12 G3] Match rate-limiter window
  const rateLimit = await checkRateLimit(supabase, {
    instanceId: instance || 'unknown',
    eventType: event,
    limit: EVENT_RATE_LIMITS[event] ?? 300,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!rateLimit.allowed) {
    // [C-1 FIX 2026-07-12] Roll back the idempotency mark so this 429'd event stays
    // re-deliverable. Idempotency is marked BEFORE the rate-limit check (so genuine
    // retries don't reconsume quota), but without this rollback a burst-throttled
    // event would be permanently deduped: the consumer's requeue/redelivery would
    // short-circuit as "duplicate" at markEventProcessed() and the message would be
    // silently lost — the exact wpp2 data-loss class this pipeline guards against.
    // [G1 FIX 2026-07-12] Track rollback failures to audit trail for event-loss detection.
    const rollbackOk = await unmarkEventProcessed(supabase, eventId, instance, event);

    // [G3 FIX 2026-07-12] Calculate Retry-After to next window boundary (not fixed 30s)
    const now = Date.now();
    const windowMs = WINDOW_SECONDS * 1000;
    const bucketStart = Math.floor(now / windowMs) * windowMs;
    const bucketEnd = bucketStart + windowMs;
    const retryAfterSeconds = Math.ceil((bucketEnd - now) / 1000);

    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'rejected', status_code: 429,
      error_message: rollbackOk ? 'rate_limit_exceeded' : 'rate_limit_exceeded_rollback_failed',
      duration_ms: Date.now() - startedAt,
    });
    if (!rollbackOk) {
      console.error(`[webhook][${requestId}] CRITICAL: idempotency rollback FAILED for event_id=${eventId.slice(0,48)}… — event will be silently lost on re-delivery`);
    } else {
      console.warn(`[webhook][${requestId}] rate limit exceeded for ${instance}:${event} (${rateLimit.currentCount}/${rateLimit.limit}) — idempotency rolled back, retry after ${retryAfterSeconds}s`);
    }
    return new Response(
      JSON.stringify({ error: 'rate_limit_exceeded', instance, requestId }),
      { status: 429, headers: { ...corsHeaders, 'Retry-After': String(retryAfterSeconds) } }
    );
  }

  console.log(`[webhook][${requestId}] received raw=${payload.event} norm=${event} instance=${instance}`);

  try {
    if (event === 'connection.update') await handleConnectionUpdate(supabase, instance, baseData);

    if (event === 'logout.instance') await handleLogoutInstance(supabase, instance, baseData);

    if (event === 'qrcode.updated') {
      const qrCode = (baseData.qrcode as Record<string, string>)?.base64;
      if (qrCode) {
        await supabase.from('whatsapp_connections')
          .update({ qr_code: qrCode, status: 'qr_pending', updated_at: new Date().toISOString() })
          .or(instanceOrFilter(instance));
      }
      // [M-6 FIX 2026-07-12] QR alert via n8n (fire-and-forget). URL agora é
      // sobrescrevível por env (QR_ALERT_WEBHOOK_URL) em vez de fixa/acoplada a
      // wpp2, com header de auth opcional (QR_ALERT_WEBHOOK_TOKEN) para que a URL
      // não seja disparável por qualquer um que a conheça. Mantemos o valor atual
      // como default explícito para NÃO desligar um alerta vivo caso a env não
      // esteja provisionada.
      const _n8nQrUrl = Deno.env.get('QR_ALERT_WEBHOOK_URL') ?? 'https://webhook.atomicabr.com.br/webhook/qr-alert-wpp2';
      if (_n8nQrUrl) {
        const _qrHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        const _qrToken = Deno.env.get('QR_ALERT_WEBHOOK_TOKEN');
        if (_qrToken) _qrHeaders['x-webhook-token'] = _qrToken;
        fetch(_n8nQrUrl, {
          method: 'POST',
          headers: _qrHeaders,
          body: JSON.stringify({ event: 'qrcode.updated', instance, status: 'qr_pending', ts: new Date().toISOString() }),
          signal: AbortSignal.timeout(4000),
        }).catch((e: unknown) => console.warn('[qr-alert] n8n call failed:', e instanceof Error ? e.message : String(e)));
      } else {
        console.warn(`[qr-alert] QR_ALERT_WEBHOOK_URL not set — skipping QR alert for instance=${instance}`);
      }
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

          const hasReaction = !!(entry.message as Record<string,unknown>)?.reactionMessage
            || !!(baseData.message as Record<string,unknown>)?.reactionMessage;
          console.log(`[webhook][${requestId}][msg.upsert] id=${externalId} fromMe=${key.fromMe} jid=${redactJid(key.remoteJid)} reaction=${hasReaction}`);

          const msg = (entry.message || baseData.message) as Record<string, unknown> | undefined;
          if (msg?.reactionMessage) {
            await handleReactionEvent(supabase, instance, msg.reactionMessage as Record<string, unknown>, !!key.fromMe);
            continue;
          }

          if (!key.fromMe) {
            await handleIncomingMessage(supabase, instance, { ...baseData, ...entry }, key, supabaseUrl, supabaseServiceKey);
          } else {
            await handleOutgoingWhatsAppMessage(supabase, instance, { ...baseData, ...entry }, key);
          }
        } catch (entryError: unknown) {
          const entryDetail = entryError instanceof Error ? entryError.message : String(entryError);
          console.error(redactSecrets(`[webhook][${requestId}][msg.upsert] entry_error instance=${instance}: ${entryDetail}`));
          await routeToDeadLetter(supabase, {
            event_type: event, instance, payload: entry,
            error_message: entryDetail, error_stack: entryError instanceof Error ? entryError.stack ?? null : null,
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

    if (event === 'messages.reaction') {
      const reactionPayload = isRecord(baseData) ? baseData : {};
      const reactionMsg = reactionPayload.reaction as Record<string, unknown> | undefined;
      const reactorKey = isRecord(reactionPayload.key) ? reactionPayload.key : {};
      const fromMe = Boolean(reactorKey.fromMe);
      if (reactionMsg) {
        await handleReactionEvent(supabase, instance, reactionMsg, fromMe);
      }
    }

    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'processed', status_code: 200,
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
    console.error(redactSecrets(`[webhook][${requestId}] handler_error event=${event} instance=${instance}: ${detail}`));
    await captureException(error, {
      functionName: 'evolution-webhook',
      requestUrl: req.url,
      metadata: {
        requestId,
        event,
        instance,
        eventPayloadSize: rawBody?.length || 0,
      },
    });
    await routeToDeadLetter(supabase, {
      event_type: event, instance, payload,
      error_message: detail, error_stack: error instanceof Error ? error.stack ?? null : null,
      request_id: requestId,
    });
    await auditWebhookEvent(supabase, {
      request_id: requestId, instance, event_type: event, status: 'error', status_code: 200,
      duration_ms: Date.now() - startedAt, error_message: detail.slice(0, 500),
    });
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error', requestId }),
      { status: 200, headers: corsHeaders },
    );
  }
});
