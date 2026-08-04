import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-dialogue");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`elevenlabs-dialogue:${authed.user.id}`, 10, 60_000);
    if (!rl.allowed) return errorResponse('Rate limit exceeded. Tente novamente em instantes.', 429, req);

    // Contrato elevenlabs-dialogue@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('elevenlabs-dialogue', CONTRACT_SCHEMAS['elevenlabs-dialogue'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, any>;

    // Guarda de compatibilidade: schema registrado é permissivo (placeholder);
    // preserva o 400 do antigo parseBody(ElevenLabsDialogueSchema).
    const { script, languageCode } = body;
    if (!Array.isArray(script) || script.length === 0 || script.length > 100) {
      return errorResponse('script: Required (array 1..100)', 400, req);
    }
    const ELEVENLABS_API_KEY = requireEnv("ELEVENLABS_API_KEY");

    log.info(`Generating dialogue with ${script.length} lines`);

    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-dialogue?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'eleven_v3',
          script,
          language_code: languageCode,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error ${response.status}`, { detail: errorText.substring(0, 300) });

      if (response.status === 401) return errorResponse("Invalid ElevenLabs API key", 401, req);
      if (response.status === 429) return errorResponse("Rate limit exceeded", 429, req);
      return errorResponse(`ElevenLabs Dialogue API error: ${response.status}`, response.status, req);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { bytes: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'audio/mpeg' },
    });
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal server error', 500, req);
  }
});
