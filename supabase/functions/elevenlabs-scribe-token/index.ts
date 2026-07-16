import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-scribe-token");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`elevenlabs-scribe-token:${authed.user.id}`, 20, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');

    log.info("Requesting ElevenLabs realtime scribe token");

    const response = await fetch('https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs token error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse('Invalid ElevenLabs API key', 401, req);
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      return errorResponse('Failed to get transcription token', 500, req);
    }

    const data = await response.json();
    log.done(200);
    return jsonResponse({ token: data.token }, 200, req);
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
