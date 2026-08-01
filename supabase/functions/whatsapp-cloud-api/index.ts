// Edge Function: whatsapp-cloud-api
// Mirrors the external surface of `evolution-api` (action, instanceName, number, text, ...)
// but routes to Meta WhatsApp Cloud API (Graph). Persists outbound messages to FATOR X
// via rpc_insert_message so the Inbox UI sees them in the unified evolution_messages table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { authorizeRoles, errorResponse, jsonResponse } from "../_shared/validation.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Credentials {
  connection_id: string;
  phone_number_id: string;
  access_token: string;
  graph_api_version: string;
}

async function loadCredentials(
  supabase: ReturnType<typeof createClient>,
  instanceName: string,
): Promise<Credentials | null> {
  // The "instance" for official connections is the whatsapp_connections.instance_id.
  // We look it up to find the connection_id, then load credentials.
  const { data: conn } = await supabase
    .from('whatsapp_connections')
    .select('id, api_type')
    .eq('instance_id', instanceName)
    .maybeSingle();
  if (!conn || conn.api_type !== 'official') return null;

  const { data: creds } = await supabase
    .from('whatsapp_official_credentials')
    .select('connection_id, phone_number_id, access_token, graph_api_version')
    .eq('connection_id', conn.id)
    .maybeSingle();
  return (creds as Credentials | null) ?? null;
}

function jidFromNumber(numberOrJid: string): string {
  if (numberOrJid.includes('@')) return numberOrJid;
  const digits = numberOrJid.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function phoneFromAny(numberOrJid: string): string {
  return numberOrJid.split('@')[0].replace(/\D/g, '');
}

async function callGraph(
  creds: Credentials,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `https://graph.facebook.com/${creds.graph_api_version}/${creds.phone_number_id}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${creds.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function persistOutbound(
  externalClient: ReturnType<typeof createClient>,
  remoteJid: string,
  wamid: string,
  messageType: string,
  content: string,
  mediaUrl?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await externalClient.rpc('rpc_insert_message', {
      p_remote_jid: remoteJid,
      p_content: content,
      p_message_id: wamid,
      p_from_me: true,
      p_message_type: messageType,
      p_media_url: mediaUrl ?? null,
      p_metadata: metadata ?? { source: 'whatsapp_cloud_api' },
    } as Record<string, unknown>);
  } catch (e) {
    console.error('[whatsapp-cloud-api] rpc_insert_message failed', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  try {
    // Basic staff authorization for all actions
    await authorizeRoles(req, supabaseUrl, supabaseAnonKey, ['agent', 'supervisor', 'manager', 'admin', 'dev']);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }


  const action = String(body.action ?? '');
  const instanceName = String(body.instanceName ?? body.instance ?? '');
  if (!action) return jsonResponse({ error: true, message: 'Missing action' }, 400, req);
  if (!instanceName) return jsonResponse({ error: true, message: 'Missing instanceName' }, 400, req);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
  const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')
    ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');
  const externalClient = externalUrl && externalKey
    ? createClient(externalUrl, externalKey)
    : null;

  const creds = await loadCredentials(supabase, instanceName);
  if (!creds) {
    return jsonResponse({
      error: true,
      code: 'OFFICIAL_CREDENTIALS_MISSING',
      message: 'Credenciais da WhatsApp Cloud API não configuradas para esta conexão.',
    }, 400, req);
  }

  // PING / status
  if (action === 'ping' || action === 'status' || action === 'instance-info') {
    const url = `https://graph.facebook.com/${creds.graph_api_version}/${creds.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${creds.access_token}` } });
    const data = await res.json().catch(() => ({}));
    return jsonResponse({ ok: res.ok, status: res.status, data }, 200, req);
  }

  const number = String(body.number ?? body.to ?? '');
  if (!number) return jsonResponse({ error: true, message: 'Missing number' }, 400, req);
  const phone = phoneFromAny(number);
  const remoteJid = jidFromNumber(number);

  let graphBody: Record<string, unknown> | null = null;
  let messageType = 'text';
  let contentForLog = '';
  let mediaUrlForLog: string | undefined;

  switch (action) {
    case 'send-text': {
      const text = String(body.text ?? '');
      contentForLog = text;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text, preview_url: Boolean(body.linkPreview ?? true) },
      };
      break;
    }
    case 'send-media': {
      const mediaType = String(body.mediatype ?? body.mediaType ?? 'image');
      const url = String(body.media ?? body.url ?? '');
      const caption = String(body.caption ?? '');
      messageType = mediaType;
      contentForLog = caption;
      mediaUrlForLog = url;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: mediaType,
        [mediaType]: { link: url, ...(caption ? { caption } : {}) },
      };
      break;
    }
    case 'send-audio': {
      const url = String(body.audio ?? body.url ?? body.media ?? '');
      messageType = 'audio';
      mediaUrlForLog = url;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'audio',
        audio: { link: url },
      };
      break;
    }
    case 'send-sticker': {
      const url = String(body.sticker ?? body.url ?? body.media ?? '');
      messageType = 'sticker';
      mediaUrlForLog = url;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'sticker',
        sticker: { link: url },
      };
      break;
    }
    case 'send-reaction': {
      const emoji = String(body.reaction ?? body.emoji ?? '');
      const wamid = String(body.messageId ?? body.wamid ?? '');
      messageType = 'reaction';
      contentForLog = emoji;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'reaction',
        reaction: { message_id: wamid, emoji },
      };
      break;
    }
    case 'mark-read': {
      const wamid = String(body.messageId ?? body.wamid ?? '');
      const url = `https://graph.facebook.com/${creds.graph_api_version}/${creds.phone_number_id}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: wamid }),
      });
      const data = await res.json().catch(() => ({}));
      return jsonResponse({ ok: res.ok, status: res.status, data }, 200, req);
    }
    case 'send-template': {
      const templateName = String(body.templateName ?? body.template ?? '');
      const language = String(body.language ?? 'pt_BR');
      const components = (body.components as unknown[]) ?? [];
      messageType = 'template';
      contentForLog = `[template:${templateName}]`;
      graphBody = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: { name: templateName, language: { code: language }, components },
      };
      break;
    }
    case 'presence': {
      // Cloud API doesn't expose presence (typing) — silently OK.
      return jsonResponse({ ok: true, skipped: true, reason: 'Cloud API does not support presence' }, 200, req);
    }
    default:
      return jsonResponse({
        error: true, code: 'UNSUPPORTED_ACTION',
        message: `Action "${action}" not supported in WhatsApp Cloud API mode`,
      }, 400, req);
  }

  if (!graphBody) return jsonResponse({ error: true, message: 'Empty graph body' }, 400, req);

  const result = await callGraph(creds, graphBody);
  if (!result.ok) {
    return jsonResponse({
      error: true,
      status: result.status,
      message: 'Meta Graph API call failed',
      details: result.body,
    }, 200, req); // 200 envelope so frontend reads `error` field, matches evolution-api pattern
  }

  const data = result.body as { messages?: Array<{ id: string }> };
  const wamid = data?.messages?.[0]?.id ?? `cloud_${Date.now()}`;

  if (externalClient) {
    await persistOutbound(externalClient, remoteJid, wamid, messageType, contentForLog, mediaUrlForLog);
  }

  // Mirror evolution-api success envelope
  return jsonResponse({
    key: { id: wamid, remoteJid, fromMe: true },
    status: 'PENDING',
    messageId: wamid,
    raw: data,
  }, 200, req);
  } catch (error: any) {
    if (error.status) return errorResponse(error.message, error.status, req);
    console.error("[whatsapp-cloud-api] Global Error:", error);
    return errorResponse(error.message || 'Internal Server Error', 500, req);
  }
});
