import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors, authorizeRoles, errorEnvelope } from "../_shared/validation.ts";
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";
import { initSentry, captureException } from "../_shared/sentry.ts";
import { EVOLUTION_ENVELOPE_VERSION, proxyToEvolution, resolvePrivateBucketUrl, type ProxyToEvolutionOptions } from "../_shared/evolution-api-proxy.ts";
import { getBaseUrl } from "../_shared/providers/evolution/index.ts";
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
  if (!rl.allowed) return errorEnvelope('rate_limit_exceeded', 'Rate limit exceeded', 429, req, undefined, { 'Retry-After': '60' });
  let evolutionApiUrl: string;
  try { evolutionApiUrl = getBaseUrl(); } catch { return errorEnvelope('evolution_api_not_configured', 'Evolution API not configured', 503, req); }
  const evolutionApiKey = (Deno.env.get('EVOLUTION_API_KEY') || '').trim();
  const isPlaceholder = (v: string) => !v || /PLACEHOLDER|REPLACE_ME|YOUR_|CHANGE_ME/i.test(v);
  if (isPlaceholder(evolutionApiKey)) return errorEnvelope('evolution_api_not_configured', 'Evolution API not configured', 503, req);
  const supabase = createZappAdminClient();
  const supabaseUrl = ((Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? '').replace(/\/+$/, '');
  const supabaseServiceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '';
  const { data: authData, error: authError } = await createZappClient(req).auth.getUser();
  let authedUser: { id: string; email: string | undefined } | null = null;
  if (!authError && authData?.user) authedUser = { id: authData.user.id, email: authData.user.email };
  if (!authedUser) return errorEnvelope('unauthorized', 'Unauthorized', 401, req);
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
        if (parsed.ok === false) return parsed.response;
        _formDataCache = parsed.data as Record<string, any>;
        return { isMultipart: true, data: _formDataCache };
      } catch { return { isMultipart: false, data: {} }; }
    }
    if (_bodyCache !== null) return { isMultipart: false, data: _bodyCache };
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    if (typeof _bodyCache !== 'object' || _bodyCache === null || Array.isArray(_bodyCache)) _bodyCache = {};
    // Contrato evolution-api@v1 — gate no ramo JSON, após auth.
    const parsed = parseOrReject('evolution-api', CONTRACT_SCHEMAS['evolution-api'], req, _bodyCache!, { extraHeaders: corsHeaders });
    if (parsed.ok === false) return parsed.response;
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
  const proxy = (path: string, method = 'POST', proxyBody?: unknown, proxyOpts?: ProxyToEvolutionOptions) => proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, proxyBody, undefined, idemKey, proxyOpts);
  try {
    const body = bodyForAction;
    let instance: string | null = safeGet(body, 'instanceName', isMultipart) || safeGet(body, 'instance', isMultipart) || null;
    const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,128}$/;
    // Bloco 2 (etapa 22, 2026-08-21): shape avulso trocado pelo envelope de
    // domínio canônico do arquivo (mesmo padrão usado nos outros ~20 422/403/
    // 429/503 abaixo) — era o único 422 do evolution-api fora do formato
    // {version,contract,error,status,code,message,details}.
    if (instance && !INSTANCE_RE.test(instance)) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'INVALID_INSTANCE_NAME', message: 'Nome de instância inválido.', details: [{ path: 'instance', message: 'Nome de instância inválido.' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const instanceLooksLikeUuid = (v: unknown): boolean => typeof v === 'string' && UUID_RE.test(v.trim());
    const READE_ONLY_INSTANCE_ACTIONS = new Set(['list-instances', 'instance-info', 'status', 'get-settings', 'get-webhook', 'find-status-messages']);
    if (instance && !READE_ONLY_INSTANCE_ACTIONS.has(action) && await isInstancePaused(supabase, String(instance))) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 503, code: 'INSTANCE_PAUSED', message: `Inst\u00e2ncia "${instance}" est\u00e1 pausada.`, details: [{ path: 'instance', message: `Instância "${instance}" está pausada.` }] }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } });
    if (instance && action.startsWith('send-') && SEND_PER_INSTANCE_PER_MIN > 0) {
      const sendRl = checkRateLimit(`evolution-send:${instance}`, SEND_PER_INSTANCE_PER_MIN, 60_000);
      if (!sendRl.allowed) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 429, code: 'INSTANCE_RATE_LIMIT', details: [{ path: 'instance', message: 'Limite de envios por instância atingido (minuto). Tente novamente em instantes.' }] }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '30' } });
    }
    // [R1-EXT/F1] Fail-closed compartilhado: prova de acesso à conversa antes do
    // proxy (padrão #1240 — lookup evolution_contacts + RPCs de visibilidade).
    const conversationForbidden = (actionCode: string) => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 403, code: actionCode, message: 'Você não tem acesso a esta conversa.', details: [{ path: 'remoteJid', message: 'Acesso negado: conversa não visível ao usuário' }] }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const assertConversationAccess = async (remoteJid: unknown, actionCode: string): Promise<Response | null> => {
      if (typeof remoteJid !== 'string' || !remoteJid.trim()) return conversationForbidden(actionCode);
      const { data: contato } = await supabase
        .from('evolution_contacts')
        .select('id')
        .eq('remote_jid', remoteJid)
        .eq('instance_name', instance)
        .eq('deleted_at', null)
        .maybeSingle();
      if (!contato) return conversationForbidden(actionCode);
      const [{ data: visivel }, { data: naFila }, { data: isAdmin }] = await Promise.all([
        supabase.rpc('is_contact_visible_to_user', { _contact_id: contato.id, _user_id: authedUser.id }),
        supabase.rpc('is_queue_member_of_contact', { _contact_id: contato.id, _user_id: authedUser.id }),
        supabase.rpc('is_admin_or_supervisor', { _user_id: authedUser.id }),
      ]);
      if (!(visivel || naFila || isAdmin)) return conversationForbidden(actionCode);
      return null;
    };
    // [R1-EXT/F2] Gate de ALVO com exceção de bootstrap (Regra A/E): contato
    // EXISTE no banco e não é visível/fila/admin → 403; contato INEXISTENTE →
    // permite (número novo/não sincronizado — não bloquear envio a número novo).
    const targetForbidden = (actionCode: string) => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 403, code: actionCode, message: 'Você não tem acesso a esta conversa.', details: [{ path: 'target', message: 'Acesso negado: conversa não visível ao usuário' }] }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const resolveContactId = async (target: string): Promise<string | null> => {
      const isJid = target.includes('@');
      let q = supabase.from('evolution_contacts').select('id').eq('instance_name', instance).eq('deleted_at', null);
      if (isJid) q = q.eq('remote_jid', target);
      else q = q.eq('phone_number', target.replace(/[^0-9]/g, ''));
      const { data } = await q.maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    };
    const assertTargetAccess = async (target: unknown, actionCode: string): Promise<Response | null> => {
      if (typeof target !== 'string' || !target.trim()) return null;
      const contactId = await resolveContactId(target);
      if (!contactId) return null; // bootstrap: contato não sincronizado → permite
      const [{ data: visivel }, { data: naFila }, { data: isAdmin }] = await Promise.all([
        supabase.rpc('is_contact_visible_to_user', { _contact_id: contactId, _user_id: authedUser.id }),
        supabase.rpc('is_queue_member_of_contact', { _contact_id: contactId, _user_id: authedUser.id }),
        supabase.rpc('is_admin_or_supervisor', { _user_id: authedUser.id }),
      ]);
      if (!(visivel || naFila || isAdmin)) return targetForbidden(actionCode);
      return null;
    };
    if (action === 'read-messages') {
      const jsonBody = ensureBodyIsRecord(body);
      const remoteJid = safeGet(jsonBody, 'remoteJid', false) || safeGet(jsonBody, 'chat', false);
      if (!remoteJid) return new Response(JSON.stringify({ ok: false, skipped: true, reason: 'missing remoteJid' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const denied = await assertTargetAccess(remoteJid, 'READ_MESSAGES_FORBIDDEN');
      if (denied) return denied;
      try {
        const response = await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: [{ remoteJid }] });
        if (response.ok) return response;
        const text = await response.text().catch(() => '');
        return new Response(JSON.stringify({ ok: false, skipped: true, upstream_status: response.status, details: text }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      } catch { return new Response(JSON.stringify({ ok: false, skipped: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
    }
    if (action === 'mark-read') {
      const jb = ensureBodyIsRecord(body);
      const rm = safeGetAny(jb, 'readMessages', false);
      const first = (Array.isArray(rm) ? rm[0] : safeGetAny(jb, 'key', false)) as Record<string, unknown> | null | undefined;
      const denied = await assertTargetAccess(first?.remoteJid ?? (first?.key as Record<string, unknown> | undefined)?.remoteJid, 'MARK_READ_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: Array.isArray(rm) ? rm : [safeGetAny(jb, 'key', false)] });
    }
    if (action === 'mark-unread') {
      const jb = ensureBodyIsRecord(body);
      const rm = safeGetAny(jb, 'readMessages', false);
      const first = (Array.isArray(rm) ? rm[0] : safeGetAny(jb, 'key', false)) as Record<string, unknown> | null | undefined;
      const denied = await assertTargetAccess(first?.remoteJid ?? (first?.key as Record<string, unknown> | undefined)?.remoteJid, 'MARK_UNREAD_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: Array.isArray(rm) ? rm : [safeGetAny(jb, 'key', false)] });
    }
    if (action === 'send-text') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_TEXT_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendText/${instance}`, 'POST', body);
    }
    if (action === 'send-media') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_MEDIA_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendMedia/${instance}`, 'POST', body);
    }
    if (action === 'send-audio') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_AUDIO_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendWhatsAppAudio/${instance}`, 'POST', body);
    }
    if (action === 'send-ptv') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_PTV_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendPtv/${instance}`, 'POST', body);
    }
    if (action === 'send-location') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_LOCATION_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendLocation/${instance}`, 'POST', body);
    }
    if (action === 'send-contact') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_CONTACT_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendContact/${instance}`, 'POST', body);
    }
    if (action === 'send-reaction') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_REACTION_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendReaction/${instance}`, 'POST', body);
    }
    if (action === 'send-poll') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_POLL_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendPoll/${instance}`, 'POST', body);
    }
    if (action === 'send-sticker') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_STICKER_FORBIDDEN');
      if (denied) return denied;
      const rawStickerUrl = safeGet(body, 'sticker', isMultipart);
      const resolvedStickerUrl = rawStickerUrl ? await resolvePrivateBucketUrl(supabase, rawStickerUrl) : undefined;
      return await proxy(`/message/sendSticker/${instance}`, 'POST', resolvedStickerUrl ? { ...jb, sticker: resolvedStickerUrl } : jb);
    }
    if (action === 'send-list') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_LIST_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendList/${instance}`, 'POST', body);
    }
    if (action === 'send-buttons') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_BUTTONS_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendButtons/${instance}`, 'POST', body);
    }
    if (action === 'send-status' || action === 'find-chats' || action === 'find-contacts') {
      // [F3 — decisão 2026-08-18, ADR-R1EXT-F3] Ações instance-wide (publicar
      // status / listar conversas / listar contatos da instância): role-check
      // admin/supervisor (authorizeRoles — helper da casa, loga tentativa
      // negada via log_security_event). Opção 2 do ADR.
      const anonKey = (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) ?? '';
      try {
        await authorizeRoles(req, supabaseUrl, anonKey, ['admin', 'dev', 'supervisor']);
      } catch (authErr) {
        const status = (authErr as { status?: number })?.status ?? 500;
        const message = (authErr as { message?: string })?.message ?? 'Falha de autorização';
        return new Response(JSON.stringify({
          version: EVOLUTION_ENVELOPE_VERSION,
          contract: 'evolution-api@v1',
          error: true,
          status,
          code: status === 403 ? 'ADMIN_ONLY_FORBIDDEN' : 'UNAUTHORIZED',
          message,
          details: [{ path: 'authorization', message }],
        }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const route = action === 'send-status' ? `/message/sendStatus/${instance}` : action === 'find-chats' ? `/chat/findChats/${instance}` : `/chat/findContacts/${instance}`;
      return await proxy(route, 'POST', body);
    }
    if (action === 'send-template') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'SEND_TEMPLATE_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/sendTemplate/${instance}`, 'POST', body);
    }
    if (action === 'find-messages') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertConversationAccess(safeGetAny(jb, 'remoteJid', isMultipart), 'FIND_MESSAGES_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/chat/findMessages/${instance}`, 'POST', body);
    }
    if (action === 'check-numbers') {
      const jb = ensureBodyIsRecord(body);
      const numbers = safeGetAny(jb, 'numbers', isMultipart);
      if (Array.isArray(numbers)) {
        for (const n of numbers) {
          const denied = await assertTargetAccess(n, 'CHECK_NUMBERS_FORBIDDEN');
          if (denied) return denied;
        }
      }
      return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', body);
    }
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
        return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'INVALID_NUMBER', message: 'number é obrigatório (E.164, dígitos 10-15)', details: [{ path: 'number', message: 'number é obrigatório (E.164, dígitos 10-15)' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (!PRESENCE_ALLOWED.has(presence)) {
        return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'INVALID_PRESENCE', message: `presence deve ser um de: ${[...PRESENCE_ALLOWED].join(', ')}`, details: [{ path: 'presence', message: `presence deve ser um de: ${[...PRESENCE_ALLOWED].join(', ')}` }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const denied = await assertTargetAccess(number, 'SEND_CHAT_PRESENCE_FORBIDDEN');
      if (denied) return denied;
      const { instanceName: _instanceName, ...presenceBody } = jb;
      return await proxy(`/chat/sendPresence/${instance}`, 'POST', presenceBody);
    }
    if (action === 'status') return await proxy(`/instance/connectionState/${instance}`, 'GET');
    if (action === 'list-instances') return await proxy(`/instance/fetchInstances`, 'GET');
    if (action === 'instance-info') return await proxy(`/instance/info/${instance}`, 'GET');
    if (action === 'fetch-profile') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'FETCH_PROFILE_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/profile/fetchProfile/${instance}`, 'GET');
    }
    if (action === 'update-profile-name') return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', body);
    if (action === 'update-profile-status') return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', body);
    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'HANDLE_LABEL_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/label/handleLabel/${instance}`, 'POST', body);
    }
    // CONTATOS-16: rota documentada no evolution-api-mapping.md (update-block-status →
    // POST /chat/updateBlockStatus/{instance}) mas ausente do router — consumida por
    // useEvolutionApiManagement.updateBlockStatus → BlockContactDialog.
    if (action === 'update-block-status') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'number', isMultipart), 'UPDATE_BLOCK_STATUS_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', body);
    }
    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', body);
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');
    if (action === 'set-webhook') return await proxy(`/webhook/set/${instance}`, 'POST', body);
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');
    if (action === 'delete-message') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertConversationAccess(safeGetAny(jb, 'remoteJid', isMultipart), 'DELETE_MESSAGE_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/delete/${instance}`, 'DELETE', body);
    }
    if (action === 'archive-chat') {
      const jb = ensureBodyIsRecord(body);
      const denied = await assertTargetAccess(safeGetAny(jb, 'remoteJid', isMultipart), 'ARCHIVE_CHAT_FORBIDDEN');
      if (denied) return denied;
      return await proxy(`/message/archiveChat/${instance}`, 'POST', body);
    }
    if (action === 'get-media-base64') {
      const jb = ensureBodyIsRecord(body);
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório', details: [{ path: 'instance', message: 'instanceName é obrigatório' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const invalidMessage = (code: string, message: string, path: string, status = 400) => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status, code, message, details: [{ path, message }] }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const rawMessage = safeGetAny(jb, 'message', isMultipart);
      if (typeof rawMessage !== 'object' || rawMessage === null || Array.isArray(rawMessage)) return invalidMessage('INVALID_MESSAGE', 'message deve ser um objeto com key (remoteJid, fromMe, id)', 'message');
      const msg = rawMessage as Record<string, unknown>;
      const key = (typeof msg.key === 'object' && msg.key !== null && !Array.isArray(msg.key)) ? msg.key as Record<string, unknown> : null;
      if (!key || typeof key.id !== 'string' || !key.id.trim()) return invalidMessage('INVALID_MESSAGE_KEY', 'message.key.id é obrigatório', 'key', 422);
      if (key.remoteJid !== undefined && typeof key.remoteJid !== 'string') return invalidMessage('INVALID_MESSAGE_KEY', 'message.key.remoteJid deve ser string', 'key', 422);
      if (key.fromMe !== undefined && typeof key.fromMe !== 'boolean') return invalidMessage('INVALID_MESSAGE_KEY', 'message.key.fromMe deve ser boolean', 'key', 422);
      // [R1-AUTH] Fail-closed: prova de acesso à conversa ANTES do proxy (padrão
      // canônico do rpc_insert_message — ver SIMULAÇÃO R1 2026-08-18). Sem
      // contato visível/na fila/admin → 403 MEDIA_FORBIDDEN, nunca proxy.
      // (remoteJid ausente/indefinido → lookup não acha contato → 403.)
      const mediaForbidden = () => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 403, code: 'MEDIA_FORBIDDEN', message: 'Você não tem acesso à mídia desta conversa.', details: [{ path: 'message', message: 'Acesso negado: conversa não visível ao usuário' }] }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: contato } = await supabase
        .from('evolution_contacts')
        .select('id')
        .eq('remote_jid', key.remoteJid)
        .eq('instance_name', instance)
        .eq('deleted_at', null)
        .maybeSingle();
      if (!contato) return mediaForbidden();
      const [{ data: visivel }, { data: naFila }, { data: isAdmin }] = await Promise.all([
        supabase.rpc('is_contact_visible_to_user', { _contact_id: contato.id, _user_id: authedUser.id }),
        supabase.rpc('is_queue_member_of_contact', { _contact_id: contato.id, _user_id: authedUser.id }),
        supabase.rpc('is_admin_or_supervisor', { _user_id: authedUser.id }),
      ]);
      if (!(visivel || naFila || isAdmin)) return mediaForbidden();
      // Download de mídia é lento: timeout 30s (>= 25s) e propaga o abort do caller (req.signal).
      const response = await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message: msg }, { signal: req.signal, timeoutMs: 30_000 });
      // Re-emite envelope de erro com status HTTP real para o frontend classificar
      // (410/403 → expired, 404 → not_found, 504 → network/timeout).
      const rawText = await response.text().catch(() => '');
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(rawText); } catch { parsed = null; }
      if (parsed && parsed.error === true) {
        const upstreamStatus = typeof parsed.status === 'number' ? parsed.status : 502;
        const status = upstreamStatus >= 400 && upstreamStatus <= 599 ? upstreamStatus : 502;
        // R4 (regression review 2026-08-06): NÃO tratar 400/404 genéricos como
        // mídia expirada. Antes, [400,404,410] + regex amplo re-emitia 410
        // MEDIA_EXPIRED para erros que não são de expiração (404 = mensagem/
        // mídia inexistente; 400 = validação/tipo não suportado) — o frontend
        // marcava a mídia como irrecuperável para sempre.
        // Regra nova:
        //  - 410 do upstream (ou body indicando URL mmg.whatsapp.net morta) → 410
        //    MEDIA_EXPIRED (frontend: expired — irrecuperável, sem retry);
        //  - 404 → repassado como 404 (frontend: not_found);
        //  - 400 só vira MEDIA_EXPIRED se o body evidenciar mídia morta;
        //  - demais status → repassados com o body/status reais (frontend
        //    classifica 403 forbidden / 415 unsupported / 504 network).
        const upstreamBody = JSON.stringify(parsed);
        const upstreamSaysMediaDead =
          /Failed to fetch stream|Media not found|message not found|expired|gone/i.test(upstreamBody);
        const mediaExpired =
          upstreamStatus === 410 || (upstreamStatus === 400 && upstreamSaysMediaDead);
        if (mediaExpired) {
          return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 410, code: 'MEDIA_EXPIRED', message: 'A mídia expirou no WhatsApp e não pode mais ser recuperada.', details: [{ path: 'message', message: 'A mídia expirou no WhatsApp e não pode mais ser recuperada.' }] }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(parsed), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(rawText, { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // ── Instance lifecycle (F6-02 / F6-01) ────────────────────────────────────
    // F6-02: criação explícita de instância ANTES do INSERT em whatsapp_connections.
    if (action === 'create-instance') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório', details: [{ path: 'instance', message: 'instanceName é obrigatório' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return await proxy(`/instance/create`, 'POST', body);
    }
    // F6-01: pairing code via `GET /instance/connect/<instance>?number=<phone>`.
    if (action === 'pairing-code') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório', details: [{ path: 'instance', message: 'instanceName é obrigatório' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const rawNumber = String(safeGetAny(body, 'number', isMultipart) ?? '').replace(/\D/g, '');
      if (!rawNumber) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'MISSING_NUMBER', message: 'number (telefone) é obrigatório para pairing code', details: [{ path: 'number', message: 'number (telefone) é obrigatório para pairing code' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return await proxy(`/instance/connect/${instance}?number=${rawNumber}`, 'GET');
    }
    // QR Code: GET /instance/connect/<instance>, com auto-create em 404 "does not exist"
    // (comportamento do prod-snapshot) e envelope estruturado para 401/403.
    if (action === 'connect') {
      if (!instance) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'MISSING_INSTANCE', message: 'instanceName é obrigatório', details: [{ path: 'instance', message: 'instanceName é obrigatório' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      if (instanceLooksLikeUuid(instance)) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: 422, code: 'INSTANCE_NAME_IS_UUID', message: 'Connect deve usar o NOME da instância, não o UUID (evita instância fantasma).', details: [{ path: 'instance', message: 'Connect deve usar o NOME da instância, não o UUID (evita instância fantasma).' }] }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const buildAuthError = (upstreamStatus: number, actionName: string) => new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: upstreamStatus, code: 'EVOLUTION_AUTH_ERROR', action: actionName, message: `Evolution API rejeitou a autenticação (${actionName}). Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.`, details: [{ path: 'instance', message: `Evolution API rejeitou a autenticação (${actionName}). Verifique EVOLUTION_API_URL e EVOLUTION_API_KEY.` }] }), { status: upstreamStatus, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
          return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: createRes.status, message: (createData as { message?: string }).message || 'Falha ao criar a instância na Evolution API', details: [{ path: 'instance', message: (createData as { message?: string }).message || 'Falha ao criar a instância na Evolution API' }] }), { status: createRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        ({ response, data } = await doConnect());
        if (response.status === 401 || response.status === 403) return buildAuthError(response.status, 'connect');
        if (!response.ok) return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, contract: 'evolution-api@v1', error: true, status: response.status, message: 'Falha ao conectar após criar a instância', details: [{ path: 'instance', message: 'Falha ao conectar após criar a instância' }] }), { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ version: EVOLUTION_ENVELOPE_VERSION, data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return errorEnvelope('unknown_action', 'Unknown action', 404, req, { action });
  } catch (error: unknown) {
    const log = new Logger('evolution-api', req);
    log.error('Unhandled error', { error: error instanceof Error ? error.message : String(error) });
    return errorEnvelope('internal_error', 'Internal server error', 500, req);
  }
});
