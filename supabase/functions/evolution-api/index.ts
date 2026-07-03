import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Logger, checkRateLimit, getClientIP, getCorsHeaders, handleCors, authorizeRoles, errorResponse } from "../_shared/validation.ts";
import { EVOLUTION_ENVELOPE_VERSION, proxyToEvolution, resolvePrivateBucketUrl } from "../_shared/evolution-api-proxy.ts";
import { normalizeChatList, normalizeContactList, normalizeProfile } from "../_shared/evolution-response-normalizers.ts";
import { maybeLogFallback } from "../_shared/evolution-fallback-telemetry.ts";
import { mapFetchInstancesToProfile, shouldFallbackForProfile } from "../_shared/evolution-profile-fallback.ts";
import { isInstancePaused, recordAuthFailureAndMaybePause } from "../_shared/instance-pause.ts";
import { WEBHOOK_EVENTS } from "../_shared/evolution-sync-actions.ts";


serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const corsHeaders = getCorsHeaders(req);

  const ip = getClientIP(req);
  const rl = checkRateLimit(`evolution:${ip}`, 120, 60_000);
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const pathAction = pathParts[pathParts.length - 1];

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
    || (!isMultipart && typeof (bodyForAction as any).__idemKey === 'string' ? (bodyForAction as any).__idemKey : '')
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
      await authorizeRoles(req, supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, ['admin', 'dev']);
      return await proxy('/instance/create', 'POST', { instanceName: instance, qrcode: (body as any).qrcode ?? true, integration: (body as any).integration || 'WHATSAPP-BAILEYS', token: (body as any).token, number: (body as any).number, businessId: (body as any).businessId, wabaId: (body as any).wabaId, phoneNumberId: (body as any).phoneNumberId, webhook: (body as any).webhook, chatwoot: (body as any).chatwoot, typebot: (body as any).typebot, proxy: (body as any).proxy });
    }
    if (action === 'list-instances') return await proxy(`/instance/fetchInstances${(body as any).instanceName ? `?instanceName=${(body as any).instanceName}` : ''}`, 'GET');


    if (action === 'connect') {
      const connectUrl = `${evolutionApiUrl}/instance/connect/${instance}`;

      const doConnect = async () => {
        const response = await fetch(connectUrl, { method: 'GET', headers: { 'apikey': evolutionApiKey } });
        const text = await response.text();
        let data: any = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
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

      if (missingInstance) {
        const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
          method: 'POST',
          headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceName: instance,
            qrcode: (body as any).qrcode ?? true,
            integration: (body as any).integration || 'WHATSAPP-BAILEYS',
            token: (body as any).token,
            number: (body as any).number,
            businessId: (body as any).businessId,
            wabaId: (body as any).wabaId,
            phoneNumberId: (body as any).phoneNumberId,
            webhook: (body as any).webhook,
            chatwoot: (body as any).chatwoot,
            typebot: (body as any).typebot,
            proxy: (body as any).proxy,
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
          .update({ qr_code: data.qrcode.base64, status: 'pending', instance_id: instance })
          .eq('instance_id', instance);
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
      const { data: failed, error } = await supabase
        .from('webhook_reprocess_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('next_retry_at', new Date().toISOString())
        .limit(10);
      
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
      
      const results = [];
      for (const item of failed) {
        try {
          await supabase.from('webhook_reprocess_queue').update({ status: 'processing', attempts: item.attempts + 1 }).eq('id', item.id);
          
          // Re-trigger the webhook logic (this is a simplified mock for the task)
          const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;
          const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
            body: JSON.stringify(item.payload)
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
          results.push({ id: item.id, status: 'error', message: (e as Error).message });
        }
      }
      return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instance}`, { method: 'GET', headers: { 'apikey': evolutionApiKey } });
      const text = await response.text();
      let data: any = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (response.status === 401 || response.status === 403) {
        recordAuthFailureAndMaybePause(supabase, String(instance), response.status === 401 ? 'auth_401' : 'auth_403', 'evolution-api', { http_status: response.status, message: 'status' });
        await supabase.from('whatsapp_connections').update({ status: 'disconnected', qr_code: null }).eq('instance_id', instance);
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
      
      await supabase.from('whatsapp_connections').update({ status, qr_code: null }).eq('instance_id', instance);
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
      let data: any = null;
      let attempts = 0;
      const MAX_ATTEMPTS = 2;

      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        try {
          const response = await fetch(`${evolutionApiUrl}/instance/logout/${instance}`, { 
            method: 'DELETE', 
            headers: { 'apikey': evolutionApiKey } 
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
          data = { message: (e as Error).message };
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
      await authorizeRoles(req, supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, ['admin', 'dev']);
      return await proxy(`/instance/delete/${instance}`, 'DELETE', body);
    }
    if (action === 'set-presence') return await proxy(`/instance/setPresence/${instance}`, 'POST', { presence: (body as any).presence });

    if (action === 'set-settings') return await proxy(`/settings/set/${instance}`, 'POST', { rejectCall: (body as any).rejectCall, msgCall: (body as any).msgCall, groupsIgnore: (body as any).groupsIgnore, alwaysOnline: (body as any).alwaysOnline, readMessages: (body as any).readMessages, readStatus: (body as any).readStatus, syncFullHistory: (body as any).syncFullHistory });
    if (action === 'get-settings') return await proxy(`/settings/find/${instance}`, 'GET');

    if (action === 'set-webhook') {
      // Accept both flat body { url, events, ... } and nested { webhook: { url, events, ... } }
      // The monitoring UI sends nested; direct API callers send flat. Both must work.
      const wb = (typeof (body as any).webhook === 'object' && (body as any).webhook !== null)
        ? (body as any).webhook as Record<string, unknown>
        : {} as Record<string, unknown>;
      const webhookUrl = (wb.url as string | undefined) || (body as any).url as string | undefined;
      const webhookEnabled = wb.enabled ?? (body as any).enabled ?? true;
      const webhookByEvents = wb.webhookByEvents ?? (body as any).webhookByEvents ?? false;
      const webhookBase64 = wb.webhookBase64 ?? (body as any).webhookBase64 ?? true;
      const webhookEvents = (wb.events as string[] | undefined) || (body as any).events as string[] | undefined || WEBHOOK_EVENTS;
      return await proxy(`/webhook/set/${instance}`, 'POST', {
        webhook: { enabled: webhookEnabled, url: webhookUrl, webhookByEvents, webhookBase64, events: webhookEvents },
      });
    }
    if (action === 'get-webhook') return await proxy(`/webhook/find/${instance}`, 'GET');

    if (action === 'send-text') {
      const sendTextPayload: Record<string, unknown> = { number: (body as any).number, text: (body as any).text };
      if ((body as any).delay !== undefined) sendTextPayload.delay = (body as any).delay;
      if ((body as any).quoted !== undefined) sendTextPayload.quoted = (body as any).quoted;
      if ((body as any).mentionsEveryOne !== undefined) sendTextPayload.mentionsEveryOne = (body as any).mentionsEveryOne;
      if ((body as any).mentioned !== undefined) sendTextPayload.mentioned = (body as any).mentioned;
      if ((body as any).linkPreview !== undefined) sendTextPayload.linkPreview = (body as any).linkPreview;
      return await proxy(`/message/sendText/${instance}`, 'POST', sendTextPayload);
    }
    if (action === 'send-media') return await proxy(`/message/sendMedia/${instance}`, 'POST', { number: (body as any).number, mediatype: (body as any).mediaType || (body as any).mediatype, mimetype: (body as any).mimetype, caption: (body as any).caption, media: (body as any).mediaUrl || (body as any).media, fileName: (body as any).fileName, delay: (body as any).delay });

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
      const rawVideo = (body as any).video ?? (body as any).videoUrl ?? (body as any).mediaUrl;
      let videoSource: unknown = typeof rawVideo === 'string'
        ? rawVideo.trim().replace(/^"+|"+$/g, '').replace(/\.supabase\.co"\//, '.supabase.co/')
        : rawVideo;
      if (typeof videoSource === 'string') videoSource = await resolvePrivateBucketUrl(supabase, videoSource, ['whatsapp-media']);
      const ptvPayload: Record<string, unknown> = { number: (body as any).number, video: videoSource };
      if ((body as any).delay) ptvPayload.delay = (body as any).delay;
      return await proxy(`/message/sendPtv/${instance}`, 'POST', ptvPayload);
    }

    if (action === 'send-location') return await proxy(`/message/sendLocation/${instance}`, 'POST', { number: (body as any).number, name: (body as any).locationName || (body as any).name, address: (body as any).locationAddress || (body as any).address, latitude: (body as any).latitude, longitude: (body as any).longitude });
    if (action === 'send-contact') return await proxy(`/message/sendContact/${instance}`, 'POST', { number: (body as any).number, contact: (body as any).contact });
    if (action === 'send-reaction') return await proxy(`/message/sendReaction/${instance}`, 'POST', { key: (body as any).key, reaction: (body as any).reaction });
    
    if (action === 'send-poll') return await proxy(`/message/sendPoll/${instance}`, 'POST', { number: (body as any).number, name: (body as any).name || (body as any).question, selectableCount: (body as any).selectableCount || 1, values: (body as any).values || (body as any).options });
    if (action === 'send-sticker') {
      let finalStickerUrl = (body as any).sticker || (body as any).mediaUrl;
      if (typeof finalStickerUrl === 'string') finalStickerUrl = await resolvePrivateBucketUrl(supabase, finalStickerUrl, ['whatsapp-media']);
      return await proxy(`/message/sendSticker/${instance}`, 'POST', { number: (body as any).number, sticker: finalStickerUrl });
    }
    
    if (action === 'send-list') return await proxy(`/message/sendList/${instance}`, 'POST', { number: (body as any).number, title: (body as any).title, description: (body as any).description, footer: (body as any).footer, buttonText: (body as any).buttonText, sections: (body as any).sections });
    if (action === 'send-buttons') return await proxy(`/message/sendButtons/${instance}`, 'POST', { number: (body as any).number, title: (body as any).title, description: (body as any).description, footer: (body as any).footer, buttons: (body as any).buttons });
    if (action === 'send-status') return await proxy(`/message/sendStatus/${instance}`, 'POST', body);
    if (action === 'send-template') return await proxy(`/message/sendTemplate/${instance}`, 'POST', { number: (body as any).number, template: (body as any).template });
    if (action === 'mark-read') return await proxy(`/chat/markMessageAsRead/${instance}`, 'POST', { readMessages: (body as any).readMessages || [(body as any).key] });
    if (action === 'mark-unread') return await proxy(`/chat/markMessageAsUnread/${instance}`, 'POST', { readMessages: (body as any).readMessages || [(body as any).key] });


    if (action === 'read-messages') {
      const remoteJid = (body as any).remoteJid || (body as any).chat;
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
        return new Response(JSON.stringify({ ok: false, skipped: true, error: err instanceof Error ? err.message : 'proxy failed' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'archive-chat') return await proxy(`/message/archiveChat/${instance}`, 'POST', { lastMessage: (body as any).lastMessage, chat: (body as any).chat, archive: (body as any).archive ?? true });
    if (action === 'delete-message') return await proxy(`/message/delete/${instance}`, 'DELETE', { id: (body as any).id, remoteJid: (body as any).remoteJid, fromMe: (body as any).fromMe });
    if (action === 'update-message') return await proxy(`/message/update/${instance}`, 'PUT', { number: (body as any).number, key: (body as any).key, text: (body as any).text });

    if (action === 'find-chats') {
      const t0 = Date.now();
      const endpoint = `/chat/findChats/${instance}`;
      const response = await proxy(endpoint, 'POST', { where: (body as any).where || {} });
      const data = await response.json();
      maybeLogFallback({ action: 'find-chats', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeChatList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'find-messages') return await proxy(`/chat/findMessages/${instance}`, 'POST', { where: (body as any).where || {}, page: (body as any).page, offset: (body as any).offset });

    if (action === 'find-status-messages') {
      const response = await proxy(`/chat/findMessages/${instance}`, 'POST', { where: { key: { remoteJid: 'status@broadcast' } }, page: (body as any).page ?? 1, offset: (body as any).offset ?? 200 });
      const data = await response.json();
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const records = Array.isArray(data?.messages?.records) ? data.messages.records : [];
      return new Response(JSON.stringify(records), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'find-contacts') {
      const t0 = Date.now();
      const endpoint = `/chat/findContacts/${instance}`;
      const response = await proxy(endpoint, 'POST', { where: (body as any).where || {} });
      const data = await response.json();
      maybeLogFallback({ action: 'find-contacts', endpoint, instance: instance ? String(instance) : null, status: response.status, data, primary_ms: Date.now() - t0, supabase });
      if (data?.error === true) return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify(normalizeContactList(data)), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (action === 'check-numbers') return await proxy(`/chat/whatsappNumbers/${instance}`, 'POST', { numbers: (body as any).numbers });
    if (action === 'get-media-base64') return await proxy(`/chat/getBase64FromMediaMessage/${instance}`, 'POST', { message: (body as any).message, convertToMp4: (body as any).convertToMp4 ?? false });
    if (action === 'delete-for-everyone') return await proxy(`/chat/deleteMessageForEveryone/${instance}`, 'DELETE', body);
    if (action === 'edit-message') return await proxy(`/chat/updateMessage/${instance}`, 'PUT', body);

    if (action === 'create-group') return await proxy(`/group/create/${instance}`, 'POST', { subject: (body as any).subject, description: (body as any).description, participants: (body as any).participants });
    if (action === 'list-groups') return await proxy(`/group/fetchAllGroups/${instance}?getParticipants=${(body as any).getParticipants ?? 'false'}`, 'GET');
    if (action === 'group-info') return await proxy(`/group/findGroupInfos/${instance}?groupJid=${(body as any).groupJid}`, 'GET');
    if (action === 'group-participants') return await proxy(`/group/participants/${instance}?groupJid=${(body as any).groupJid}`, 'GET');
    if (action === 'update-group-name') return await proxy(`/group/updateGroupSubject/${instance}`, 'PUT', { groupJid: (body as any).groupJid, subject: (body as any).subject });
    if (action === 'update-group-description') return await proxy(`/group/updateGroupDescription/${instance}`, 'PUT', { groupJid: (body as any).groupJid, description: (body as any).description });
    if (action === 'update-participants') return await proxy(`/group/updateParticipant/${instance}`, 'PUT', { groupJid: (body as any).groupJid, action: (body as any).action, participants: (body as any).participants });
    if (action === 'update-group-setting') return await proxy(`/group/updateSetting/${instance}`, 'PUT', { groupJid: (body as any).groupJid, action: (body as any).action });
    if (action === 'group-invite-code') return await proxy(`/group/inviteCode/${instance}?groupJid=${(body as any).groupJid}`, 'GET');
    if (action === 'revoke-invite-code') return await proxy(`/group/revokeInviteCode/${instance}`, 'PUT', { groupJid: (body as any).groupJid });
    if (action === 'invite-info') return await proxy(`/group/inviteInfo/${instance}?inviteCode=${(body as any).inviteCode}`, 'GET');
    if (action === 'accept-invite') return await proxy(`/group/acceptInviteCode/${instance}`, 'POST', { inviteCode: (body as any).inviteCode });
    if (action === 'leave-group') return await proxy(`/group/leaveGroup/${instance}`, 'DELETE', { groupJid: (body as any).groupJid });
    if (action === 'update-group-picture') return await proxy(`/group/updateGroupPicture/${instance}`, 'PUT', { groupJid: (body as any).groupJid, image: (body as any).image });
    if (action === 'toggle-ephemeral') return await proxy(`/group/toggleEphemeral/${instance}`, 'POST', { groupJid: (body as any).groupJid, expiration: (body as any).expiration });

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
    if (action === 'update-profile-name') return await proxy(`/profile/updateProfileName/${instance}`, 'PUT', { name: (body as any).name });
    if (action === 'update-profile-status') return await proxy(`/profile/updateProfileStatus/${instance}`, 'PUT', { status: (body as any).status });
    if (action === 'update-profile-picture') return await proxy(`/profile/updateProfilePicture/${instance}`, 'PUT', { picture: (body as any).picture });
    if (action === 'remove-profile-picture') return await proxy(`/profile/removeProfilePicture/${instance}`, 'DELETE');
    if (action === 'fetch-profile-picture') return await proxy(`/profile/fetchProfilePicture/${instance}?number=${(body as any).number}`, 'GET');
    if (action === 'fetch-business-profile') return await proxy(`/profile/fetchBusinessProfile/${instance}`, 'POST', { number: (body as any).number });
    if (action === 'update-privacy') return await proxy(`/profile/updatePrivacySettings/${instance}`, 'PUT', { readreceipts: (body as any).readreceipts, profile: (body as any).profile, status: (body as any).status, online: (body as any).online, last: (body as any).last, groupadd: (body as any).groupadd });

    if (action === 'find-labels') return await proxy(`/label/findLabels/${instance}`, 'GET');
    if (action === 'handle-label') return await proxy(`/label/handleLabel/${instance}`, 'POST', { number: (body as any).number, labelId: (body as any).labelId, action: (body as any).action });

    if (action === 'set-chatwoot') return await proxy(`/chatwoot/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, accountId: (body as any).accountId, token: (body as any).token, url: (body as any).url, signMsg: (body as any).signMsg ?? true, reopenConversation: (body as any).reopenConversation ?? true, conversationPending: (body as any).conversationPending ?? false, nameInbox: (body as any).nameInbox, mergeBrazilContacts: (body as any).mergeBrazilContacts ?? true, importContacts: (body as any).importContacts ?? true, importMessages: (body as any).importMessages ?? true, daysLimitImportMessages: (body as any).daysLimitImportMessages ?? 7, signDelimiter: (body as any).signDelimiter, autoCreate: (body as any).autoCreate ?? false });
    if (action === 'get-chatwoot') return await proxy(`/chatwoot/find/${instance}`, 'GET');
    if (action === 'delete-chatwoot') return await proxy(`/chatwoot/delete/${instance}`, 'DELETE');

    if (action === 'set-typebot') return await proxy(`/typebot/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, url: (body as any).url, typebot: (body as any).typebot, expire: (body as any).expire ?? 20, keywordFinish: (body as any).keywordFinish ?? '#fim', delayMessage: (body as any).delayMessage ?? 1000, unknownMessage: (body as any).unknownMessage, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, keepOpen: (body as any).keepOpen ?? false, debounceTime: (body as any).debounceTime ?? 10, triggerType: (body as any).triggerType, triggerOperator: (body as any).triggerOperator, triggerValue: (body as any).triggerValue });
    if (action === 'get-typebot') return await proxy(`/typebot/find/${instance}`, 'GET');
    if (action === 'delete-typebot') return await proxy(`/typebot/delete/${instance}`, 'DELETE');
    if (action === 'typebot-sessions') return await proxy(`/typebot/fetchSessions/${instance}${(body as any).typebotId ? `?typebotId=${(body as any).typebotId}` : ''}`, 'GET');
    if (action === 'typebot-change-status') return await proxy(`/typebot/changeStatus/${instance}`, 'POST', { remoteJid: (body as any).remoteJid, status: (body as any).status });
    if (action === 'start-typebot') return await proxy(`/typebot/startTypebot/${instance}`, 'POST', { remoteJid: (body as any).remoteJid, url: (body as any).url, typebot: (body as any).typebot, variables: (body as any).variables });

    if (action === 'set-openai') return await proxy(`/openai/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, openAiApiKey: (body as any).openAiApiKey, expire: (body as any).expire ?? 30, keywordFinish: (body as any).keywordFinish ?? '#sair', delayMessage: (body as any).delayMessage ?? 1000, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, speechToText: (body as any).speechToText ?? false, botType: (body as any).botType ?? 'chatCompletion', assistantId: (body as any).assistantId, model: (body as any).model ?? 'gpt-4o', systemMessage: (body as any).systemMessage, maxTokens: (body as any).maxTokens ?? 500, temperature: (body as any).temperature ?? 0.7, triggerType: (body as any).triggerType ?? 'all', triggerOperator: (body as any).triggerOperator, triggerValue: (body as any).triggerValue, functionUrl: (body as any).functionUrl });
    if (action === 'get-openai') return await proxy(`/openai/find/${instance}`, 'GET');
    if (action === 'delete-openai') return await proxy(`/openai/delete/${instance}`, 'DELETE');

    if (action === 'set-dify') return await proxy(`/dify/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, apiUrl: (body as any).apiUrl, apiKey: (body as any).apiKey, botType: (body as any).botType ?? 'chatBot', expire: (body as any).expire ?? 30, triggerType: (body as any).triggerType ?? 'all', keywordFinish: (body as any).keywordFinish, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, speechToText: (body as any).speechToText ?? false });
    if (action === 'get-dify') return await proxy(`/dify/find/${instance}`, 'GET');
    if (action === 'delete-dify') return await proxy(`/dify/delete/${instance}`, 'DELETE');

    if (action === 'set-flowise') return await proxy(`/flowise/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, apiUrl: (body as any).apiUrl, apiKey: (body as any).apiKey, chatflowId: (body as any).chatflowId, expire: (body as any).expire ?? 30, triggerType: (body as any).triggerType, triggerValue: (body as any).triggerValue });
    if (action === 'get-flowise') return await proxy(`/flowise/find/${instance}`, 'GET');
    if (action === 'delete-flowise') return await proxy(`/flowise/delete/${instance}`, 'DELETE');

    if (action === 'set-evolution-bot') return await proxy(`/evolutionBot/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, expire: (body as any).expire ?? 10, keywordFinish: (body as any).keywordFinish ?? '#sair', delayMessage: (body as any).delayMessage ?? 800, triggerType: (body as any).triggerType, triggerOperator: (body as any).triggerOperator, triggerValue: (body as any).triggerValue, unknownMessage: (body as any).unknownMessage, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, apiUrl: (body as any).apiUrl, apiKey: (body as any).apiKey });
    if (action === 'get-evolution-bot') return await proxy(`/evolutionBot/find/${instance}`, 'GET');
    if (action === 'delete-evolution-bot') return await proxy(`/evolutionBot/delete/${instance}`, 'DELETE');

    if (action === 'set-rabbitmq') return await proxy(`/rabbitmq/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, events: (body as any).events });
    if (action === 'get-rabbitmq') return await proxy(`/rabbitmq/find/${instance}`, 'GET');
    if (action === 'set-sqs') return await proxy(`/sqs/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, events: (body as any).events });
    if (action === 'get-sqs') return await proxy(`/sqs/find/${instance}`, 'GET');
    if (action === 'create-template') return await proxy(`/template/create/${instance}`, 'POST', body);
    if (action === 'find-templates') return await proxy(`/template/find/${instance}`, 'GET');
    if (action === 'delete-template') return await proxy(`/template/delete/${instance}`, 'DELETE', body);
    if (action === 'update-block-status') return await proxy(`/chat/updateBlockStatus/${instance}`, 'POST', { number: (body as any).number, status: (body as any).status });
    if (action === 'offer-call') return await proxy(`/call/offerCall/${instance}`, 'POST', { number: (body as any).number, isVideo: (body as any).isVideo ?? false, callDuration: (body as any).callDuration ?? 5 });
    if (action === 'send-chat-presence') return await proxy(`/chat/sendPresence/${instance}`, 'POST', { number: (body as any).number, presence: (body as any).presence, delay: (body as any).delay ?? 1200 });

    if (action === 'get-catalog') return await proxy(`/business/getCatalog/${instance}`, 'POST', { number: (body as any).number, limit: (body as any).limit, cursor: (body as any).cursor });
    if (action === 'get-collections') return await proxy(`/business/getCollections/${instance}`, 'POST', { number: (body as any).number, limit: (body as any).limit, cursor: (body as any).cursor });
    if (action === 'set-proxy') return await proxy(`/proxy/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, host: (body as any).host, port: (body as any).port, protocol: (body as any).protocol, username: (body as any).username, password: (body as any).password });
    if (action === 'get-proxy') return await proxy(`/proxy/find/${instance}`, 'GET');
    if (action === 'set-evoai') return await proxy(`/evoai/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, apiUrl: (body as any).apiUrl, apiKey: (body as any).apiKey, agentId: (body as any).agentId, expire: (body as any).expire ?? 30, triggerType: (body as any).triggerType ?? 'all', triggerOperator: (body as any).triggerOperator, triggerValue: (body as any).triggerValue, keywordFinish: (body as any).keywordFinish, delayMessage: (body as any).delayMessage ?? 1000, unknownMessage: (body as any).unknownMessage, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, keepOpen: (body as any).keepOpen ?? false, debounceTime: (body as any).debounceTime ?? 10, speechToText: (body as any).speechToText ?? false });
    if (action === 'get-evoai') return await proxy(`/evoai/find/${instance}`, 'GET');
    if (action === 'delete-evoai') return await proxy(`/evoai/delete/${instance}`, 'DELETE');
    if (action === 'set-n8n') return await proxy(`/n8n/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, webhookUrl: (body as any).webhookUrl, expire: (body as any).expire ?? 30, triggerType: (body as any).triggerType ?? 'all', triggerOperator: (body as any).triggerOperator, triggerValue: (body as any).triggerValue, keywordFinish: (body as any).keywordFinish, delayMessage: (body as any).delayMessage ?? 1000, unknownMessage: (body as any).unknownMessage, listeningFromMe: (body as any).listeningFromMe ?? false, stopBotFromMe: (body as any).stopBotFromMe ?? true, keepOpen: (body as any).keepOpen ?? false, debounceTime: (body as any).debounceTime ?? 10 });
    if (action === 'get-n8n') return await proxy(`/n8n/find/${instance}`, 'GET');
    if (action === 'delete-n8n') return await proxy(`/n8n/delete/${instance}`, 'DELETE');
    if (action === 'set-kafka') return await proxy(`/kafka/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, events: (body as any).events });
    if (action === 'get-kafka') return await proxy(`/kafka/find/${instance}`, 'GET');
    if (action === 'set-nats') return await proxy(`/nats/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, events: (body as any).events });
    if (action === 'get-nats') return await proxy(`/nats/find/${instance}`, 'GET');
    if (action === 'set-pusher') return await proxy(`/pusher/set/${instance}`, 'POST', { enabled: (body as any).enabled ?? true, appId: (body as any).appId, key: (body as any).key, secret: (body as any).secret, cluster: (body as any).cluster, events: (body as any).events });
    if (action === 'get-pusher') return await proxy(`/pusher/find/${instance}`, 'GET');

    return new Response(JSON.stringify({ error: 'Unknown action', action }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status, req);
    const log = new Logger('evolution-api', req);
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Unhandled error', { error: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
