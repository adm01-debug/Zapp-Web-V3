/**
 * download-wa-status-media
 * Downloads WhatsApp status media via Evolution API before URLs expire.
 * Called by pg_cron every 30min for non-expired status entries.
 * Evolution HTTP via evolutionClient (gateway canônico — decouple gate m2).
 */

import { evolutionClient } from '../_shared/providers/evolution/index.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type' } });
  }

  const SUPABASE_URL = Deno.env.get('SELFHOSTED_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') || '';

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { status_id, participant_jid, message_id, message_type } = body as {
    status_id: string;
    participant_jid: string;
    message_id: string;
    message_type: string;
  };

  if (!status_id || !participant_jid || !message_id) {
    return Response.json({ ok: false, error: 'status_id, participant_jid, message_id required' }, { status: 400 });
  }

  // 1. Call Evolution API (gateway canônico) to download and decrypt the status media
  const evoRes = await evolutionClient.post('chat/getBase64FromMediaMessage/wpp2', {
    key: {
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: message_id,
      participant: participant_jid,
    },
    convertToMp4: false,
  }, { timeoutMs: 30_000 });

  if (!evoRes.ok) {
    return Response.json({ ok: false, error: `Evolution API error: ${evoRes.status}`, detail: (evoRes.error ?? '').slice(0, 200) }, { status: 502 });
  }

  const evoData = (evoRes.data ?? {}) as Record<string, unknown>;
  const base64Media = (evoData.base64 || evoData.data) as string | undefined;
  const mimetype = (evoData.mimetype || 'application/octet-stream') as string;

  if (!base64Media) {
    return Response.json({ ok: false, error: 'No base64 media in response', evo_response: evoData }, { status: 502 });
  }

  // 2. Decode base64 to bytes
  const binaryStr = atob(base64Media.includes(',') ? base64Media.split(',')[1] : base64Media);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  // 3. Upload to Supabase Storage bucket 'whatsapp-status-media'
  const ext = mimetype.includes('video') ? 'mp4' : mimetype.includes('image') ? 'jpg' : mimetype.split('/')[1] || 'bin';
  const storagePath = `status/${new Date().toISOString().slice(0,10)}/${status_id}.${ext}`;
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/whatsapp-status-media/${storagePath}`;

  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': mimetype,
      'x-upsert': 'true',
    },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => '');
    return Response.json({ ok: false, error: `Storage upload error: ${uploadRes.status}`, detail: errText.slice(0, 200) }, { status: 502 });
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/whatsapp-status-media/${storagePath}`;

  // 4. Update evolution_whatsapp_status with local_media_url
  const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_status_media_url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ p_status_id: status_id, p_media_url: publicUrl }),
  });

  return Response.json({
    ok: true,
    status_id,
    storage_path: storagePath,
    public_url: publicUrl,
    mimetype,
    size_bytes: bytes.length,
  });
});
