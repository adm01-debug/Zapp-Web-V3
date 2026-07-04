import { handleCors, errorResponse, jsonResponse, checkRateLimit, getClientIP, requireEnv, Logger } from "../_shared/validation.ts";
import { TranscribeAudioSchema, parseBody } from "../_shared/schemas.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireUser } from "../_shared/auth.ts";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

// F7 security fix (v3): SSRF guard — block private/reserved IPv4 and IPv6 ranges.
// RFC 5735/5156. Note: URL.hostname returns '[::1]' (brackets) for IPv6 literals.
// v3: added 0.0.0.0/8 (unspecified) and 169.254.0.0/16 (link-local) to IPv4 regex.
function isSafeAudioUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    // Private/reserved IPv4 (RFC 5735): 0/8, 10/8, 127/8, 169.254/16, 172.16-31/12, 192.168/16
    if (/^(0\.|10\.|127\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(h)) return false;
    // Named loopback and unspecified
    if (h === 'localhost' || h === '0.0.0.0') return false;
    // IPv6 loopback and private ranges (URL.hostname includes brackets: '[::1]', '[fe80:...]')
    if (h === '[::1]' || h === '::1') return false;
    if (/^\[?(fe80:|fc00:|fd[0-9a-f]{2}:)/i.test(h)) return false;
    // Cloud metadata services
    if (h === '169.254.169.254' || h === 'metadata.google.internal') return false;
    return true;
  } catch { return false; }
}

/**
 * If the URL points to our own Supabase storage, download via the
 * service-role client so we never hit expired-token issues.
 */
async function downloadAudio(
  audioUrl: string,
  log: Logger,
): Promise<{ buffer: ArrayBuffer; contentType: string } | { error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const isOwnStorage = audioUrl.includes(supabaseUrl) && audioUrl.includes("/storage/v1/");

  if (isOwnStorage) {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

  // Fallback: direct HTTP fetch — F7 SSRF guard applied
  if (!isSafeAudioUrl(audioUrl)) {
    log.warn("Blocked unsafe audio URL", { prefix: audioUrl.substring(0, 30) });
    return { error: "Download failed" }; // generic — no URL disclosure
  }

  const response = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
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

  const buffer = await response.arrayBuffer();
  return { buffer, contentType: response.headers.get("content-type") || "audio/mpeg" };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Called both internally (evolution-webhook → service role) and from frontend (user JWT).
  const bearer = req.headers.get("Authorization")?.slice(7).trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isInternal = bearer && serviceKey && bearer === serviceKey;
  if (!isInternal) {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
  }

  const log = new Logger("ai-transcribe-audio");

  try {
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
      return errorResponse(downloadResult.error, 400, req);
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
