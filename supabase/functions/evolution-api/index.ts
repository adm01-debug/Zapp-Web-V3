import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors, authorizeRoles, errorResponse } from "../_shared/validation.ts";
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";
import { initSentry, captureException } from "../_shared/sentry.ts";
import { EVOLUTION_ENVELOPE_VERSION, proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { normalizeChatList, normalizeContactList, normalizeProfile } from "../_shared/evolution-response-normalizers.ts";
import { maybeLogFallback } from "../_shared/evolution-fallback-telemetry.ts";
import { mapFetchInstancesToProfile, shouldFallbackForProfile } from "../_shared/evolution-profile-fallback.ts";
import { isInstancePaused, recordAuthFailureAndMaybePause } from "../_shared/instance-pause.ts";
import { WEBHOOK_EVENTS } from "../_shared/evolution-sync-actions.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/** FIX (2026-07-27): read-messages action now uses markMessageAsRead instead of
 * deprecated/removed markChatRead (which returned 404 on Evolution API v2.3.7).
 * ALL other actions are unchanged from the previous version.
 */

Deno.serve(async (req) => {
  initSentry('evolution-api');
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req);
  const ip = getClientIP(req);
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const pathAction = pathParts[pathParts.length - 1];
  const READ_ONLY_POLL_ACTIONS = new Set(['status', 'list-instances', 'instance-info', 'find-status-messages']);
  const isPollAction = READ_ONLY_POLL_ACTIONS.has(pathAction);
  const rl = isPollAction
    ? checkRateLimit(`evolution-poll:${ip}`, 600, 60_000)
    : checkRateLimit(`evolution:${ip}`, 120, 60_000);
  if (!rl.allowed) return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
  const rawEvolutionApiUrl = (Deno.env.get('EVOLUTION_API_URL') || '').trim();
  const rawEvolutionApiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  const isPlaceholder = (v: string) => !v || /PLACEHOLDER|REPLACE_ME|YOUR_|CHANGE_ME/i.test(v);
  const isValidUrl = (v: string) => { try { new URL(v); return true; } catch { return false; } };
  const evolutionApiUrl = rawEvolutionApiUrl.replace(/\/+$/, '');
  const evolutionApiKey = rawEvolutionApiKey;
  if (isPlaceholder(evolutionApiUrl) || isPlaceholder(evolutionApiKey) || !isValidUrl(evolutionApiUrl)) return new Response(JSON.stringify({ error: 'Evolution API not configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const supabase = createZappAdminClient();
  const supabaseUrl = ((Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? '').replace(/\/+$/, '');
  const supabaseServiceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '';
  const { data: authData, error: authError } = await createZappClient(req).auth.getUser();
  let authedUser: { id: string; email: string | undefined } | null = null;
  if (!authError && authData?.user) authedUser = { id: authData.user.id, email: authData.user.email };
  if (!authedUser) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  const SEND_PER_INSTANCE_PER_MIN = Number(Deno.env.get('EVOLUTION_SEND_RATE_PER_INSTANCE') ?? '60');
  let _bodyCache: Record<string, unknown> | null = null;
  let _formDataCache: Record<string, unknown> | null = null;
  const safeJsonParse = (text: string): Record<string, unknown> => {
    try { const p = JSON.parse(text); return (typeof p === 'object' && p !== null && !Array.isArray(p)) ? p : { raw: text }; } catch { return { raw: text }; }
  };
  const getParsedBody = async () => {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('multipart/form-data')) {
      if (_formDataCache) return { isMultipart: true, data: _formDataCache };
      try {
        const fd = await req.formData();
        const raw = Object.fromEntries(fd.entries()); // preserva File (multipart)
        // Contrato evolution-api@v1 (permissivo — roteado por action no handler):
        // gate no ramo multipart, após auth.
        const parsed = parseOrReject('evolution-api', CONTRACT_SCHEMAS['evolution-api'], req, raw, { extraHeaders: corsHeaders });
        if (!parsed.ok) return parsed.response;
        _formDataCache = parsed.data as Record<string, any>;
        return { isMultipart: true, data: _formDataCache };
      } catch { return { isMultipart: false, data: {} }; }
    }
    if (_bodyCache !== null) return { isMultipart: false, data: _bodyCache };
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    if (typeof _bodyCache !== 'object' || _bodyCache === null || Array.isArray(_bodyCache)) _bodyCache = {};
    // Contrato evolution-api@v1 — gate no ramo JSON, após auth.
    const parsed = parseOrReject('evolution-api', CONTRACT_SCHEMAS['evolution-api'], req, _bodyCache!, { extraHeaders: corsHeaders });
    if (!parsed.ok) return parsed.response;
    return { isMultipart: false, data: parsed.data as Record<string, any> };
  };
  const safeGet = (data: unknown, key: string, isFormData: boolean): string | undefined => {
    if (isFormData && data instanceof FormData) { const v = data.get(key); return typeof v === 'string' ? v : undefined; }
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) { const v = (data as Record<string, unknown>)[key]; return typeof v === 'string' ? v : undefined; }
    return undefined;
  };
  const safeGetAny = (data: unknown, key: string, isFormData: boolean): unknown => {
    if (isFormData && data instanceof FormData) return data.get(key);
    if (typeof data === 'object' && data !== null && !Array.isArray(data)) return (data as Record<string, unknown>)[key];
    return undefined;
  };
  const ensureBodyIsRecord = (d: unknown): Record<string, unknown> => (typeof d === 'object' && d !== null && !Array.isArray(d)) ? d as Record<string, unknown> : {};
  const bodyResult = await getParsedBody();
  if (bodyResult instanceof Response) return bodyResult;
  const { isMultipart, data: bodyForAction } = bodyResult;
  let action = safeGet(bodyForAction, 'action', isMultipart) || '';
  if (!action || action === 'evolution-api') action = pathAction;
  const idemKey = (req.headers.get('idempotency-key') || req.headers.get('x-idempotency-key') || '').trim() || undefined;
  const proxy = (path: string, method = 'POST', proxyBody?: unknown) => proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, proxyBody, undefined, idemKey);
  try {
    const body = bodyForAction;
    let instance: string | null = safeGet(body, 'instanceName', isMultipart) || safeGet(body, 'instance', isMultipart) || null;
    const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,128}$/;
    if (instance && !INSTANCE_RE.test(instance)) return new Response(JSON.stringify({ error: 'Invalid instance name' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const instanceLooksLikeUuid = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v.trim());
    const READE_ONLY_INSTANCE_ACTIONS = new Set(['list-instances', 'instance-info', 'status', 'get-settings', 'get-webhook', 'find-status-messages']);
    if (instance && !READE_ONLY_INSTANCE_ACTIONS.has(action) && await isInstancePaused(supabase, String(instance))) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 503, code: 'INSTANCE_PAUSED', message: `Inst\u00e2ncia "${instance}" est\u00e1 pausada.` }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    if (instance && action.startsWith('send-') && SEND_PER_INSTANCE_PER_MIN > 0) {
      const sendRl = checkRateLimit(`evolution-send:${instance}`, SEND_PER_INSTANCE_PER_MIN, 60_000);
      if (!sendRl.allowed) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 429, code: 'INSTANCE_RATE_LIMIT' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' } });
    }
    if (action === 'read-messages') {
      const jsonBody = ensureBodyIsRecord(body);
      const remoteJid = safeGet(jsonBody, 'remoteJid', false) || safeGet(jsonBody, 'chat', false);
      if (!remoteJid) return new Response(JSON.stringify({ ok: false, skipped: true, reason: 'missing remoteJid' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      try {
        const response = await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: [{ remoteJid }] });
        if (response.ok) return response;
        const text = await response.text().catch(() => '');
        return new Response(JSON.stringify({ ok: false, skipped: true, upstream_status: response.status, details: text }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch { return new Response(JSON.stringify({ ok: false, skipped: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    }
    if (action === 'mark-read') { const jb = ensureBodyIsRecord(body); const rm = safeGetAny(jb, 'readMessages', false); return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: Array.isArray(rm) ? rm : [safeGetAny(jb, 'key', false)] }); }
    if (action === 'mark-unread') { const jb = ensureBodyIsRecord(body); const rm = safeGetAny(jb, 'readMessages', false); return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: Array.isArray(rm) ? rm : [safeGetAny(jb, 'key', false)] }); }
    if (action === 'send-text') return await proxy(`/message/sendText/${instance}`, 'POST', body);
    if (action === 'send-media') return await proxy(`/message/sendMedia/${instance}`, 'POST', body);
    if (action === 'send-audio') return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', body);
    if (action === 'send-ptv') return await proxy(`/message/sendPtv/${instance}`, 'POST', body);
    if (action === 'send-location') return await proxy(`/message/sendLocation/${instance}`, 'POST', body);
    if (action === 'send-contact') return await proxy(`/message/sendContact/${instance}`, 'POST', body);
    if (action === 'send-reaction') return await proxy(`/message/sendReaction/${instance}`, 'POST', body);
    if (action === 'send-poll') return await proxy(`/message/sendPoll/${instance}`, 'POST', body);
    if (action === 'send-sticker') {
      const jb = ensureBodyIsRecord(body);
      const rawStickerUrl = safeGet(body, 'sticker', isMultipart);
      const resolvedStickerUrl = rawStickerUrl ? await resolvePrivateBucketUrl(supabase, rawStickerUrl) : undefined;
      return await proxy(`/message/sendSticker/${instance}`, 'POST', resolvedStickerUrl ? { ...jb, sticker: resolvedStickerUrl } : jb);
    }
    if (action === 'send-list') return await proxy(`/message/sendList/${instance}`, 'POST', body);
    if (action === 'send-buttons') return await proxy(`/message/sendButtons/${instance}`, 'POST', body);
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') return await proxy(`/message/sendTemplate/${instance}`, 'POST', body);
    if (action === 'find-chats') return await proxy(`/chat/findChats/${instance}`, 'POST', body);
    if (action === 'find-messages') return await proxy(`/chat/findMessages/${instance}`, 'POST', body);
    if (action === 'find-contacts') return await proxy(`/chat/findContacts/${instance}`, 'POST', body);
    if (action === 'check-numbers') return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', body);
    // ── Status/Stories (F4-08): find-status-messages + send-chat-presence (P1-09 reconciliação)
    if (action === 'find-status-messages') {
      const jb = ensureBodyIsRecord(body);
      const page = safeGetAny(jb, 'page', false);
      const offset = safeGetAny(jb, 'offset', false);
      const qp = new URLSearchParams();
      if (page !== undefined && page !== null && page !== '') qp.set('page', String(page));
      if (offset !== undefined && offset !== null && offset !== '') qp.set('offset', String(offset));
      const qs = qp.toString();
      return await proxy(`/chat/findStatus/${instance}${qs ? `?${qs}` : ''}`, 'GET');
    }
    if (action === 'send-chat-presence') {
      const jb = ensureBodyIsRecord(body);
      const number = (safeGet(jb, 'number', isMultipart) || '').trim();
      const presence = (safeGet(jb, 'presence', isMultipart) || '').trim();
      const PRESENCE_ALLOWED = new Set(['composing', 'recording', 'paused', 'available', 'unavailable']);
      if (!number || !/^\d{10,15}$/.test(number.replace(/[^0-9]/g, ''))) {
        return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'INVALID_NUMBER', message: 'number é obrigatório (E.164, dígitos 10-15)' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!PRESENCE_ALLOWED.has(presence)) {
        return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'INVALID_PRESENCE', message: `presence deve ser um de: ${[...PRESENCE_ALLOWED].join(', ')}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { instanceName: _instanceName, ...presenceBody } = jb;
      return await proxy(`/chat/sendPresence/${instance}`, 'POST', presenceBody);
    }
    if (action === 'status') return await proxy(`/instance/connectionState/${instance}`, 'GET');
    if (action === 'list-instances') return await proxy(`/instance/fetchInstances`, 'GET');
    if (action === 'instance-info') return await proxy(`/instance/info/${instance}`, 'GET');
    if (action === 'fetch-profile') return await proxy(`/profile/fetchProfile/${instance}`, 'GET');
    if (action === 'update-profile-name') return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', body);
    if (action === 'update-profile-status') return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', body);
    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') return await proxy(`/label/handleLabel/${instance}`, 'POST', body);
    // CONTATOS-16: rota documentada no evolution-api-mapping.md (update-block-status →
    // POST /chat/updateBlockStatus/{instance}) mas ausente do router — consumida por
    // useEvolutionApiManagement.updateBlockStatus → BlockContactDialog.
    if (action === 'update-block-status') return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', body);
    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', body);
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');
    if (action === 'set-webhook') return await proxy(`/webhook/set/${instance}`, 'POST', body);
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');
    if (action === 'delete-message') return await proxy(`/message/delete/${instance}`, 'DELETE', body);
    if (action === 'archive-chat') return await proxy(`/message/archiveChat/${instance}`, 'POST', body);
    if (action === 'get-media-base64') {
      const jb = ensureBodyIsRecord(body);
      const message = safeGetAny(jb, 'message', false) ?? {};
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, message: 'instanceName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message });
    }
    // ── Instance lifecycle (F6-02 / F6-01) ────────────────────────────────────
    // F6-02: criação explícita de instância ANTES do INSERT em whatsapp_connections.
    if (action === 'create-instance') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return await proxy(`/instance/create`, 'POST', body);
    }
    // F6-01: pairing code via `GET /instance/connect/<instance>?number=<phone>`.
    if (action === 'pairing-code') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const rawNumber = String(safeGetAny(body, 'number', isMultipart) ?? '').replace(/\D/g, '');
      if (!rawNumber) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'MISSING_NUMBER', message: 'number (telefone) é obrigatório para pairing code' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return await proxy(`/instance/connect/${instance}?number=${rawNumber}`, 'GET');
    }
    // QR Code: GET /instance/connect/<instance>, com auto-create em 404 "does not exist"
    // (comportamento do prod-snapshot) e envelope estruturado para 401/403.
    if (action === 'connect') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (instanceLooksLikeUuid(instance)) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: 400, code: 'INSTANCE_NAME_IS_UUID', message: 'Connect deve usar o NOME da instância, não o UUID (evita instância fantasma).' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const buildAuthError = (upstreamStatus: number, actionName: string) => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: upstreamStatus, code: 'EVOLUTION_AUTH_ERROR', action: actionName, message: `Evolution API rejeitou a autenticação (${actionName}). Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.` }), { status: upstreamStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const doConnect = async () => {
        const response = await fetch(`${evolutionApiUrl}/instance/connect/${instance}`, { method: 'GET', headers: { apikey: evolutionApiKey } });
        const data = await response.json().catch(() => null);
        return { response, data };
      };
      let { response, data } = await doConnect();
      if (response.status === 401 || response.status === 403) {
        void recordAuthFailureAndMaybePause(supabase, instance, response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status });
        return buildAuthError(response.status, 'connect');
      }
      if (response.status === 404 && /does not exist|not found/i.test(JSON.stringify(data ?? {}))) {
        const createRes = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { apikey: evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ instanceName: instance, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
        });
        if (createRes.status === 401 || createRes.status === 403) return buildAuthError(createRes.status, 'create-instance');
        if (!createRes.ok) {
          const createData = await createRes.json().catch(() => ({}));
          return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: createRes.status, message: (createData as { message?: string }).message || 'Falha ao criar a instância na Evolution API' }), { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        ({ response, data } = await doConnect());
        if (response.status === 401 || response.status === 403) return buildAuthError(response.status, 'connect');
        if (!response.ok) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, error: true, status: response.status, message: 'Falha ao conectar após criar a instância' }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Unknown action', action }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const log = new Logger('evolution-api', req);
    log.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
