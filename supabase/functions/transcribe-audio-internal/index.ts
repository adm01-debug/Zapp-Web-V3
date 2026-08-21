/**
 * transcribe-audio-internal v7
 * v6: auto-deteccao de formato por magic bytes (MP3/OGG/WAV/FLAC)
 * corrige casos em que audio MP3 foi salvo com extensao .ogg
 * v7 (SEC-2, 2026-08-21): parseOrReject ligado — audioUrl agora passa por
 * isSafeHttpsUrl (bloqueia SSRF p/ localhost/RFC-1918/link-local) antes do
 * fetch. Validacao manual truthy-check substituida pelo gate de contrato.
 */
import { parseOrReject } from '../_shared/contract-kit.ts';
import { CONTRACT_SCHEMAS } from '../_shared/contract-schemas.ts';

Deno.serve(async (req) => {
  const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') || '';
  const HEALTH_SECRET      = Deno.env.get('HEALTH_SECRET') || '';
  const SUPABASE_URL       = Deno.env.get('SELFHOSTED_SUPABASE_URL') || Deno.env.get('SUPABASE_URL') || '';
  const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') || '';

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-internal-secret'
    }});
  }

  const internalSecret = req.headers.get('x-internal-secret') || '';
  if (!HEALTH_SECRET || internalSecret !== HEALTH_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!ELEVENLABS_API_KEY) {
    return Response.json({ error: 'ELEVENLABS_API_KEY not configured' }, { status: 503 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = parseOrReject(
    'transcribe-audio-internal',
    CONTRACT_SCHEMAS['transcribe-audio-internal'],
    req,
    rawBody,
  );
  if (parsed.ok === false) return parsed.response;
  const { messageId, audioUrl } = parsed.data as { messageId: string; audioUrl: string };

  try {
    // --- Fetch audio ---
    let audioRes;
    try {
      // Hotfix (auditoria 2026-08-21, Bloco 5.1 / SEC-2): isSafeHttpsUrl só valida
      // a URL declarada no payload — sem redirect:'error', um 302 do host de
      // destino pra 169.254.169.254/127.0.0.1/RFC-1918 era seguido automaticamente
      // (comportamento default 'follow' do fetch), contornando o guard SSRF por
      // completo. Os outros 6 fetches SSRF-guardados do repo (ai-router,
      // batch-fetch-avatars, fetch-whatsapp-avatar, voice-changer,
      // _shared/evolution-media.ts, _shared/evolution-webhook-messages.ts) já
      // usam redirect:'error' — este era o único que faltava.
      audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(25000), redirect: 'error' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'timeout';
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', 'audio_fetch_error', msg);
      return Response.json({ error: 'Audio fetch error: ' + msg }, { status: 502 });
    }
    if (!audioRes.ok) {
      const code = 'audio_http_' + audioRes.status;
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', code, 'HTTP ' + audioRes.status);
      return Response.json({ error: 'Audio fetch failed: ' + audioRes.status }, { status: 502 });
    }

    let audioBlob;
    try {
      audioBlob = await audioRes.blob();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error';
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', 'blob_read_error', msg);
      return Response.json({ error: 'Blob read error: ' + msg }, { status: 502 });
    }
    if (!audioBlob || audioBlob.size === 0) {
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', 'empty_audio', 'Blob vazio (0 bytes)');
      return Response.json({ error: 'Empty audio blob' }, { status: 502 });
    }

    // --- v6: Detectar formato real por magic bytes ---
    const { filename, mimeType } = await detectAudioFormat(audioBlob, audioUrl);

    // --- Submit ao ElevenLabs ---
    const formData = new FormData();
    const typedBlob = new Blob([audioBlob], { type: mimeType });
    formData.append('file', typedBlob, filename);
    formData.append('model_id', 'scribe_v2');
    formData.append('language_code', 'pt');

    let elevenRes;
    try {
      elevenRes = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: formData,
        signal: AbortSignal.timeout(90000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'error';
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', 'elevenlabs_timeout', msg);
      return Response.json({ error: 'ElevenLabs timeout: ' + msg }, { status: 502 });
    }

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => '');
      let errCode = 'elevenlabs_' + elevenRes.status;
      try { const j = JSON.parse(errText); if (j?.detail?.code) errCode = j.detail.code; } catch (_) {}
      await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', errCode, errText.slice(0, 300));
      return Response.json({ error: 'ElevenLabs error: ' + elevenRes.status, detail: errText.slice(0, 400), detectedFormat: mimeType }, { status: 502 });
    }

    const result = await elevenRes.json();
    const transcription = result.text || '';
    await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, transcription, 'done');
    return Response.json({ ok: true, messageId, chars: transcription.length, preview: transcription.slice(0, 120), detectedFormat: mimeType });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[v6] unhandled error for', messageId, ':', err);
    await updateTranscription(SUPABASE_URL, SERVICE_ROLE_KEY, messageId, null, 'failed', 'internal_error', msg).catch(() => {});
    return Response.json({ error: 'Internal error', detail: msg, messageId }, { status: 500 });
  }
});

/** Detecta formato real por magic bytes e retorna filename+mimeType corretos */
async function detectAudioFormat(blob: Blob, audioUrl: string): Promise<{ filename: string; mimeType: string }> {
  const baseFilename = (audioUrl.split('/').pop() || 'audio').split('?')[0];
  const stem = baseFilename.replace(/\.[^.]+$/, ''); // remove extensao original

  try {
    const headerBuf = await blob.slice(0, 12).arrayBuffer();
    const h = new Uint8Array(headerBuf);

    // OGG: OggS = 4F 67 67 53
    if (h[0]===0x4F && h[1]===0x67 && h[2]===0x67 && h[3]===0x53)
      return { filename: stem + '.ogg', mimeType: 'audio/ogg' };

    // MP3: sync word FF E* ou FF F*
    if (h[0]===0xFF && (h[1]&0xE0)===0xE0)
      return { filename: stem + '.mp3', mimeType: 'audio/mpeg' };

    // WAV: RIFF....WAVE
    if (h[0]===0x52 && h[1]===0x49 && h[2]===0x46 && h[3]===0x46)
      return { filename: stem + '.wav', mimeType: 'audio/wav' };

    // FLAC: fLaC
    if (h[0]===0x66 && h[1]===0x4C && h[2]===0x61 && h[3]===0x43)
      return { filename: stem + '.flac', mimeType: 'audio/flac' };

    // AAC/M4A: ftyp box
    if (h[4]===0x66 && h[5]===0x74 && h[6]===0x79 && h[7]===0x70)
      return { filename: stem + '.m4a', mimeType: 'audio/mp4' };

    // ID3 tag (MP3 com header ID3)
    if (h[0]===0x49 && h[1]===0x44 && h[2]===0x33)
      return { filename: stem + '.mp3', mimeType: 'audio/mpeg' };

  } catch (_) { /* Se falhar na leitura, usa extensao original */ }

  // Fallback: extensao da URL
  return { filename: baseFilename, mimeType: 'audio/ogg' };
}

async function updateTranscription(
  supabaseUrl: string,
  serviceKey: string,
  messageId: string,
  text: string | null,
  status: string,
  errorCode?: string,
  errorReason?: string,
) {
  try {
    const body: Record<string, unknown> = { p_message_id: messageId, p_transcription: text, p_status: status };
    if (errorCode !== undefined) body.p_error_code = errorCode || null;
    if (errorReason !== undefined) body.p_error_reason = errorReason || null;
    const res = await fetch(supabaseUrl + '/rest/v1/rpc/set_audio_transcription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + serviceKey, 'apikey': serviceKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error('[updateTranscription] HTTP', res.status, 'for', messageId);
  } catch (err: unknown) {
    console.error('[updateTranscription] error for', messageId, ':', err instanceof Error ? err.message : err);
  }
}
