import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors, authorizeRoles, errorResponse } from "../_shared/validation.ts";
import { EVOLUTION_ENVELOPE_VERSION, proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { normalizeChatList, normalizeContactList, normalizeProfile } from "../_shared/evolution-response-normalizers.ts";
import { maybeLogFallback } from "../_shared/evolution-fallback-telemetry.ts";
import { mapFetchInstancesToProfile, shouldFallbackForProfile } from "../_shared/evolution-profile-fallback.ts";
import { isInstancePaused, recordAuthFailureAndMaybePause } from "../_shared/instance-pause.ts";
import { WEBHOOK_EVENTS } from "../_shared/evolution-sync-actions.ts";

/**
 * Edge Function: Evolution API Proxy — Multi-Instance WhatsApp Provider Router
 *
 * Central proxy for Evolution API (self-hosted WhatsApp provider) supporting:
 * - Multiple instance management (create, connect, disconnect, restart)
 * - Message sending (text, media, audio, PTV, location, buttons, templates, stickers, polls, lists)
 * - Chat/Contact management (find, archive, delete, mark read/unread)
 * - Group operations (create, invite, update settings, manage participants)
 * - Profile management (name, status, picture, privacy settings)
 * - Integration configuration (Chatwoot, Typebot, OpenAI, Dify, Flowise, n8n, webhooks, proxies)
 *
 * Authentication & Authorization:
 * - Requires valid JWT in Authorization header (Bearer token)
 * - Tries self-hosted backend first, then Cloud Supabase for multi-tenant compatibility
 * - Both endpoints must be configured (SELFHOSTED_SUPABASE_URL + SUPABASE_URL)
 * - Returns 401 if JWT invalid or expired; 503 if backend unavailable
 *
 * Rate Limiting:
 * - Separates read-only polling (status, list-instances, instance-info: 600/60s per IP)
 *   from write operations (send, create, config: 120/60s per IP) to prevent rate limit
 *   starvation on high-frequency polling scenarios (useEvolutionAutoReconnect/useEvolutionAutoSync)
 * - Per-instance send rate limit: configurable via EVOLUTION_SEND_RATE_PER_INSTANCE (default 60/min)
 * - Returns 429 if limit exceeded with Retry-After header
 *
 * Instance Validation & Safety:
 * - Instance names must match /^[a-zA-Z0-9_-]{1,128}$/ (prevents path traversal)
 * - Detects and rejects UUIDs as instance names (prevents "phantom instance" bug: accidental
 *   instance creation with UUID name sequesters phone pairing outside pipeline)
 * - Paused instances (excessive auth failures) reject sends immediately with 503 + INSTANCE_PAUSED
 * - Tracks auth failures (401/403) and auto-pauses after threshold to prevent lockout loops
 *
 * Failure Handling & Resilience:
 * - Missing instances on connect: auto-create if not a UUID, then retry connect
 * - Auth failures: record attempt + pause instance, return 503 to client for retry
 * - Transient errors (502/503/504) on disconnect: retry up to 2 times with 500ms backoff
 * - Webhook reprocessing: admin-only action to retry failed webhook delivery attempts
 *
 * Payload Normalization:
 * - Supports both JSON and FormData (multipart) request bodies
 * - Validates all payloads before forwarding to Evolution API
 * - Filters and normalizes response objects (e.g., normalize chat/contact lists, profiles)
 *
 * Configuration Sources:
 * - Evolution API: EVOLUTION_API_URL (validated URL), EVOLUTION_API_KEY (apikey header)
 * - Supabase: SELFHOSTED_SUPABASE_URL → SUPABASE_URL (priority order)
 * - Supabase auth keys: SELFHOSTED_SUPABASE_ANON_KEY → SUPABASE_ANON_KEY
 * - Send rate limit: EVOLUTION_SEND_RATE_PER_INSTANCE env var
 *
 * Response Format:
 * - Success (200): { ...data, status, state } with CORS headers
 * - Errors: { version, error: true, status, code, message, details? } with appropriate HTTP status
 * - Both use application/json content type
 *
 * Supported Actions (30+):
 * Instance mgmt: create-instance, list-instances, instance-info, connect, disconnect, delete-instance,
 *                restart-instance, reprocess-failed-webhooks, status
 * Messaging: send-text, send-media, send-audio, send-ptv, send-location, send-contact, send-reaction,
 *            send-poll, send-sticker, send-list, send-buttons, send-status, send-template, mark-read,
 *            mark-unread, read-messages, archive-chat, delete-message, update-message
 * Chat/Contact: find-chats, find-messages, find-status-messages, find-contacts, check-numbers,
 *               get-media-base64, delete-for-everyone, edit-message
 * Groups: create-group, list-groups, group-info, group-participants, update-group-name,
 *         update-group-description, update-participants, update-group-setting, group-invite-code,
 *         revoke-invite-code, invite-info, accept-invite, leave-group, update-group-picture, toggle-ephemeral
 * Profile: fetch-profile, update-profile-name, update-profile-status, update-profile-picture,
 *          remove-profile-picture, fetch-profile-picture, fetch-business-profile, update-privacy
 * Labels: find-labels, handle-label
 * Integrations: set/get/delete-{chatwoot, typebot, openai, dify, flowise, evolution-bot, evoai, n8n, proxy, kafka, nats, pusher}
 * Settings: set-presence, set-settings, get-settings, set-webhook, get-webhook, set-{rabbitmq, sqs}
 * Templates: create-template, find-templates, delete-template
 * Misc: update-block-status, offer-call, send-chat-presence, get-{catalog, collections}
 */
Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const ip = getClientIP(req);

  // BUG FIX (2026-07-05): cheap, read-only polling actions (status, list-instances,
  // instance-info) used to share the same 120 req/60s IP-wide bucket as every other
  // action (sends, config changes, etc). With N connections each polling `status`
  // every 30s from useEvolutionAutoReconnect/useEvolutionAutoSync — plus normal user
  // traffic on the same IP/office network — that shared bucket saturates fast and
  // returns 429 on legitimate polling (observed: repeated 429 on
  // evolution-api/status for instance "wpp2", 2026-07-05 12:58 UTC logs).
  // Fix: give polling actions their own, much more generous bucket, so they no
  // longer compete with (or get starved by) write/send traffic on the same IP.
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const pathAction = pathParts[pathParts.length - 1];
  const READ_ONLY_POLL_ACTIONS = new Set(['status', 'list-instances', 'instance-info']);
  const isPollAction = READ_ONLY_POLL_ACTIONS.has(pathAction);

  const rl = isPollAction
    ? checkRateLimit(`evolution-poll:${ip}`, 600, 60_000)
    : checkRateLimit(`evolution:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  const rawEvolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').trim();
  const rawEvolutionApiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  const isPlaceholder = (v: string) => !v || /PLACEHOLDER|REPLACE_ME|YOUR_|CHANGE_ME/i.test(v);
  const isValidUrl = (v: string) => { try { new URL(v); return true; } catch { return false; } };

  const evolutionApiUrl = rawEvolutionApiUrl.replace(/\/+$/, '');
  const evolutionApiKey = rawEvolutionApiKey;

  if (isPlaceholder(evolutionApiUrl) || isPlaceholder(evolutionApiKey) || !isValidUrl(evolutionApiUrl)) {
    return new Response(JSON.stringify({ error: 'Evolution API not configured', message: 'Configure os secrets EVOLUTION_API_URL (URL válida) e EVOLUTION_API_KEY.' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'backend_misconfigured', hint: 'SUPABASE_URL/SERVICE_ROLE ausentes' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);


  // Always authenticate — body action may differ from the URL path segment, so skipping
  // auth based on the URL alone creates a bypass. Try self-hosted first (published app),
  // then Cloud, so JWTs from either backend are accepted.
  const selfUrlForAuth = Deno.env.get('SELFHOSTED_SUPABASE_URL');
  const selfAnonForAuth = Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY');
  const cloudUrlForAuth = Deno.env.get('SUPABASE_URL');
  const cloudAnonForAuth = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const authHeader = req.headers.get('Authorization') || '';
  const authCandidates: Array<{ url: string; key: string }> = [];
  if (selfUrlForAuth && selfAnonForAuth) authCandidates.push({ url: selfUrlForAuth, key: selfAnonForAuth });
  if (cloudUrlForAuth && cloudAnonForAuth) authCandidates.push({ url: cloudUrlForAuth, key: cloudAnonForAuth });
  let authedUser: { id: string; email: string | undefined } | null = null;
  for (const c of authCandidates) {
    try {
      const uc = createClient(c.url, c.key, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await uc.auth.getUser();
      if (!error && data?.user) { authedUser = { id: data.user.id, email: data.user.email }; break; }
    } catch { /* try next */ }
  }
  if (!authedUser) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const _u = authedUser;
  void _u;

  const SEND_PER_INSTANCE_PER_MIN = Number(Deno.env.get('EVOLUTION_SEND_RATE_PER_INSTANCE') ?? '60');

  let _bodyCache: Record<string, unknown> | null = null;
  let _formDataCache: FormData | null = null;

  /**
   * Safely parses JSON string, validating result is object (not array, null, or primitive).
   * Returns { raw, _parseError } on failure to distinguish parse errors from valid non-object responses.
   * Prevents downstream code from assuming parsed value is a Record<string, unknown>.
   */
  const safeJsonParse = (text: string): Record<string, unknown> => {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return { raw: text, _parseError: 'result_not_an_object' };
    } catch (e) {
      return { raw: text, _parseError: e instanceof Error ? e.message : 'parse_error' };
    }
  };

  /**
   * Retrieves parsed request body (JSON or FormData), caching to prevent multiple parses.
   * Returns { isMultipart, data } where data is FormData or cached Record<string, unknown>.
   * Handles Content-Type parsing and graceful fallback to empty object on error.
   */
  const getParsedBody = async () => {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      if (_formDataCache) return { isMultipart: true, data: _formDataCache };
      try {
        _formDataCache = await req.formData();
        return { isMultipart: true, data: _formDataCache };
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error("[Evolution API] Error parsing FormData:", errorMsg);
        return { isMultipart: false, data: {} };
      }
    }
    if (_bodyCache !== null) return { isMultipart: false, data: _bodyCache };
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    if (typeof _bodyCache !== 'object' || _bodyCache === null || Array.isArray(_bodyCache)) {
      _bodyCache = {};
    }
    return { isMultipart: false, data: _bodyCache! };
  };

  /**
   * Safely extracts string value from JSON object or FormData by key.
   * Returns undefined if data is invalid type or key value is non-string.
   * Prevents runtime errors from accessing properties on null/array/primitive values.
   */
  const safeGet = (data: unknown, key: string, isFormData: boolean): string | undefined => {
    if (isFormData && data instanceof FormData) {
      const val = data.get(key);
      return typeof val === 'string' ? val : undefined;
    }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      const val = (data as Record<string, unknown>)[key];
      return typeof val === 'string' ? val : undefined;
    }
    return undefined;
  };

  /**
   * Extracts any value (not just strings) from JSON object or FormData by key.
   * Returns undefined if data is invalid type. Allows callers to handle type conversion themselves.
   */
  const safeGetAny = (data: unknown, key: string, isFormData: boolean): unknown => {
    if (isFormData && data instanceof FormData) {
      return data.get(key);
    }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return (data as Record<string, unknown>)[key];
    }
    return undefined;
  };

  /**
   * Coerces unknown data to Record<string, unknown>, returning empty object if type is invalid.
   * Used after getParsedBody to guarantee caller can safely call safeGet on the result.
   */
  const ensureBodyIsRecord = (data: unknown): Record<string, unknown> => {
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
    return {};
  };

  /**
   * Normalizes and validates create-instance request into Evolution API payload format.
   * Extracts: qrcode (boolean), integration, token, number, businessId, wabaId, phoneNumberId,
   *           webhook, chatwoot, typebot, proxy — all strings except qrcode (defaults to true).
   */
  const buildCreateInstancePayload = (data: unknown, isFormData: boolean) => ({
    qrcode: (() => {
      const val = safeGetAny(data, 'qrcode', isFormData);
      return val === false ? false : true;
    })(),
    integration: safeGet(data, 'integration', isFormData) || 'WHATSAPP-BAILEYS',
    token: safeGet(data, 'token', isFormData) || undefined,
    number: safeGet(data, 'number', isFormData) || undefined,
    businessId: safeGet(data, 'businessId', isFormData) || undefined,
    wabaId: safeGet(data, 'wabaId', isFormData) || undefined,
    phoneNumberId: safeGet(data, 'phoneNumberId', isFormData) || undefined,
    webhook: safeGet(data, 'webhook', isFormData) || undefined,
    chatwoot: safeGet(data, 'chatwoot', isFormData) || undefined,
    typebot: safeGet(data, 'typebot', isFormData) || undefined,
    proxy: safeGet(data, 'proxy', isFormData) || undefined,
  });

  /**
   * Normalizes instance settings request into Evolution API payload.
   * Extracts: rejectCall, msgCall (strings), groupsIgnore, alwaysOnline, readMessages,
   *           readStatus, syncFullHistory (any type for flexibility).
   */
  const buildSettingsPayload = (data: unknown, isFormData: boolean) => ({
    rejectCall: safeGetAny(data, 'rejectCall', isFormData),
    msgCall: safeGet(data, 'msgCall', isFormData),
    groupsIgnore: safeGetAny(data, 'groupsIgnore', isFormData),
    alwaysOnline: safeGetAny(data, 'alwaysOnline', isFormData),
    readMessages: safeGetAny(data, 'readMessages', isFormData),
    readStatus: safeGetAny(data, 'readStatus', isFormData),
    syncFullHistory: safeGetAny(data, 'syncFullHistory', isFormData),
  });

  /**
   * Normalizes webhook configuration into Evolution API format.
   * Supports both nested { webhook: { url, ... } } and flat { url, ... } request formats.
   * Defaults: enabled=true, webhookByEvents=false, webhookBase64=true, events=[all WEBHOOK_EVENTS].
   */
  const buildWebhookPayload = (data: unknown, isFormData: boolean) => {
    // Support both nested { webhook: { url, ... } } and flat { url, ... } formats
    const webhookObj = safeGetAny(data, 'webhook', isFormData);
    const wb = (typeof webhookObj === 'object' && webhookObj !== null && !Array.isArray(webhookObj))
      ? (webhookObj as Record<string, unknown>)
      : {};

    const webhookUrl = safeGet(wb as unknown, 'url', false) || safeGet(data, 'url', isFormData);
    const webhookEnabled = (wb.enabled as boolean | undefined) ?? (safeGetAny(data, 'enabled', isFormData) as boolean | undefined) ?? true;
    const webhookByEvents = (wb.webhookByEvents as boolean | undefined) ?? (safeGetAny(data, 'webhookByEvents', isFormData) as boolean | undefined) ?? false;
    const webhookBase64 = (wb.webhookBase64 as boolean | undefined) ?? (safeGetAny(data, 'webhookBase64', isFormData) as boolean | undefined) ?? true;
    const webhookEvents = Array.isArray(wb.events) ? wb.events as string[] : (Array.isArray(safeGetAny(data, 'events', isFormData)) ? safeGetAny(data, 'events', isFormData) as string[] : WEBHOOK_EVENTS);

    return { webhook: { enabled: webhookEnabled, url: webhookUrl, webhookByEvents, webhookBase64, events: webhookEvents } };
  };

  /**
   * Normalizes text message request into Evolution API send-text payload.
   * Required: number, text. Optional: delay, quoted, mentionsEveryOne, mentioned, linkPreview (all pass-through).
   */
  const buildSendTextPayload = (data: unknown, isFormData: boolean) => {
    const payload: Record<string, unknown> = {
      number: safeGet(data, 'number', isFormData),
      text: safeGet(data, 'text', isFormData)
    };
    const delay = safeGetAny(data, 'delay', isFormData);
    if (delay !== undefined) payload.delay = delay;
    const quoted = safeGetAny(data, 'quoted', isFormData);
    if (quoted !== undefined) payload.quoted = quoted;
    const mentionsEveryOne = safeGetAny(data, 'mentionsEveryOne', isFormData);
    if (mentionsEveryOne !== undefined) payload.mentionsEveryOne = mentionsEveryOne;
    const mentioned = safeGetAny(data, 'mentioned', isFormData);
    if (mentioned !== undefined) payload.mentioned = mentioned;
    const linkPreview = safeGetAny(data, 'linkPreview', isFormData);
    if (linkPreview !== undefined) payload.linkPreview = linkPreview;
    return payload;
  };

  /**
   * Normalizes media message request into Evolution API send-media payload.
   * Supports: mediaType/mediatype (type alias), mimetype, caption, media/mediaUrl, fileName, delay.
   * Flexible to support different field-naming conventions from clients.
   */
  const buildSendMediaPayload = (data: unknown, isFormData: boolean) => ({
    number: safeGet(data, 'number', isFormData),
    mediatype: safeGet(data, 'mediaType', isFormData) || safeGet(data, 'mediatype', isFormData),
    mimetype: safeGet(data, 'mimetype', isFormData),
    caption: safeGet(data, 'caption', isFormData),
    media: safeGet(data, 'mediaUrl', isFormData) || safeGet(data, 'media', isFormData),
    fileName: safeGet(data, 'fileName', isFormData),
    delay: safeGet(data, 'delay', isFormData),
  });

  const { isMultipart, data: bodyForAction } = await getParsedBody();
  let action = safeGet(bodyForAction, 'action', isMultipart) || '';

  if (!action || action === 'evolution-api') {
    action = pathAction;
  }

  const idemKey = (req.headers.get('idempotency-key')
    || req.headers.get('x-idempotency-key')
    || (isMultipart ? (bodyForAction instanceof FormData ? bodyForAction.get('__idemKey') : undefined) : safeGet(bodyForAction, '__idemKey', false))
    || '').toString().trim() || undefined;

  /**
   * Proxies normalized request to Evolution API via proxyToEvolution helper.
   * Includes idempotency key for request deduplication and CORS headers.
   * Handles Evolution apikey authentication and response normalization.
   */
  const proxy = (path: string, method = 'POST', proxyBody?: unknown) =>
    proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, proxyBody, undefined, idemKey);

  try {
    const { isMultipart, data: body } = await getParsedBody();
    let instance: string | null = null;
    instance = safeGet(body, 'instanceName', isMultipart) || safeGet(body, 'instance', isMultipart) || null;

    // Prevent path traversal: instance names must be safe identifiers only
    const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,128}$/;
    if (instance && !INSTANCE_RE.test(instance)) {
      return new Response(JSON.stringify({ error: 'Invalid instance name' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Guarda anti-"instância fantasma" (incidente wpp2 2026-07-04): as rotas da
    // Evolution usam o NOME da instância; um UUID aqui é quase sempre o
    // instance_id interno enviado por engano pelo cliente. Auto-criar com esse
    // "nome" sequestra o pareamento do telefone para fora do pipeline.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const instanceLooksLikeUuid = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v.trim());

    /**
     * Resolves Evolution API internal UUID to actual instance name.
     * Prevents "phantom instance" bug: when client sends internal instance_id (UUID) instead of name,
     * auto-creating with that name would sequest phone pairing outside pipeline.
     * Queries /instance/fetchInstances, returns null if id not found or name is also a UUID.
     */
    const resolveInstanceNameById = async (id: string): Promise<string | null> => {
      try {
        const r = await fetch(`${evolutionApiUrl}/instance/fetchInstances`, { headers: { apikey: evolutionApiKey }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return null;
        const list = await r.json();
        if (!Array.isArray(list)) return null;
        const found = list.find((i: Record<string, unknown>) => i?.id === id
          || (i?.instance as Record<string, unknown> | undefined)?.instanceId === id) as Record<string, unknown> | undefined;
        const name = (found?.name ?? (found?.instance as Record<string, unknown> | undefined)?.instanceName) as string | undefined;
        return name && !UUID_RE.test(name) ? name : null;
      } catch {
        return null;
      }
    };

    const READ_ONLY_INSTANCE_ACTIONS = new Set([
      'list-instances', 'instance-info', 'status', 'get-settings', 'get-webhook',
    ]);
    if (instance && !READ_ONLY_INSTANCE_ACTIONS.has(action) && await isInstancePaused(supabase, String(instance))) {
      return new Response(JSON.stringify({
        version: EVOLUTION_ENVELOPE_VERSION,
        error: true,
        status: 503,
        code: 'INSTANCE_PAUSED',
        message: `Instância "${instance}" está pausada temporariamente por excesso de falhas de autenticação. Tente novamente em alguns minutos ou retome manualmente no painel.`,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    }

    if (instance && action.startsWith('send-') && SEND_PER_INSTANCE_PER_MIN > 0) {
      const sendRl = checkRateLimit(`evolution-send:${instance}`, SEND_PER_INSTANCE_PER_MIN, 60_000);
      if (!sendRl.allowed) {
        return new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          error: true,
          status: 429,
          code: 'INSTANCE_RATE_LIMIT',
          message: `Instância "${instance}" excedeu o limite de envios (${SEND_PER_INSTANCE_PER_MIN}/min). Tente novamente em alguns segundos.`,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' } });
      }
    }

    if (action === 'create-instance') {
      await authorizeRoles(req, supabaseUrl, (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, ['admin', 'dev']);
      if (instanceLooksLikeUuid(instance)) {
        const resolved = await resolveInstanceNameById(String(instance));
        return new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          error: true,
          status: 422,
          code: 'INSTANCE_NAME_IS_UUID',
          message: `Nome de instância "${instance}" é um UUID — provavelmente o instance_id interno da conexão. ${resolved ? `A instância Evolution correspondente chama-se "${resolved}".` : 'Use o campo instance_name da conexão.'} Criação bloqueada para evitar instância fantasma.`,
          resolvedInstanceName: resolved,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const payload = buildCreateInstancePayload(body, isMultipart);
      return await proxy('/instance/create', 'POST', { instanceName: instance, ...payload });
    }
    if (action === 'list-instances') {
      const listInstanceName = safeGet(body, 'instanceName', isMultipart);
      return await proxy(`/instance/fetchInstances${listInstanceName ? `?instanceName=${encodeURIComponent(listInstanceName)}` : ''}`, 'GET');
    }


    if (action === 'connect') {
      let connectUrl = `${evolutionApiUrl}/instance/connect/${encodeURIComponent(String(instance))}`;

      const doConnect = async () => {
        const response = await fetch(connectUrl, { method: 'GET', headers: { 'apikey': evolutionApiKey }, signal: AbortSignal.timeout(10_000) });
        const text = await response.text();
        const data = text ? safeJsonParse(text) : {};
        return { response, data };
      };

      const buildAuthError = (status: number, details: unknown, where: 'connect' | 'create-instance') =>
        new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          error: true,
          status,
          message: `Falha de autenticação na API Evolution (${where}). Verifique se EVOLUTION_API_URL e EVOLUTION_API_KEY apontam para a mesma conta e se a chave tem permissão para gerenciar instâncias.`,
          code: 'EVOLUTION_AUTH_ERROR',
          details,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      let { response, data } = await doConnect();

      if (response.status === 401 || response.status === 403) {
        recordAuthFailureAndMaybePause(supabase, String(instance), response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status, message: 'connect' });
        return buildAuthError(response.status, data, 'connect');
      }

      const rawMessages = Array.isArray(data?.response?.message)
        ? data.response.message.map((msg: unknown) => JSON.stringify(msg)).join(' ')
        : String(data?.response?.message ?? data?.message ?? '');
      const missingInstance = response.status === 404 && /does not exist|not found/i.test(rawMessages);

      if (missingInstance && instanceLooksLikeUuid(instance)) {
        // O chamador enviou o UUID interno (instance_id) em vez do NOME da
        // instância. Auto-criar aqui geraria uma instância fantasma cujo nome é
        // o UUID (incidente wpp2 2026-07-04: telefone pareado fora do pipeline).
        const resolved = await resolveInstanceNameById(String(instance));
        if (!resolved) {
          return new Response(JSON.stringify({
            version: EVOLUTION_ENVELOPE_VERSION,
            error: true,
            status: 422,
            code: 'INSTANCE_NAME_IS_UUID',
            message: `"${instance}" parece ser o UUID interno da Evolution, não o nome da instância. Use whatsapp_connections.instance_name. Criação automática bloqueada para evitar instância fantasma.`,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        console.warn(`[evolution-api][connect] instanceName era UUID; resolvido para "${resolved}" via fetchInstances (auto-heal, sem create).`);
        instance = resolved;
        connectUrl = `${evolutionApiUrl}/instance/connect/${encodeURIComponent(resolved)}`;
        ({ response, data } = await doConnect());
        if (response.status === 401 || response.status === 403) {
          recordAuthFailureAndMaybePause(supabase, String(instance), response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status, message: 'connect' });
          return buildAuthError(response.status, data, 'connect');
        }
      } else if (missingInstance) {
        const payload = buildCreateInstancePayload(body, isMultipart);
        const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({ instanceName: instance, ...payload }),
        });
        const createData = await createResponse.json();

        if (createResponse.status === 401 || createResponse.status === 403) {
          recordAuthFailureAndMaybePause(supabase, String(instance), createResponse.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: createResponse.status, message: 'create-instance' });
          return buildAuthError(createResponse.status, createData, 'create-instance');
        }

        if (!createResponse.ok) {
          return new Response(JSON.stringify({
            version: EVOLUTION_ENVELOPE_VERSION,
            error: true,
            status: createResponse.status,
            message: 'Falha ao recriar instância na API Evolution.',
            details: createData,
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        ({ response, data } = await doConnect());

        if (response.status === 401 || response.status === 403) {
          recordAuthFailureAndMaybePause(supabase, String(instance), response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status, message: 'connect-after-create' });
          return buildAuthError(response.status, data, 'connect');
        }
      }

      if (response.ok && data?.qrcode?.base64) {
        await supabase
          .from('whatsapp_connections')
          .update({ qr_code: data.qrcode.base64, status: 'qr_pending' })
          .eq('instance_name', instance);
      }

      if (!response.ok) {
        return new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          error: true,
          status: response.status,
          message: 'Falha ao conectar instância na API Evolution.',
          details: data,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'reprocess-failed-webhooks') {
      await authorizeRoles(req, supabaseUrl, (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, ['admin', 'dev']);
      const { data: failed, error } = await supabase
        .from('webhook_reprocess_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('next_retry_at', new Date().toISOString())
        .limit(10);
      
      if (error) return new Response(JSON.stringify({ error: 'Failed to fetch queue' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      
      const results = [];
      for (const item of failed) {
        try {
          await supabase.from('webhook_reprocess_queue').update({ status: 'processing', attempts: item.attempts + 1 }).eq('id', item.id);
          
          // Re-trigger the webhook logic (this is a simplified mock for the task)
          const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify(item.payload),
            signal: AbortSignal.timeout(15_000),
          });
          
          if (resp.ok) {
            await supabase.from('webhook_reprocess_queue').update({ status: 'completed' }).eq('id', item.id);
            results.push({ id: item.id, status: 'completed' });
          } else {
            const nextRetry = new Date(Date.now() + Math.pow(2, item.attempts + 1) * 60000).toISOString();
            await supabase.from('webhook_reprocess_queue').update({ 
              status: item.attempts + 1 >= item.max_attempts ? 'failed' : 'pending',
              next_retry_at: nextRetry,
              last_error: `HTTP ${resp.status}`
            }).eq('id', item.id);
            results.push({ id: item.id, status: 'retry_scheduled', nextRetry });
          }
        } catch (e) {
          console.error('[evolution-api] reprocess error:', e instanceof Error ? e.message : String(e));
          results.push({ id: item.id, status: 'error' });
        }
      }
      return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instance}`, { method: 'GET', headers: { 'apikey': evolutionApiKey }, signal: AbortSignal.timeout(10_000) });
      const text = await response.text();
      const data = text ? safeJsonParse(text) : {};

      if (response.status === 401 || response.status === 403) {
        recordAuthFailureAndMaybePause(supabase, String(instance), response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status, message: 'status' });
        await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('instance_name', instance);
        return new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          status: 'disconnected',
          state: 'close',
          error: true,
          upstream_status: response.status,
          message: 'Evolution API rejeitou a requisição (Unauthorized). Verifique a API key ou recrie a instância.',
          details: data,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // v2 returns { instance: { state: "open", ... } }, v1 might return { state: "open" }
      const rawState = data?.instance?.state || data?.state;
      const status = rawState === 'open' ? 'connected' : 'disconnected';
      
      await supabase.from('whatsapp_connections').update({ status, qr_code: null }).eq('instance_name', instance);
      return new Response(JSON.stringify({ ...data, status, state: rawState }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'instance-info') return await proxy(`/instance/info/${instance}`, 'GET');
    if (action === 'restart-instance') {
      await supabase.from('audit_logs').insert({
        action: 'instance_restart_attempt',
        entity_type: 'whatsapp_connection',
        details: { instance_id: instance, source: 'evolution-api' }
      });
      const response = await proxy(`/instance/restart/${instance}`, 'POST');
      if (response.ok) {
        await supabase.from('audit_logs').insert({
          action: 'instance_restart_success',
          entity_type: 'whatsapp_connection',
          details: { instance_id: instance, source: 'evolution-api' }
        });
      }
      return response;
    }

    if (action === 'disconnect') {
      let upstreamStatus = 0;
      let data: unknown = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 2;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const response = await fetch(`${evolutionApiUrl}/instance/logout/${instance}`, {
            method: 'DELETE',
            headers: { 'apikey': evolutionApiKey },
            signal: AbortSignal.timeout(10_000),
          });
          upstreamStatus = response.status;
          try { 
            data = await response.json(); 
          } catch { 
            data = { raw: await response.text() }; 
          }

          const upstreamMsg = JSON.stringify(data ?? '').toLowerCase();
          const alreadyClosed = upstreamStatus === 500 && upstreamMsg.includes('connection closed');
          const isTransient = upstreamStatus === 503 || upstreamStatus === 504 || upstreamStatus === 502;

          if (response.ok || alreadyClosed) {
            await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('instance_name', instance);
            return new Response(JSON.stringify({ 
              success: true, 
              statusCode: upstreamStatus, 
              alreadyClosed, 
              attempts,
              data 
            }), { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
          }

          if (!isTransient || attempts >= MAX_ATTEMPTS) break;
          // Wait 500ms before retry
          await new Promise(r => setTimeout(r, 500));
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error('[evolution-api] disconnect fetch error:', errorMsg);
          data = { message: 'Upstream request failed' };
          if (attempts >= MAX_ATTEMPTS) break;
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // If we got here, it failed after retries
      return new Response(JSON.stringify({ 
        success: false, 
        statusCode: upstreamStatus, 
        reason: 'Upstream failure after retries',
        attempts,
        data 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    if (action === 'delete-instance') {
      await authorizeRoles(req, supabaseUrl, (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, ['admin', 'dev']);
      return await proxy(`/instance/delete/${instance}`, 'DELETE', body);
    }
    if (action === 'set-presence') {
      const presence = safeGet(body, 'presence', isMultipart);
      return await proxy(`/instance/setPresence/${instance}`, 'POST', { presence });
    }

    if (action === 'set-settings') {
      const settings = buildSettingsPayload(body, isMultipart);
      return await proxy(`/settings/set/${instance}`, 'POST', settings);
    }
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');

    if (action === 'set-webhook') {
      const payload = buildWebhookPayload(body, isMultipart);
      return await proxy(`/webhook/set/${instance}`, 'POST', payload);
    }
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');

    if (action === 'send-text') {
      const sendTextPayload = buildSendTextPayload(body, isMultipart);
      return await proxy(`/message/sendText/${instance}`, 'POST', sendTextPayload);
    }
    if (action === 'send-media') {
      const sendMediaPayload = buildSendMediaPayload(body, isMultipart);
      return await proxy(`/message/sendMedia/${instance}`, 'POST', sendMediaPayload);
    }

    if (action === 'send-audio') {
      if (isMultipart) {
        const formData = body as FormData;
        const evolutionFormData = new FormData();
        evolutionFormData.append('number', formData.get('number') || '');
        if (formData.get('delay')) evolutionFormData.append('delay', formData.get('delay') || '');
        if (formData.get('encoding')) evolutionFormData.append('encoding', formData.get('encoding') || '');
        evolutionFormData.append('ptt', formData.get('isPtt') || 'true');
        const audioFile = formData.get('audio');
        if (audioFile) evolutionFormData.append('audio', audioFile);
        return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', evolutionFormData);
      }
      const jsonBody = ensureBodyIsRecord(body);
      const rawAudio = safeGetAny(jsonBody, 'audio', false) ?? safeGetAny(jsonBody, 'audioUrl', false) ?? safeGetAny(jsonBody, 'mediaUrl', false);
      let audioSource: unknown = typeof rawAudio === 'string'
        ? rawAudio.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawAudio;
      if (typeof audioSource === 'string') audioSource = await resolvePrivateBucketUrl(supabase, audioSource);
      const audioPayload: Record<string, unknown> = { number: safeGet(jsonBody, 'number', false), audio: audioSource };
      const delay = safeGetAny(jsonBody, 'delay', false);
      if (delay !== undefined) audioPayload.delay = delay;
      const encoding = safeGetAny(jsonBody, 'encoding', false);
      if (encoding !== undefined) audioPayload.encoding = encoding;
      const isPtt = safeGetAny(jsonBody, 'isPtt', false);
      if (isPtt !== undefined) audioPayload.ptt = isPtt;
      return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', audioPayload);
    }

    if (action === 'send-ptv') {
      if (isMultipart) {
        const formData = body as FormData;
        const evolutionFormData = new FormData();
        evolutionFormData.append('number', formData.get('number') || '');
        if (formData.get('delay')) evolutionFormData.append('delay', formData.get('delay') || '');
        const videoFile = formData.get('video');
        if (videoFile) evolutionFormData.append('video', videoFile);
        return await proxy(`/message/sendPtv/${instance}`, 'POST', evolutionFormData);
      }
      const jsonBody = ensureBodyIsRecord(body);
      const rawVideo = safeGetAny(jsonBody, 'video', false) ?? safeGetAny(jsonBody, 'videoUrl', false) ?? safeGetAny(jsonBody, 'mediaUrl', false);
      let videoSource: unknown = typeof rawVideo === 'string'
        ? rawVideo.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawVideo;
      if (typeof videoSource === 'string') videoSource = await resolvePrivateBucketUrl(supabase, videoSource, ['whatsapp-media']);
      const ptvPayload: Record<string, unknown> = { number: safeGet(jsonBody, 'number', false), video: videoSource };
      const delay = safeGetAny(jsonBody, 'delay', false);
      if (delay !== undefined) ptvPayload.delay = delay;
      return await proxy(`/message/sendPtv/${instance}`, 'POST', ptvPayload);
    }

    if (action === 'send-location') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendLocation/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        name: safeGet(jsonBody, 'locationName', false) || safeGet(jsonBody, 'name', false),
        address: safeGet(jsonBody, 'locationAddress', false) || safeGet(jsonBody, 'address', false),
        latitude: safeGetAny(jsonBody, 'latitude', false),
        longitude: safeGetAny(jsonBody, 'longitude', false),
      });
    }
    if (action === 'send-contact') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendContact/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        contact: safeGetAny(jsonBody, 'contact', false),
      });
    }
    if (action === 'send-reaction') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendReaction/${instance}`, 'POST', {
        key: safeGetAny(jsonBody, 'key', false),
        reaction: safeGet(jsonBody, 'reaction', false),
      });
    }
    
    if (action === 'send-poll') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendPoll/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        name: safeGet(jsonBody, 'name', false) || safeGet(jsonBody, 'question', false),
        selectableCount: safeGetAny(jsonBody, 'selectableCount', false) || 1,
        values: safeGetAny(jsonBody, 'values', false) || safeGetAny(jsonBody, 'options', false),
      });
    }
    if (action === 'send-sticker') {
      const jsonBody = ensureBodyIsRecord(body);
      let finalStickerUrl = safeGetAny(jsonBody, 'sticker', false) || safeGetAny(jsonBody, 'mediaUrl', false);
      if (typeof finalStickerUrl === 'string') finalStickerUrl = await resolvePrivateBucketUrl(supabase, finalStickerUrl, ['whatsapp-media']);
      return await proxy(`/message/sendSticker/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        sticker: finalStickerUrl,
      });
    }
    
    if (action === 'send-list') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendList/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        title: safeGet(jsonBody, 'title', false),
        description: safeGet(jsonBody, 'description', false),
        footer: safeGet(jsonBody, 'footer', false),
        buttonText: safeGet(jsonBody, 'buttonText', false),
        sections: safeGetAny(jsonBody, 'sections', false),
      });
    }
    if (action === 'send-buttons') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendButtons/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        title: safeGet(jsonBody, 'title', false),
        description: safeGet(jsonBody, 'description', false),
        footer: safeGet(jsonBody, 'footer', false),
        buttons: safeGetAny(jsonBody, 'buttons', false),
      });
    }
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/sendTemplate/${instance}`, 'POST', {
        number: safeGet(jsonBody, 'number', false),
        template: safeGetAny(jsonBody, 'template', false),
      });
    }
    if (action === 'mark-read') {
      const jsonBody = ensureBodyIsRecord(body);
      const readMessages = safeGetAny(jsonBody, 'readMessages', false);
      return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', {
        readMessages: Array.isArray(readMessages) ? readMessages : [safeGetAny(jsonBody, 'key', false)],
      });
    }
    if (action === 'mark-unread') {
      const jsonBody = ensureBodyIsRecord(body);
      const readMessages = safeGetAny(jsonBody, 'readMessages', false);
      return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', {
        readMessages: Array.isArray(readMessages) ? readMessages : [safeGetAny(jsonBody, 'key', false)],
      });
    }


    if (action === 'read-messages') {
      const jsonBody = ensureBodyIsRecord(body);
      const remoteJid = safeGet(jsonBody, 'remoteJid', false) || safeGet(jsonBody, 'chat', false);
      if (!remoteJid) {
        return new Response(JSON.stringify({ ok: false, skipped: true, reason: 'missing remoteJid' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      try {
        const response = await proxy(`/chat/markChatRead/${instance}`, 'POST', { chat: remoteJid });
        if (response.ok) return response;
        const text = await response.text().catch(() => '');
        return new Response(JSON.stringify({ ok: false, skipped: true, upstream_status: response.status, details: text }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, skipped: true, error: 'proxy error' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'archive-chat') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/archiveChat/${instance}`, 'POST', {
        lastMessage: safeGetAny(jsonBody, 'lastMessage', false),
        chat: safeGet(jsonBody, 'chat', false),
        archive: safeGetAny(jsonBody, 'archive', false) ?? true,
      });
    }
    if (action === 'delete-message') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/delete/${instance}`, 'DELETE', {
        id: safeGet(jsonBody, 'id', false),
        remoteJid: safeGet(jsonBody, 'remoteJid', false),
        fromMe: safeGetAny(jsonBody, 'fromMe', false),
      });
    }
    if (action === 'update-message') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/message/update/${instance}`, 'PUT', {
        number: safeGet(jsonBody, 'number', false),
        key: safeGetAny(jsonBody, 'key', false),
        text: safeGet(jsonBody, 'text', false),
      });
    }

    if (action === 'find-chats') {
      const t0 = Date.now();
      const endpoint = `/chat/findChats/${instance}`;
      const jsonBody = ensureBodyIsRecord(body);
      const where = safeGetAny(jsonBody, 'where', false) || {};
      const response = await proxy(endpoint, 'POST', { where });
      const data = await response.json();
      maybeLogFallback({ action: 'find-chats', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeChatList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'find-messages') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/chat/findMessages/${instance}`, 'POST', {
        where: safeGetAny(jsonBody, 'where', false) || {},
        page: safeGetAny(jsonBody, 'page', false),
        offset: safeGetAny(jsonBody, 'offset', false),
      });
    }

    if (action === 'find-status-messages') {
      const jsonBody = ensureBodyIsRecord(body);
      const response = await proxy(`/chat/findMessages/${instance}`, 'POST', {
        where: { key: { remoteJid: 'status@broadcast' } },
        page: safeGetAny(jsonBody, 'page', false) ?? 1,
        offset: safeGetAny(jsonBody, 'offset', false) ?? 200,
      });
      const data = await response.json();
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const records = Array.isArray(data?.messages?.records) ? data.messages.records : [];
      return new Response(JSON.stringify(records), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'find-contacts') {
      const t0 = Date.now();
      const endpoint = `/chat/findContacts/${instance}`;
      const jsonBody = ensureBodyIsRecord(body);
      const where = safeGetAny(jsonBody, 'where', false) || {};
      const response = await proxy(endpoint, 'POST', { where });
      const data = await response.json();
      maybeLogFallback({ action: 'find-contacts', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeContactList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'check-numbers') {
      const jsonBody = ensureBodyIsRecord(body);
      const numbers = safeGetAny(jsonBody, 'numbers', undefined);
      return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', { numbers });
    }
    if (action === 'get-media-base64') {
      const jsonBody = ensureBodyIsRecord(body);
      const message = safeGet(jsonBody, 'message', '');
      const convertToMp4 = safeGet(jsonBody, 'convertToMp4', false);
      return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message, convertToMp4 });
    }
    if (action === 'delete-for-everyone') return await proxy(`/chat/deleteMessageForEveryone/${instance}`, 'DELETE', body);
    if (action === 'edit-message') return await proxy(`/chat/updateMessage/${instance}`, 'PUT', body);

    if (action === 'create-group') {
      const jsonBody = ensureBodyIsRecord(body);
      const subject = safeGet(jsonBody, 'subject', '');
      const description = safeGet(jsonBody, 'description', '');
      const participants = safeGetAny(jsonBody, 'participants', []);
      return await proxy(`/group/create/${instance}`, 'POST', { subject, description, participants });
    }
    if (action === 'list-groups') {
      const jsonBody = ensureBodyIsRecord(body);
      const getParticipants = safeGet(jsonBody, 'getParticipants', 'false');
      return await proxy(`/group/fetchAllGroups/${instance}?getParticipants=${encodeURIComponent(String(getParticipants))}`, 'GET');
    }
    if (action === 'group-info') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      return await proxy(`/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(String(groupJid))}`, 'GET');
    }
    if (action === 'group-participants') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      return await proxy(`/group/participants/${instance}?groupJid=${encodeURIComponent(String(groupJid))}`, 'GET');
    }
    if (action === 'update-group-name') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const subject = safeGet(jsonBody, 'subject', '');
      return await proxy(`/group/updateGroupSubject/${instance}`, 'PUT', { groupJid, subject });
    }
    if (action === 'update-group-description') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const description = safeGet(jsonBody, 'description', '');
      return await proxy(`/group/updateGroupDescription/${instance}`, 'PUT', { groupJid, description });
    }
    if (action === 'update-participants') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const action = safeGet(jsonBody, 'action', '');
      const participants = safeGetAny(jsonBody, 'participants', []);
      return await proxy(`/group/updateParticipant/${instance}`, 'PUT', { groupJid, action, participants });
    }
    if (action === 'update-group-setting') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const groupAction = safeGet(jsonBody, 'action', '');
      return await proxy(`/group/updateSetting/${instance}`, 'PUT', { groupJid, action: groupAction });
    }
    if (action === 'group-invite-code') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      return await proxy(`/group/inviteCode/${instance}?groupJid=${encodeURIComponent(String(groupJid))}`, 'GET');
    }
    if (action === 'revoke-invite-code') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      return await proxy(`/group/revokeInviteCode/${instance}`, 'PUT', { groupJid });
    }
    if (action === 'invite-info') {
      const jsonBody = ensureBodyIsRecord(body);
      const inviteCode = safeGet(jsonBody, 'inviteCode', '');
      return await proxy(`/group/inviteInfo/${instance}?inviteCode=${encodeURIComponent(String(inviteCode))}`, 'GET');
    }
    if (action === 'accept-invite') {
      const jsonBody = ensureBodyIsRecord(body);
      const inviteCode = safeGet(jsonBody, 'inviteCode', '');
      return await proxy(`/group/acceptInviteCode/${instance}`, 'POST', { inviteCode });
    }
    if (action === 'leave-group') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      return await proxy(`/group/leaveGroup/${instance}`, 'DELETE', { groupJid });
    }
    if (action === 'update-group-picture') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const image = safeGet(jsonBody, 'image', '');
      return await proxy(`/group/updateGroupPicture/${instance}`, 'PUT', { groupJid, image });
    }
    if (action === 'toggle-ephemeral') {
      const jsonBody = ensureBodyIsRecord(body);
      const groupJid = safeGet(jsonBody, 'groupJid', '');
      const expiration = safeGetAny(jsonBody, 'expiration', null);
      return await proxy(`/group/toggleEphemeral/${instance}`, 'POST', { groupJid, expiration });
    }

    if (action === 'fetch-profile') {
      const t0 = Date.now();
      const endpoint = `/profile/fetchProfile/${instance}`;
      const response = await proxy(endpoint, 'GET');
      const data = await response.json();
      const primaryMs = Date.now() - t0;

      if (instance && shouldFallbackForProfile(data)) {
        const fbEndpoint = `/instance/fetchInstances?instanceName=${encodeURIComponent(String(instance))}`;
        const fbResponse = await proxy(fbEndpoint, 'GET');
        const fbData = await fbResponse.json();
        const mapped = (fbData && typeof fbData === 'object' && (fbData as Record<string, unknown>).error === true)
          ? null
          : mapFetchInstancesToProfile(fbData, String(instance));
        maybeLogFallback({ action: 'fetch-profile', endpoint, instance: String(instance), status: response.status, data, primary_ms: primaryMs, mode: 'triggered', supabase });
        if (mapped) {
          return new Response(JSON.stringify(mapped), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      maybeLogFallback({ action: 'fetch-profile', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: primaryMs, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeProfile(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'update-profile-name') {
      const jsonBody = ensureBodyIsRecord(body);
      const name = safeGet(jsonBody, 'name', '');
      return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', { name });
    }
    if (action === 'update-profile-status') {
      const jsonBody = ensureBodyIsRecord(body);
      const status = safeGet(jsonBody, 'status', '');
      return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', { status });
    }
    if (action === 'update-profile-picture') {
      const jsonBody = ensureBodyIsRecord(body);
      const picture = safeGet(jsonBody, 'picture', '');
      return await proxy(`/profile/updateProfilePicture/${instance}`, 'PUT', { picture });
    }
    if (action === 'remove-profile-picture') return await proxy(`/profile/removeProfilePicture/${instance}`, 'DELETE');
    if (action === 'fetch-profile-picture') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      return await proxy(`/profile/fetchProfilePicture/${instance}?number=${encodeURIComponent(String(number))}`, 'GET');
    }
    if (action === 'fetch-business-profile') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      return await proxy(`/profile/fetchBusinessProfile/${instance}`, 'POST', { number });
    }
    if (action === 'update-privacy') {
      const jsonBody = ensureBodyIsRecord(body);
      const readreceipts = safeGet(jsonBody, 'readreceipts', '');
      const profile = safeGet(jsonBody, 'profile', '');
      const statusProp = safeGet(jsonBody, 'status', '');
      const online = safeGet(jsonBody, 'online', '');
      const last = safeGet(jsonBody, 'last', '');
      const groupadd = safeGet(jsonBody, 'groupadd', '');
      return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', { readreceipts, profile, status: statusProp, online, last, groupadd });
    }

    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const labelId = safeGet(jsonBody, 'labelId', '');
      const labelAction = safeGet(jsonBody, 'action', '');
      return await proxy(`/label/handleLabel/${instance}`, 'POST', { number, labelId, action: labelAction });
    }

    if (action === 'set-chatwoot') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/chatwoot/set/${instance}`, 'POST', {
        enabled: safeGetAny(jsonBody, 'enabled', false) ?? true,
        accountId: safeGet(jsonBody, 'accountId', false) ?? '',
        token: safeGet(jsonBody, 'token', false) ?? '',
        url: safeGet(jsonBody, 'url', false) ?? '',
        signMsg: safeGetAny(jsonBody, 'signMsg', false) ?? true,
        reopenConversation: safeGetAny(jsonBody, 'reopenConversation', false) ?? true,
        conversationPending: safeGetAny(jsonBody, 'conversationPending', false) ?? false,
        nameInbox: safeGet(jsonBody, 'nameInbox', false) ?? '',
        mergeBrazilContacts: safeGetAny(jsonBody, 'mergeBrazilContacts', false) ?? true,
        importContacts: safeGetAny(jsonBody, 'importContacts', false) ?? true,
        importMessages: safeGetAny(jsonBody, 'importMessages', false) ?? true,
        daysLimitImportMessages: (safeGetAny(jsonBody, 'daysLimitImportMessages', false) as number | undefined) ?? 7,
        signDelimiter: safeGet(jsonBody, 'signDelimiter', false) ?? '',
        autoCreate: safeGetAny(jsonBody, 'autoCreate', false) ?? false,
      });
    }
    if (action === 'get-chatwoot') return await proxy(`/chatwoot/find/${instance}`, 'GET');
    if (action === 'delete-chatwoot') return await proxy(`/chatwoot/delete/${instance}`, 'DELETE');

    if (action === 'set-typebot') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/typebot/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        url: safeGet(jsonBody, 'url', ''),
        typebot: safeGet(jsonBody, 'typebot', ''),
        expire: safeGet(jsonBody, 'expire', 20),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', '#fim'),
        delayMessage: safeGet(jsonBody, 'delayMessage', 1000),
        unknownMessage: safeGet(jsonBody, 'unknownMessage', ''),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        keepOpen: safeGet(jsonBody, 'keepOpen', false),
        debounceTime: safeGet(jsonBody, 'debounceTime', 10),
        triggerType: safeGet(jsonBody, 'triggerType', ''),
        triggerOperator: safeGet(jsonBody, 'triggerOperator', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
      });
    }
    if (action === 'get-typebot') return await proxy(`/typebot/find/${instance}`, 'GET');
    if (action === 'delete-typebot') return await proxy(`/typebot/delete/${instance}`, 'DELETE');
    if (action === 'typebot-sessions') {
      const jsonBody = ensureBodyIsRecord(body);
      const typebotId = safeGet(jsonBody, 'typebotId', '');
      const url = typebotId ? `?typebotId=${encodeURIComponent(String(typebotId))}` : '';
      return await proxy(`/typebot/fetchSessions/${instance}${url}`, 'GET');
    }
    if (action === 'typebot-change-status') {
      const jsonBody = ensureBodyIsRecord(body);
      const remoteJid = safeGet(jsonBody, 'remoteJid', '');
      const status = safeGet(jsonBody, 'status', '');
      return await proxy(`/typebot/changeStatus/${instance}`, 'POST', { remoteJid, status });
    }
    if (action === 'start-typebot') {
      const jsonBody = ensureBodyIsRecord(body);
      const remoteJid = safeGet(jsonBody, 'remoteJid', '');
      const url = safeGet(jsonBody, 'url', '');
      const typebot = safeGet(jsonBody, 'typebot', '');
      const variables = safeGetAny(jsonBody, 'variables', {});
      return await proxy(`/typebot/startTypebot/${instance}`, 'POST', { remoteJid, url, typebot, variables });
    }

    if (action === 'set-openai') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/openai/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        openAiApiKey: safeGet(jsonBody, 'openAiApiKey', ''),
        expire: safeGet(jsonBody, 'expire', 30),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', '#sair'),
        delayMessage: safeGet(jsonBody, 'delayMessage', 1000),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        speechToText: safeGet(jsonBody, 'speechToText', false),
        botType: safeGet(jsonBody, 'botType', 'chatCompletion'),
        assistantId: safeGet(jsonBody, 'assistantId', ''),
        model: safeGet(jsonBody, 'model', 'gpt-4o'),
        systemMessage: safeGet(jsonBody, 'systemMessage', ''),
        maxTokens: safeGet(jsonBody, 'maxTokens', 500),
        temperature: safeGet(jsonBody, 'temperature', 0.7),
        triggerType: safeGet(jsonBody, 'triggerType', 'all'),
        triggerOperator: safeGet(jsonBody, 'triggerOperator', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
        functionUrl: safeGet(jsonBody, 'functionUrl', ''),
      });
    }
    if (action === 'get-openai') return await proxy(`/openai/find/${instance}`, 'GET');
    if (action === 'delete-openai') return await proxy(`/openai/delete/${instance}`, 'DELETE');

    if (action === 'set-dify') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/dify/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        apiUrl: safeGet(jsonBody, 'apiUrl', ''),
        apiKey: safeGet(jsonBody, 'apiKey', ''),
        botType: safeGet(jsonBody, 'botType', 'chatBot'),
        expire: safeGet(jsonBody, 'expire', 30),
        triggerType: safeGet(jsonBody, 'triggerType', 'all'),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', ''),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        speechToText: safeGet(jsonBody, 'speechToText', false),
      });
    }
    if (action === 'get-dify') return await proxy(`/dify/find/${instance}`, 'GET');
    if (action === 'delete-dify') return await proxy(`/dify/delete/${instance}`, 'DELETE');

    if (action === 'set-flowise') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/flowise/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        apiUrl: safeGet(jsonBody, 'apiUrl', ''),
        apiKey: safeGet(jsonBody, 'apiKey', ''),
        chatflowId: safeGet(jsonBody, 'chatflowId', ''),
        expire: safeGet(jsonBody, 'expire', 30),
        triggerType: safeGet(jsonBody, 'triggerType', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
      });
    }
    if (action === 'get-flowise') return await proxy(`/flowise/find/${instance}`, 'GET');
    if (action === 'delete-flowise') return await proxy(`/flowise/delete/${instance}`, 'DELETE');

    if (action === 'set-evolution-bot') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/evolutionBot/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        expire: safeGet(jsonBody, 'expire', 10),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', '#sair'),
        delayMessage: safeGet(jsonBody, 'delayMessage', 800),
        triggerType: safeGet(jsonBody, 'triggerType', ''),
        triggerOperator: safeGet(jsonBody, 'triggerOperator', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
        unknownMessage: safeGet(jsonBody, 'unknownMessage', ''),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        apiUrl: safeGet(jsonBody, 'apiUrl', ''),
        apiKey: safeGet(jsonBody, 'apiKey', ''),
      });
    }
    if (action === 'get-evolution-bot') return await proxy(`/evolutionBot/find/${instance}`, 'GET');
    if (action === 'delete-evolution-bot') return await proxy(`/evolutionBot/delete/${instance}`, 'DELETE');

    if (action === 'set-rabbitmq') {
      const jsonBody = ensureBodyIsRecord(body);
      const enabled = safeGet(jsonBody, 'enabled', true);
      const events = safeGetAny(jsonBody, 'events', []);
      return await proxy(`/rabbitmq/set/${instance}`, 'POST', { enabled, events });
    }
    if (action === 'get-rabbitmq') return await proxy(`/rabbitmq/find/${instance}`, 'GET');
    if (action === 'set-sqs') {
      const jsonBody = ensureBodyIsRecord(body);
      const enabled = safeGet(jsonBody, 'enabled', true);
      const events = safeGetAny(jsonBody, 'events', []);
      return await proxy(`/sqs/set/${instance}`, 'POST', { enabled, events });
    }
    if (action === 'get-sqs') return await proxy(`/sqs/find/${instance}`, 'GET');
    if (action === 'create-template') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/template/create/${instance}`, 'POST', jsonBody);
    }
    if (action === 'find-templates') return await proxy(`/template/find/${instance}`, 'GET');
    if (action === 'delete-template') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/template/delete/${instance}`, 'DELETE', jsonBody);
    }
    if (action === 'update-block-status') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const status = safeGet(jsonBody, 'status', '');
      return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', { number, status });
    }
    if (action === 'offer-call') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const isVideo = safeGet(jsonBody, 'isVideo', false);
      const callDuration = safeGet(jsonBody, 'callDuration', 5);
      return await proxy(`/call/offerCall/${instance}`, 'POST', { number, isVideo, callDuration });
    }
    if (action === 'send-chat-presence') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const presence = safeGet(jsonBody, 'presence', '');
      const delay = safeGet(jsonBody, 'delay', 1200);
      return await proxy(`/chat/sendPresence/${instance}`, 'POST', { number, presence, delay });
    }

    if (action === 'get-catalog') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const limit = safeGet(jsonBody, 'limit', '');
      const cursor = safeGet(jsonBody, 'cursor', '');
      return await proxy(`/business/getCatalog/${instance}`, 'POST', { number, limit, cursor });
    }
    if (action === 'get-collections') {
      const jsonBody = ensureBodyIsRecord(body);
      const number = safeGet(jsonBody, 'number', '');
      const limit = safeGet(jsonBody, 'limit', '');
      const cursor = safeGet(jsonBody, 'cursor', '');
      return await proxy(`/business/getCollections/${instance}`, 'POST', { number, limit, cursor });
    }
    if (action === 'set-proxy') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/proxy/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        host: safeGet(jsonBody, 'host', ''),
        port: safeGet(jsonBody, 'port', ''),
        protocol: safeGet(jsonBody, 'protocol', ''),
        username: safeGet(jsonBody, 'username', ''),
        password: safeGet(jsonBody, 'password', ''),
      });
    }
    if (action === 'get-proxy') return await proxy(`/proxy/find/${instance}`, 'GET');
    if (action === 'set-evoai') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/evoai/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        apiUrl: safeGet(jsonBody, 'apiUrl', ''),
        apiKey: safeGet(jsonBody, 'apiKey', ''),
        agentId: safeGet(jsonBody, 'agentId', ''),
        expire: safeGet(jsonBody, 'expire', 30),
        triggerType: safeGet(jsonBody, 'triggerType', 'all'),
        triggerOperator: safeGet(jsonBody, 'triggerOperator', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', ''),
        delayMessage: safeGet(jsonBody, 'delayMessage', 1000),
        unknownMessage: safeGet(jsonBody, 'unknownMessage', ''),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        keepOpen: safeGet(jsonBody, 'keepOpen', false),
        debounceTime: safeGet(jsonBody, 'debounceTime', 10),
        speechToText: safeGet(jsonBody, 'speechToText', false),
      });
    }
    if (action === 'get-evoai') return await proxy(`/evoai/find/${instance}`, 'GET');
    if (action === 'delete-evoai') return await proxy(`/evoai/delete/${instance}`, 'DELETE');
    if (action === 'set-n8n') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/n8n/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        webhookUrl: safeGet(jsonBody, 'webhookUrl', ''),
        expire: safeGet(jsonBody, 'expire', 30),
        triggerType: safeGet(jsonBody, 'triggerType', 'all'),
        triggerOperator: safeGet(jsonBody, 'triggerOperator', ''),
        triggerValue: safeGet(jsonBody, 'triggerValue', ''),
        keywordFinish: safeGet(jsonBody, 'keywordFinish', ''),
        delayMessage: safeGet(jsonBody, 'delayMessage', 1000),
        unknownMessage: safeGet(jsonBody, 'unknownMessage', ''),
        listeningFromMe: safeGet(jsonBody, 'listeningFromMe', false),
        stopBotFromMe: safeGet(jsonBody, 'stopBotFromMe', true),
        keepOpen: safeGet(jsonBody, 'keepOpen', false),
        debounceTime: safeGet(jsonBody, 'debounceTime', 10),
      });
    }
    if (action === 'get-n8n') return await proxy(`/n8n/find/${instance}`, 'GET');
    if (action === 'delete-n8n') return await proxy(`/n8n/delete/${instance}`, 'DELETE');
    if (action === 'set-kafka') {
      const jsonBody = ensureBodyIsRecord(body);
      const enabled = safeGet(jsonBody, 'enabled', true);
      const events = safeGetAny(jsonBody, 'events', []);
      return await proxy(`/kafka/set/${instance}`, 'POST', { enabled, events });
    }
    if (action === 'get-kafka') return await proxy(`/kafka/find/${instance}`, 'GET');
    if (action === 'set-nats') {
      const jsonBody = ensureBodyIsRecord(body);
      const enabled = safeGet(jsonBody, 'enabled', true);
      const events = safeGetAny(jsonBody, 'events', []);
      return await proxy(`/nats/set/${instance}`, 'POST', { enabled, events });
    }
    if (action === 'get-nats') return await proxy(`/nats/find/${instance}`, 'GET');
    if (action === 'set-pusher') {
      const jsonBody = ensureBodyIsRecord(body);
      return await proxy(`/pusher/set/${instance}`, 'POST', {
        enabled: safeGet(jsonBody, 'enabled', true),
        appId: safeGet(jsonBody, 'appId', ''),
        key: safeGet(jsonBody, 'key', ''),
        secret: safeGet(jsonBody, 'secret', ''),
        cluster: safeGet(jsonBody, 'cluster', ''),
        events: safeGetAny(jsonBody, 'events', []),
      });
    }
    if (action === 'get-pusher') return await proxy(`/pusher/find/${instance}`, 'GET');

    return new Response(JSON.stringify({ error: 'Unknown action', action }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errWithStatus = error as { status?: number } | null;
    if (errWithStatus?.status) return errorResponse('Internal server error', errWithStatus.status, req);
    const log = new Logger('evolution-api', req);
    log.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
