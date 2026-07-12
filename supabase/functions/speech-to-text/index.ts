// speech-to-text
// Contrato (frontend src/hooks/useAudioRecorder.ts):
//   IN : { audio: <base64>, languageCode?: string }
//   OUT: { text: string }
//
// Fallback de transcrição on-demand a partir de áudio inline (base64).
// Modelado em ai-transcribe-audio (mesmo provider ElevenLabs Scribe), porém
// aceitando o áudio embutido em vez de exigir uma URL de storage.
import {
  handleCors,
  errorResponse,
  jsonResponse,
  checkRateLimit,
  getClientIP,
  requireEnv,
  Logger,
} from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";

const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB

/** Decodifica base64 (com ou sem prefixo data:) em bytes, em chunks seguros. */
function base64ToBytes(b64: string): Uint8Array {
  const comma = b64.indexOf(",");
  const clean = b64.startsWith("data:") && comma !== -1 ? b64.slice(comma + 1) : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("speech-to-text");

  try {
    const ip = getClientIP(req);
    const { allowed } = checkRateLimit(`stt:${ip}`, 10, 60_000);
    if (!allowed) return errorResponse("Limite de transcrições excedido. Tente novamente em 1 minuto.", 429, req);

    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const body = await req.json().catch(() => null);
    if (!body || typeof body.audio !== "string" || body.audio.length === 0) {
      return errorResponse("Campo 'audio' (base64) é obrigatório.", 400, req);
    }
    const languageCode: string = typeof body.languageCode === "string" ? body.languageCode : "pt";

    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const bytes = base64ToBytes(body.audio);
    if (bytes.byteLength === 0) return errorResponse("Áudio vazio ou inválido.", 400, req);
    if (bytes.byteLength > MAX_AUDIO_SIZE) return errorResponse("Audio file too large (max 25MB)", 400, req);

    const audioBlob = new Blob([bytes], { type: "audio/webm" });
    log.info("Transcribing inline audio", { size: audioBlob.size, languageCode });

    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model_id", "scribe_v2");
    formData.append("language_code", languageCode);
    formData.append("tag_audio_events", "false");
    formData.append("diarize", "false");

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).substring(0, 300);
      log.error("ElevenLabs STT error", { status: response.status, detail });
      if (response.status === 429) return errorResponse("Rate limit exceeded.", 429, req);
      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key.", 401, req);
      // Degradação suave: o frontend trata `text` vazio sem quebrar a UX.
      return jsonResponse({ text: "", fallback: true, error: "TRANSCRIPTION_FAILED" }, 200, req);
    }

    const data = await response.json();
    const text: string = data.text || "";
    log.done(200, { length: text.length });

    return jsonResponse({ text }, 200, req);
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      log.warn("ElevenLabs STT request timed out, returning fallback");
      return jsonResponse({ text: "", fallback: true, error: "TRANSCRIPTION_TIMEOUT" }, 200, req);
    }
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
