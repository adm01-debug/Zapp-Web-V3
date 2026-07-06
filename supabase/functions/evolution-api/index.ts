import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors, authorizeRoles, errorResponse } from "../_shared/validation.ts";
import { EVOLUTION_ENVELOPE_VERSION, proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { normalizeChatList, normalizeContactList, normalizeProfile } from "../_shared/evolution-response-normalizers.ts";
import { maybeLogFallback } from "../_shared/evolution-fallback-telemetry.ts";
import { mapFetchInstancesToProfile, shouldFallbackForProfile } from "../_shared/evolution-profile-fallback.ts";
import { isInstancePaused, recordAuthFailureAndMaybePause } from "../_shared/instance-pause.ts";
import { WEBHOOK_EVENTS } from "../_shared/evolution-sync-actions.ts";


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

  const supabaseUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
  const supabaseServiceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
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

  const getParsedBody = async () => {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      if (_formDataCache) return { isMultipart: true, data: _formDataCache };
      try {
        _formDataCache = await req.formData();
        return { isMultipart: true, data: _formDataCache };
      } catch (e) {
        console.error("[Evolution API] Error parsing FormData:", e);
        return { isMultipart: false, data: {} };
      }
    }
    if (_bodyCache !== null) return { isMultipart: false, data: _bodyCache };
    try { _bodyCache = await req.json(); } catch { _bodyCache = {}; }
    return { isMultipart: false, data: _bodyCache! };
  };

  const { isMultipart, data: bodyForAction } = await getParsedBody();
  let action = bodyForAction instanceof FormData 
    ? (bodyForAction.get('action') as string)
    : (bodyForAction as Record<string, unknown>).action as string;
  
  if (!action || action === 'evolution-api') {
    action = pathAction;
  }
  
  const idemKey = (req.headers.get('idempotency-key')
    || req.headers.get('x-idempotency-key')
    || (!isMultipart && typeof (bodyForAction as Record<string, unknown>).__idemKey === 'string' ? (bodyForAction as Record<string, unknown>).__idemKey : '')
    || '').trim() || undefined;

  const proxy = (path: string, method = 'POST', proxyBody?: unknown) =>
    proxyToEvolution(evolutionApiUrl, evolutionApiKey, corsHeaders, path, method, proxyBody, undefined, idemKey);

  try {
    const { isMultipart, data: body } = await getParsedBody();
    let instance: string | null = null;
    if (isMultipart) {
      instance = (body as FormData).get('instanceName') as string || (body as FormData).get('instance') as string;
    } else {
      instance = (body as Record<string, unknown>).instanceName as string || (body as Record<string, unknown>).instance as string;
    }

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
      return await proxy('/instance/create', 'POST', { instanceName: instance, qrcode: (body as Record<string, unknown>).qrcode ?? true, integration: (body as Record<string, unknown>).integration || 'WHATSAPP-BAILEYS', token: (body as Record<string, unknown>).token, number: (body as Record<string, unknown>).number, businessId: (body as Record<string, unknown>).businessId, wabaId: (body as Record<string, unknown>).wabaId, phoneNumberId: (body as Record<string, unknown>).phoneNumberId, webhook: (body as Record<string, unknown>).webhook, chatwoot: (body as Record<string, unknown>).chatwoot, typebot: (body as Record<string, unknown>).typebot, proxy: (body as Record<string, unknown>).proxy });
    }
    if (action === 'list-instances') return await proxy(`/instance/fetchInstances${(body as Record<string, unknown>).instanceName ? `?instanceName=${encodeURIComponent(String((body as Record<string, unknown>).instanceName))}` : ''}`, 'GET');


    if (action === 'connect') {
      let connectUrl = `${evolutionApiUrl}/instance/connect/${encodeURIComponent(String(instance))}`;

      const doConnect = async () => {
        const response = await fetch(connectUrl, { method: 'GET', headers: { 'apikey': evolutionApiKey }, signal: AbortSignal.timeout(10_000) });
        const text = await response.text();
        let data: Record<string, unknown> = {};
        try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { data = { raw: text }; }
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
        const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            instanceName: instance,
            qrcode: (body as Record<string, unknown>).qrcode ?? true,
            integration: (body as Record<string, unknown>).integration || 'WHATSAPP-BAILEYS',
            token: (body as Record<string, unknown>).token,
            number: (body as Record<string, unknown>).number,
            businessId: (body as Record<string, unknown>).businessId,
            wabaId: (body as Record<string, unknown>).wabaId,
            phoneNumberId: (body as Record<string, unknown>).phoneNumberId,
            webhook: (body as Record<string, unknown>).webhook,
            chatwoot: (body as Record<string, unknown>).chatwoot,
            typebot: (body as Record<string, unknown>).typebot,
            proxy: (body as Record<string, unknown>).proxy,
          }),
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
          .update({ qr_code: data.qrcode.base64, status: 'pending' })
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
      let data: Record<string, unknown> = {};
      try { data = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { data = { raw: text }; }

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
            await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('instance_id', instance);
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
          console.error('[evolution-api] disconnect fetch error:', (e as Error).message);
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
    if (action === 'set-presence') return await proxy(`/instance/setPresence/${instance}`, 'POST', { presence: (body as Record<string, unknown>).presence });

    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', { rejectCall: (body as Record<string, unknown>).rejectCall, msgCall: (body as Record<string, unknown>).msgCall, groupsIgnore: (body as Record<string, unknown>).groupsIgnore, alwaysOnline: (body as Record<string, unknown>).alwaysOnline, readMessages: (body as Record<string, unknown>).readMessages, readStatus: (body as Record<string, unknown>).readStatus, syncFullHistory: (body as Record<string, unknown>).syncFullHistory });
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');

    if (action === 'set-webhook') {
      // Accept both flat body { url, events, ... } and nested { webhook: { url, events, ... } }
      // The monitoring UI sends nested; direct API callers send flat. Both must work.
      const wb = (typeof (body as Record<string, unknown>).webhook === 'object' && (body as Record<string, unknown>).webhook !== null)
        ? (body as Record<string, unknown>).webhook as Record<string, unknown>
        : {} as Record<string, unknown>;
      const webhookUrl = (wb.url as string | undefined) || (body as Record<string, unknown>).url as string | undefined;
      const webhookEnabled = wb.enabled ?? (body as Record<string, unknown>).enabled ?? true;
      const webhookByEvents = wb.webhookByEvents ?? (body as Record<string, unknown>).webhookByEvents ?? false;
      const webhookBase64 = wb.webhookBase64 ?? (body as Record<string, unknown>).webhookBase64 ?? true;
      const webhookEvents = (wb.events as string[] | undefined) || (body as Record<string, unknown>).events as string[] | undefined || WEBHOOK_EVENTS;
      return await proxy(`/webhook/set/${instance}`, 'POST', {
        webhook: { enabled: webhookEnabled, url: webhookUrl, webhookByEvents, webhookBase64, events: webhookEvents },
      });
    }
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');

    if (action === 'send-text') {
      const sendTextPayload: Record<string, unknown> = { number: (body as Record<string, unknown>).number, text: (body as Record<string, unknown>).text };
      if ((body as Record<string, unknown>).delay !== undefined) sendTextPayload.delay = (body as Record<string, unknown>).delay;
      if ((body as Record<string, unknown>).quoted !== undefined) sendTextPayload.quoted = (body as Record<string, unknown>).quoted;
      if ((body as Record<string, unknown>).mentionsEveryOne !== undefined) sendTextPayload.mentionsEveryOne = (body as Record<string, unknown>).mentionsEveryOne;
      if ((body as Record<string, unknown>).mentioned !== undefined) sendTextPayload.mentioned = (body as Record<string, unknown>).mentioned;
      if ((body as Record<string, unknown>).linkPreview !== undefined) sendTextPayload.linkPreview = (body as Record<string, unknown>).linkPreview;
      return await proxy(`/message/sendText/${instance}`, 'POST', sendTextPayload);
    }
    if (action === 'send-media') return await proxy(`/message/sendMedia/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, mediatype: (body as Record<string, unknown>).mediaType || (body as Record<string, unknown>).mediatype, mimetype: (body as Record<string, unknown>).mimetype, caption: (body as Record<string, unknown>).caption, media: (body as Record<string, unknown>).mediaUrl || (body as Record<string, unknown>).media, fileName: (body as Record<string, unknown>).fileName, delay: (body as Record<string, unknown>).delay });

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
      const jsonBody = body as Record<string, unknown>;
      const rawAudio = jsonBody.audio ?? jsonBody.audioUrl ?? jsonBody.mediaUrl;
      let audioSource: unknown = typeof rawAudio === 'string'
        ? rawAudio.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawAudio;
      if (typeof audioSource === 'string') audioSource = await resolvePrivateBucketUrl(supabase, audioSource);
      const audioPayload: Record<string, unknown> = { number: jsonBody.number, audio: audioSource };
      if (jsonBody.delay) audioPayload.delay = jsonBody.delay;
      if (jsonBody.encoding !== undefined) audioPayload.encoding = jsonBody.encoding;
      if (jsonBody.isPtt !== undefined) audioPayload.ptt = jsonBody.isPtt; 
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
      const rawVideo = (body as Record<string, unknown>).video ?? (body as Record<string, unknown>).videoUrl ?? (body as Record<string, unknown>).mediaUrl;
      let videoSource: unknown = typeof rawVideo === 'string'
        ? rawVideo.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawVideo;
      if (typeof videoSource === 'string') videoSource = await resolvePrivateBucketUrl(supabase, videoSource, ['whatsapp-media']);
      const ptvPayload: Record<string, unknown> = { number: (body as Record<string, unknown>).number, video: videoSource };
      if ((body as Record<string, unknown>).delay) ptvPayload.delay = (body as Record<string, unknown>).delay;
      return await proxy(`/message/sendPtv/${instance}`, 'POST', ptvPayload);
    }

    if (action === 'send-location') return await proxy(`/message/sendLocation/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, name: (body as Record<string, unknown>).locationName || (body as Record<string, unknown>).name, address: (body as Record<string, unknown>).locationAddress || (body as Record<string, unknown>).address, latitude: (body as Record<string, unknown>).latitude, longitude: (body as Record<string, unknown>).longitude });
    if (action === 'send-contact') return await proxy(`/message/sendContact/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, contact: (body as Record<string, unknown>).contact });
    if (action === 'send-reaction') return await proxy(`/message/sendReaction/${instance}`, 'POST', { key: (body as Record<string, unknown>).key, reaction: (body as Record<string, unknown>).reaction });
    
    if (action === 'send-poll') return await proxy(`/message/sendPoll/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, name: (body as Record<string, unknown>).name || (body as Record<string, unknown>).question, selectableCount: (body as Record<string, unknown>).selectableCount || 1, values: (body as Record<string, unknown>).values || (body as Record<string, unknown>).options });
    if (action === 'send-sticker') {
      let finalStickerUrl = (body as Record<string, unknown>).sticker || (body as Record<string, unknown>).mediaUrl;
      if (typeof finalStickerUrl === 'string') finalStickerUrl = await resolvePrivateBucketUrl(supabase, finalStickerUrl, ['whatsapp-media']);
      return await proxy(`/message/sendSticker/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, sticker: finalStickerUrl });
    }
    
    if (action === 'send-list') return await proxy(`/message/sendList/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, title: (body as Record<string, unknown>).title, description: (body as Record<string, unknown>).description, footer: (body as Record<string, unknown>).footer, buttonText: (body as Record<string, unknown>).buttonText, sections: (body as Record<string, unknown>).sections });
    if (action === 'send-buttons') return await proxy(`/message/sendButtons/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, title: (body as Record<string, unknown>).title, description: (body as Record<string, unknown>).description, footer: (body as Record<string, unknown>).footer, buttons: (body as Record<string, unknown>).buttons });
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') return await proxy(`/message/sendTemplate/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, template: (body as Record<string, unknown>).template });
    if (action === 'mark-read') return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: (body as Record<string, unknown>).readMessages || [(body as Record<string, unknown>).key] });
    if (action === 'mark-unread') return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: (body as Record<string, unknown>).readMessages || [(body as Record<string, unknown>).key] });


    if (action === 'read-messages') {
      const remoteJid = (body as Record<string, unknown>).remoteJid || (body as Record<string, unknown>).chat;
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

    if (action === 'archive-chat') return await proxy(`/message/archiveChat/${instance}`, 'POST', { lastMessage: (body as Record<string, unknown>).lastMessage, chat: (body as Record<string, unknown>).chat, archive: (body as Record<string, unknown>).archive ?? true });
    if (action === 'delete-message') return await proxy(`/message/delete/${instance}`, 'DELETE', { id: (body as Record<string, unknown>).id, remoteJid: (body as Record<string, unknown>).remoteJid, fromMe: (body as Record<string, unknown>).fromMe });
    if (action === 'update-message') return await proxy(`/message/update/${instance}`, 'PUT', { number: (body as Record<string, unknown>).number, key: (body as Record<string, unknown>).key, text: (body as Record<string, unknown>).text });

    if (action === 'find-chats') {
      const t0 = Date.now();
      const endpoint = `/chat/findChats/${instance}`;
      const response = await proxy(endpoint, 'POST', { where: (body as Record<string, unknown>).where || {} });
      const data = await response.json();
      maybeLogFallback({ action: 'find-chats', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeChatList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'find-messages') return await proxy(`/chat/findMessages/${instance}`, 'POST', { where: (body as Record<string, unknown>).where || {}, page: (body as Record<string, unknown>).page, offset: (body as Record<string, unknown>).offset });

    if (action === 'find-status-messages') {
      const response = await proxy(`/chat/findMessages/${instance}`, 'POST', { where: { key: { remoteJid: 'status@broadcast' } }, page: (body as Record<string, unknown>).page ?? 1, offset: (body as Record<string, unknown>).offset ?? 200 });
      const data = await response.json();
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const records = Array.isArray(data?.messages?.records) ? data.messages.records : [];
      return new Response(JSON.stringify(records), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'find-contacts') {
      const t0 = Date.now();
      const endpoint = `/chat/findContacts/${instance}`;
      const response = await proxy(endpoint, 'POST', { where: (body as Record<string, unknown>).where || {} });
      const data = await response.json();
      maybeLogFallback({ action: 'find-contacts', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeContactList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'check-numbers') return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', { numbers: (body as Record<string, unknown>).numbers });
    if (action === 'get-media-base64') return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message: (body as Record<string, unknown>).message, convertToMp4: (body as Record<string, unknown>).convertToMp4 ?? false });
    if (action === 'delete-for-everyone') return await proxy(`/chat/deleteMessageForEveryone/${instance}`, 'DELETE', body);
    if (action === 'edit-message') return await proxy(`/chat/updateMessage/${instance}`, 'PUT', body);

    if (action === 'create-group') return await proxy(`/group/create/${instance}`, 'POST', { subject: (body as Record<string, unknown>).subject, description: (body as Record<string, unknown>).description, participants: (body as Record<string, unknown>).participants });
    if (action === 'list-groups') return await proxy(`/group/fetchAllGroups/${instance}?getParticipants=${encodeURIComponent(String((body as Record<string, unknown>).getParticipants ?? 'false'))}`, 'GET');
    if (action === 'group-info') return await proxy(`/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(String((body as Record<string, unknown>).groupJid ?? ''))}`, 'GET');
    if (action === 'group-participants') return await proxy(`/group/participants/${instance}?groupJid=${encodeURIComponent(String((body as Record<string, unknown>).groupJid ?? ''))}`, 'GET');
    if (action === 'update-group-name') return await proxy(`/group/updateGroupSubject/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid, subject: (body as Record<string, unknown>).subject });
    if (action === 'update-group-description') return await proxy(`/group/updateGroupDescription/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid, description: (body as Record<string, unknown>).description });
    if (action === 'update-participants') return await proxy(`/group/updateParticipant/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid, action: (body as Record<string, unknown>).action, participants: (body as Record<string, unknown>).participants });
    if (action === 'update-group-setting') return await proxy(`/group/updateSetting/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid, action: (body as Record<string, unknown>).action });
    if (action === 'group-invite-code') return await proxy(`/group/inviteCode/${instance}?groupJid=${encodeURIComponent(String((body as Record<string, unknown>).groupJid ?? ''))}`, 'GET');
    if (action === 'revoke-invite-code') return await proxy(`/group/revokeInviteCode/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid });
    if (action === 'invite-info') return await proxy(`/group/inviteInfo/${instance}?inviteCode=${encodeURIComponent(String((body as Record<string, unknown>).inviteCode ?? ''))}`, 'GET');
    if (action === 'accept-invite') return await proxy(`/group/acceptInviteCode/${instance}`, 'POST', { inviteCode: (body as Record<string, unknown>).inviteCode });
    if (action === 'leave-group') return await proxy(`/group/leaveGroup/${instance}`, 'DELETE', { groupJid: (body as Record<string, unknown>).groupJid });
    if (action === 'update-group-picture') return await proxy(`/group/updateGroupPicture/${instance}`, 'PUT', { groupJid: (body as Record<string, unknown>).groupJid, image: (body as Record<string, unknown>).image });
    if (action === 'toggle-ephemeral') return await proxy(`/group/toggleEphemeral/${instance}`, 'POST', { groupJid: (body as Record<string, unknown>).groupJid, expiration: (body as Record<string, unknown>).expiration });

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
    if (action === 'update-profile-name') return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', { name: (body as Record<string, unknown>).name });
    if (action === 'update-profile-status') return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', { status: (body as Record<string, unknown>).status });
    if (action === 'update-profile-picture') return await proxy(`/profile/updateProfilePicture/${instance}`, 'PUT', { picture: (body as Record<string, unknown>).picture });
    if (action === 'remove-profile-picture') return await proxy(`/profile/removeProfilePicture/${instance}`, 'DELETE');
    if (action === 'fetch-profile-picture') return await proxy(`/profile/fetchProfilePicture/${instance}?number=${encodeURIComponent(String((body as Record<string, unknown>).number ?? ''))}`, 'GET');
    if (action === 'fetch-business-profile') return await proxy(`/profile/fetchBusinessProfile/${instance}`, 'POST', { number: (body as Record<string, unknown>).number });
    if (action === 'update-privacy') return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', { readreceipts: (body as Record<string, unknown>).readreceipts, profile: (body as Record<string, unknown>).profile, status: (body as Record<string, unknown>).status, online: (body as Record<string, unknown>).online, last: (body as Record<string, unknown>).last, groupadd: (body as Record<string, unknown>).groupadd });

    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') return await proxy(`/label/handleLabel/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, labelId: (body as Record<string, unknown>).labelId, action: (body as Record<string, unknown>).action });

    if (action === 'set-chatwoot') return await proxy(`/chatwoot/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, accountId: (body as Record<string, unknown>).accountId, token: (body as Record<string, unknown>).token, url: (body as Record<string, unknown>).url, signMsg: (body as Record<string, unknown>).signMsg ?? true, reopenConversation: (body as Record<string, unknown>).reopenConversation ?? true, conversationPending: (body as Record<string, unknown>).conversationPending ?? false, nameInbox: (body as Record<string, unknown>).nameInbox, mergeBrazilContacts: (body as Record<string, unknown>).mergeBrazilContacts ?? true, importContacts: (body as Record<string, unknown>).importContacts ?? true, importMessages: (body as Record<string, unknown>).importMessages ?? true, daysLimitImportMessages: (body as Record<string, unknown>).daysLimitImportMessages ?? 7, signDelimiter: (body as Record<string, unknown>).signDelimiter, autoCreate: (body as Record<string, unknown>).autoCreate ?? false });
    if (action === 'get-chatwoot') return await proxy(`/chatwoot/find/${instance}`, 'GET');
    if (action === 'delete-chatwoot') return await proxy(`/chatwoot/delete/${instance}`, 'DELETE');

    if (action === 'set-typebot') return await proxy(`/typebot/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, url: (body as Record<string, unknown>).url, typebot: (body as Record<string, unknown>).typebot, expire: (body as Record<string, unknown>).expire ?? 20, keywordFinish: (body as Record<string, unknown>).keywordFinish ?? '#fim', delayMessage: (body as Record<string, unknown>).delayMessage ?? 1000, unknownMessage: (body as Record<string, unknown>).unknownMessage, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, keepOpen: (body as Record<string, unknown>).keepOpen ?? false, debounceTime: (body as Record<string, unknown>).debounceTime ?? 10, triggerType: (body as Record<string, unknown>).triggerType, triggerOperator: (body as Record<string, unknown>).triggerOperator, triggerValue: (body as Record<string, unknown>).triggerValue });
    if (action === 'get-typebot') return await proxy(`/typebot/find/${instance}`, 'GET');
    if (action === 'delete-typebot') return await proxy(`/typebot/delete/${instance}`, 'DELETE');
    if (action === 'typebot-sessions') return await proxy(`/typebot/fetchSessions/${instance}${(body as Record<string, unknown>).typebotId ? `?typebotId=${encodeURIComponent(String((body as Record<string, unknown>).typebotId))}` : ''}`, 'GET');
    if (action === 'typebot-change-status') return await proxy(`/typebot/changeStatus/${instance}`, 'POST', { remoteJid: (body as Record<string, unknown>).remoteJid, status: (body as Record<string, unknown>).status });
    if (action === 'start-typebot') return await proxy(`/typebot/startTypebot/${instance}`, 'POST', { remoteJid: (body as Record<string, unknown>).remoteJid, url: (body as Record<string, unknown>).url, typebot: (body as Record<string, unknown>).typebot, variables: (body as Record<string, unknown>).variables });

    if (action === 'set-openai') return await proxy(`/openai/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, openAiApiKey: (body as Record<string, unknown>).openAiApiKey, expire: (body as Record<string, unknown>).expire ?? 30, keywordFinish: (body as Record<string, unknown>).keywordFinish ?? '#sair', delayMessage: (body as Record<string, unknown>).delayMessage ?? 1000, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, speechToText: (body as Record<string, unknown>).speechToText ?? false, botType: (body as Record<string, unknown>).botType ?? 'chatCompletion', assistantId: (body as Record<string, unknown>).assistantId, model: (body as Record<string, unknown>).model ?? 'gpt-4o', systemMessage: (body as Record<string, unknown>).systemMessage, maxTokens: (body as Record<string, unknown>).maxTokens ?? 500, temperature: (body as Record<string, unknown>).temperature ?? 0.7, triggerType: (body as Record<string, unknown>).triggerType ?? 'all', triggerOperator: (body as Record<string, unknown>).triggerOperator, triggerValue: (body as Record<string, unknown>).triggerValue, functionUrl: (body as Record<string, unknown>).functionUrl });
    if (action === 'get-openai') return await proxy(`/openai/find/${instance}`, 'GET');
    if (action === 'delete-openai') return await proxy(`/openai/delete/${instance}`, 'DELETE');

    if (action === 'set-dify') return await proxy(`/dify/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, apiUrl: (body as Record<string, unknown>).apiUrl, apiKey: (body as Record<string, unknown>).apiKey, botType: (body as Record<string, unknown>).botType ?? 'chatBot', expire: (body as Record<string, unknown>).expire ?? 30, triggerType: (body as Record<string, unknown>).triggerType ?? 'all', keywordFinish: (body as Record<string, unknown>).keywordFinish, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, speechToText: (body as Record<string, unknown>).speechToText ?? false });
    if (action === 'get-dify') return await proxy(`/dify/find/${instance}`, 'GET');
    if (action === 'delete-dify') return await proxy(`/dify/delete/${instance}`, 'DELETE');

    if (action === 'set-flowise') return await proxy(`/flowise/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, apiUrl: (body as Record<string, unknown>).apiUrl, apiKey: (body as Record<string, unknown>).apiKey, chatflowId: (body as Record<string, unknown>).chatflowId, expire: (body as Record<string, unknown>).expire ?? 30, triggerType: (body as Record<string, unknown>).triggerType, triggerValue: (body as Record<string, unknown>).triggerValue });
    if (action === 'get-flowise') return await proxy(`/flowise/find/${instance}`, 'GET');
    if (action === 'delete-flowise') return await proxy(`/flowise/delete/${instance}`, 'DELETE');

    if (action === 'set-evolution-bot') return await proxy(`/evolutionBot/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, expire: (body as Record<string, unknown>).expire ?? 10, keywordFinish: (body as Record<string, unknown>).keywordFinish ?? '#sair', delayMessage: (body as Record<string, unknown>).delayMessage ?? 800, triggerType: (body as Record<string, unknown>).triggerType, triggerOperator: (body as Record<string, unknown>).triggerOperator, triggerValue: (body as Record<string, unknown>).triggerValue, unknownMessage: (body as Record<string, unknown>).unknownMessage, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, apiUrl: (body as Record<string, unknown>).apiUrl, apiKey: (body as Record<string, unknown>).apiKey });
    if (action === 'get-evolution-bot') return await proxy(`/evolutionBot/find/${instance}`, 'GET');
    if (action === 'delete-evolution-bot') return await proxy(`/evolutionBot/delete/${instance}`, 'DELETE');

    if (action === 'set-rabbitmq') return await proxy(`/rabbitmq/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, events: (body as Record<string, unknown>).events });
    if (action === 'get-rabbitmq') return await proxy(`/rabbitmq/find/${instance}`, 'GET');
    if (action === 'set-sqs') return await proxy(`/sqs/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, events: (body as Record<string, unknown>).events });
    if (action === 'get-sqs') return await proxy(`/sqs/find/${instance}`, 'GET');
    if (action === 'create-template') return await proxy(`/template/create/${instance}`, 'POST', body);
    if (action === 'find-templates') return await proxy(`/template/find/${instance}`, 'GET');
    if (action === 'delete-template') return await proxy(`/template/delete/${instance}`, 'DELETE', body);
    if (action === 'update-block-status') return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, status: (body as Record<string, unknown>).status });
    if (action === 'offer-call') return await proxy(`/call/offerCall/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, isVideo: (body as Record<string, unknown>).isVideo ?? false, callDuration: (body as Record<string, unknown>).callDuration ?? 5 });
    if (action === 'send-chat-presence') return await proxy(`/chat/sendPresence/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, presence: (body as Record<string, unknown>).presence, delay: (body as Record<string, unknown>).delay ?? 1200 });

    if (action === 'get-catalog') return await proxy(`/business/getCatalog/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, limit: (body as Record<string, unknown>).limit, cursor: (body as Record<string, unknown>).cursor });
    if (action === 'get-collections') return await proxy(`/business/getCollections/${instance}`, 'POST', { number: (body as Record<string, unknown>).number, limit: (body as Record<string, unknown>).limit, cursor: (body as Record<string, unknown>).cursor });
    if (action === 'set-proxy') return await proxy(`/proxy/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, host: (body as Record<string, unknown>).host, port: (body as Record<string, unknown>).port, protocol: (body as Record<string, unknown>).protocol, username: (body as Record<string, unknown>).username, password: (body as Record<string, unknown>).password });
    if (action === 'get-proxy') return await proxy(`/proxy/find/${instance}`, 'GET');
    if (action === 'set-evoai') return await proxy(`/evoai/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, apiUrl: (body as Record<string, unknown>).apiUrl, apiKey: (body as Record<string, unknown>).apiKey, agentId: (body as Record<string, unknown>).agentId, expire: (body as Record<string, unknown>).expire ?? 30, triggerType: (body as Record<string, unknown>).triggerType ?? 'all', triggerOperator: (body as Record<string, unknown>).triggerOperator, triggerValue: (body as Record<string, unknown>).triggerValue, keywordFinish: (body as Record<string, unknown>).keywordFinish, delayMessage: (body as Record<string, unknown>).delayMessage ?? 1000, unknownMessage: (body as Record<string, unknown>).unknownMessage, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, keepOpen: (body as Record<string, unknown>).keepOpen ?? false, debounceTime: (body as Record<string, unknown>).debounceTime ?? 10, speechToText: (body as Record<string, unknown>).speechToText ?? false });
    if (action === 'get-evoai') return await proxy(`/evoai/find/${instance}`, 'GET');
    if (action === 'delete-evoai') return await proxy(`/evoai/delete/${instance}`, 'DELETE');
    if (action === 'set-n8n') return await proxy(`/n8n/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, webhookUrl: (body as Record<string, unknown>).webhookUrl, expire: (body as Record<string, unknown>).expire ?? 30, triggerType: (body as Record<string, unknown>).triggerType ?? 'all', triggerOperator: (body as Record<string, unknown>).triggerOperator, triggerValue: (body as Record<string, unknown>).triggerValue, keywordFinish: (body as Record<string, unknown>).keywordFinish, delayMessage: (body as Record<string, unknown>).delayMessage ?? 1000, unknownMessage: (body as Record<string, unknown>).unknownMessage, listeningFromMe: (body as Record<string, unknown>).listeningFromMe ?? false, stopBotFromMe: (body as Record<string, unknown>).stopBotFromMe ?? true, keepOpen: (body as Record<string, unknown>).keepOpen ?? false, debounceTime: (body as Record<string, unknown>).debounceTime ?? 10 });
    if (action === 'get-n8n') return await proxy(`/n8n/find/${instance}`, 'GET');
    if (action === 'delete-n8n') return await proxy(`/n8n/delete/${instance}`, 'DELETE');
    if (action === 'set-kafka') return await proxy(`/kafka/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, events: (body as Record<string, unknown>).events });
    if (action === 'get-kafka') return await proxy(`/kafka/find/${instance}`, 'GET');
    if (action === 'set-nats') return await proxy(`/nats/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, events: (body as Record<string, unknown>).events });
    if (action === 'get-nats') return await proxy(`/nats/find/${instance}`, 'GET');
    if (action === 'set-pusher') return await proxy(`/pusher/set/${instance}`, 'POST', { enabled: (body as Record<string, unknown>).enabled ?? true, appId: (body as Record<string, unknown>).appId, key: (body as Record<string, unknown>).key, secret: (body as Record<string, unknown>).secret, cluster: (body as Record<string, unknown>).cluster, events: (body as Record<string, unknown>).events });
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
