// elevenlabs-voice
// Contrato (frontend src/components/voice/ElevenLabsVoiceDesign.tsx):
//   IN  { action: 'listVoices' }                                  -> { voices: [{ voice_id, name, category }] }
//   IN  { action: 'textToSpeech', voiceId, text, settings? }      -> { audioBase64: string }  (mp3)
//
// Observação: a função existente elevenlabs-tts retorna BYTES de áudio; este
// componente espera base64 (faz new Audio('data:audio/mpeg;base64,'+audioBase64)).
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

/** Codifica ArrayBuffer em base64 em chunks (evita estouro de call stack). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-voice");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const ip = getClientIP(req);
    const rl = checkRateLimit(`voice:${ip}`, 20, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const body = await req.json().catch(() => null);
    const action: string = body?.action ?? "listVoices";
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    if (action === "listVoices") {
      const resp = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        const detail = (await resp.text().catch(() => "")).substring(0, 200);
        log.error("listVoices error", { status: resp.status, detail });
        if (resp.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
        return errorResponse("Falha ao listar vozes", 502, req);
      }
      const data = await resp.json();
      const voices = (data.voices ?? []).map((v: Record<string, unknown>) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category ?? "premade",
      }));
      log.done(200, { count: voices.length });
      return jsonResponse({ voices }, 200, req);
    }

    if (action === "textToSpeech") {
      const text: string = body?.text ?? "";
      const voiceId: string = body?.voiceId ?? "";
      if (!text || !voiceId) return errorResponse("'text' e 'voiceId' são obrigatórios.", 400, req);

      const s = body?.settings ?? {};
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            model_id: s.modelId || "eleven_multilingual_v2",
            voice_settings: {
              stability: typeof s.stability === "number" ? s.stability : 0.5,
              similarity_boost: typeof s.similarityBoost === "number" ? s.similarityBoost : 0.75,
              style: typeof s.style === "number" ? s.style : 0.3,
              use_speaker_boost: s.useSpeakerBoost !== false,
            },
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );

      if (!resp.ok) {
        const detail = (await resp.text().catch(() => "")).substring(0, 300);
        log.error("textToSpeech error", { status: resp.status, detail });
        if (resp.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
        if (resp.status === 429) return errorResponse("Rate limit exceeded", 429, req);
        return errorResponse("Falha ao gerar áudio", 502, req);
      }

      const audioBase64 = bufferToBase64(await resp.arrayBuffer());
      log.done(200, { bytes: audioBase64.length });
      return jsonResponse({ audioBase64 }, 200, req);
    }

    return errorResponse(`Ação desconhecida: ${action}`, 400, req);
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
