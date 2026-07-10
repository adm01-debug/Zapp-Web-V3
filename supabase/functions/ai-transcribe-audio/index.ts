import { handleCors, errorResponse, jsonResponse, checkRateLimit, getClientIP, requireEnv, Logger } from "../_shared/validation.ts";
import { TranscribeAudioSchema, parseBody } from "../_shared/schemas.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireUser, requireServiceRoleOnly } from "../_shared/auth.ts";
import { isSafeMediaCdnUrl } from "../_shared/evolution-media.ts";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * If the URL points to our own Supabase storage, download via the
 * service-role client so we never hit expired-token issues.
 */
async function downloadAudio(
  audioUrl: string,
  log: Logger,
): Promise<{ buffer: ArrayBuffer; contentType: string } | { error: string }> {
  const supabaseUrl = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? "";
  const isOwnStorage = audioUrl.includes(supabaseUrl) && audioUrl.includes("/storage/v1/");

  if (isOwnStorage) {
    const serviceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!serviceKey) {
      log.warn("No service role key – falling back to direct fetch");
    } else {
      const buckets = ["whatsapp-media", "audio-messages"];
      for (const bucket of buckets) {
        const marker = `/${bucket}/`;
        const idx = audioUrl.indexOf(marker);
        if (idx !== -1) {
          const pathWithQuery = audioUrl.substring(idx + marker.length);
          const path = pathWithQuery.split("?")[0];
          log.info("Downloading from storage", { bucket, path });

          const sb = createClient(supabaseUrl, serviceKey);
          const { data, error } = await sb.storage.from(bucket).download(path);
          if (error || !data) {
            log.error("Storage download failed", { error: error?.message });
            return { error: "Storage download failed" };
          }
          const buffer = await data.arrayBuffer();
          return { buffer, contentType: data.type || "audio/ogg" };
        }
      }
    }
  }

  // Fallback: direct HTTP fetch
  // Own Supabase storage URLs are always allowed (service key was absent above).
  // External URLs must pass the allowlist check (WhatsApp CDN only).
  if (!isOwnStorage && !isSafeMediaCdnUrl(audioUrl)) return { error: "Audio URL is not allowed" };

  const response = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    log.error("HTTP download failed", { status: response.status, detail: errText.substring(0, 200) });
    return { error: "Download failed" }; // generic — F7 info-disclosure fix
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_AUDIO_SIZE) {
    await response.body?.cancel();
    return { error: "Audio file too large (max 25MB)" };
  }

  // Stream with running byte counter to guard against chunked responses without Content-Length
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_AUDIO_SIZE) {
        await response.body?.cancel().catch(() => {});
        return { error: "Audio file too large (max 25MB)" };
      }
      chunks.push(chunk);
    }
  } catch (e) {
    log.error("Stream read interrupted", { error: e instanceof Error ? e.message : String(e) });
    return { error: "Download failed" };
  }
  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) { buffer.set(c, offset); offset += c.byteLength; }
  return { buffer: buffer.buffer, contentType: response.headers.get("content-type") || "audio/mpeg" };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("ai-transcribe-audio");

  try {
    // Called both internally (evolution-webhook → service role) and from frontend (user JWT).
    // requireServiceRoleOnly: internal callers bypass user auth; cron-secret is NOT accepted here.
    const internalCheck = requireServiceRoleOnly(req);
    if (internalCheck !== null) {
      const authed = await requireUser(req);
      if (authed instanceof Response) return authed;
    }

    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`transcribe:${ip}`, 10, 60_000);
    if (!allowed) return errorResponse("Limite de transcrições excedido. Tente novamente em 1 minuto.", 429, req);

    const parsed = parseBody(TranscribeAudioSchema, await req.json());
    if (!parsed.success) return errorResponse(parsed.error, 400, req);

    const { audioUrl, messageId, languageCode, enableDiarization, tagAudioEvents } = parsed.data;

    log.info("Starting transcription", { messageId, languageCode });
    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');

    // Download audio (prefers service-role storage download for own URLs)
    const downloadResult = await downloadAudio(audioUrl, log);
    if ("error" in downloadResult) {
      // Server-side download failures get 500; client-supplied bad URLs get 400
      const isClientError = downloadResult.error.startsWith("Invalid") ||
        downloadResult.error.startsWith("Audio URL") ||
        downloadResult.error.startsWith("Audio file too large");
      return errorResponse(downloadResult.error, isClientError ? 400 : 500, req);
    }

    const { buffer: audioBuffer, contentType } = downloadResult;

    if (audioBuffer.byteLength > MAX_AUDIO_SIZE) {
      return errorResponse("Audio file too large (max 25MB)", 400, req);
    }

    // Determine correct MIME type and file extension
    let mimeType = 'audio/mpeg';
    let fileName = 'audio.mp3';

    if (contentType.includes('ogg') || audioUrl.includes('.ogg')) {
      mimeType = 'audio/ogg';
      fileName = 'audio.ogg';
    } else if (contentType.includes('webm') || audioUrl.includes('.webm')) {
      mimeType = 'audio/webm';
      fileName = 'audio.webm';
    } else if (contentType.includes('wav') || audioUrl.includes('.wav')) {
      mimeType = 'audio/wav';
      fileName = 'audio.wav';
    } else if (contentType.includes('m4a') || contentType.includes('mp4') || audioUrl.includes('.m4a')) {
      mimeType = 'audio/mp4';
      fileName = 'audio.m4a';
    } else if (contentType.includes('mpeg') || audioUrl.includes('.mp3')) {
      mimeType = 'audio/mpeg';
      fileName = 'audio.mp3';
    }

    const audioBlob = new Blob([audioBuffer], { type: mimeType });
    log.info("Audio downloaded", { size: audioBlob.size, type: mimeType, originalType: contentType });

    const formData = new FormData();
    formData.append('file', audioBlob, fileName);
    formData.append('model_id', 'scribe_v2');
    formData.append('language_code', languageCode ?? 'pt');
    formData.append('tag_audio_events', String(tagAudioEvents));
    formData.append('diarize', String(enableDiarization));

    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs STT error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 429) return errorResponse("Rate limit exceeded.", 429, req);
      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key.", 401, req);

      if (response.status === 400) {
        return jsonResponse({
          transcription: '',
          messageId,
          words: [],
          audio_events: [],
          speakers: [],
          fallback: true,
          error: 'INVALID_AUDIO',
          errorMessage: 'Não foi possível transcrever este áudio. O formato pode não ser suportado.',
        }, 200, req);
      }
      return errorResponse("Transcription failed", 500, req); // generic — F7 info-disclosure fix
    }

    const data = await response.json();
    log.done(200, { transcriptionLength: data.text?.length || 0 });

    return jsonResponse({
      transcription: data.text || '',
      messageId,
      words: data.words || [],
      audio_events: data.audio_events || [],
      speakers: data.speakers || [],
    }, 200, req);
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
