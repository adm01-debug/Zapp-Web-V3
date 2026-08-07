import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-tts-stream");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`elevenlabs-tts:${authed.user.id}`, 20, 60_000);
    if (!rl.allowed) return errorResponse('Rate limit exceeded. Tente novamente em instantes.', 429, req);

    // Contrato elevenlabs-tts-stream@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('elevenlabs-tts-stream', CONTRACT_SCHEMAS['elevenlabs-tts-stream'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, any>;

    // Guarda de compatibilidade: schema registrado é permissivo (placeholder);
    // preserva o 400 do antigo parseBody(ElevenLabsTTSSchema).
    const { text, voiceId, modelId, languageCode, applyTextNormalization } = body;
    if (typeof text !== 'string' || text.length === 0 || text.length > 10000) {
      return errorResponse('text: Required (1..10000)', 400, req);
    }
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    const selectedVoiceId = voiceId || 'TY3h8ANhQUsJaa0Bga5F';
    const selectedModel = modelId || 'eleven_flash_v2_5';

    log.info(`Streaming TTS: "${text.substring(0, 50)}..." voice: ${selectedVoiceId}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/stream?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: selectedModel,
          language_code: languageCode,
          apply_text_normalization: applyTextNormalization || 'auto',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error("Streaming API error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    log.done(200);
    return new Response(response.body, {
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
