import { handleCors, errorResponse, requireEnv, Logger, getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { ElevenLabsStsV1Schema } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("elevenlabs-sts");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    // Speech-to-speech is expensive; enforce strict per-user rate limit
    const rl = checkRateLimit(`elevenlabs-sts:${authed.user.id}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const ELEVENLABS_API_KEY = requireEnv('ELEVENLABS_API_KEY');

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const voiceId = formData.get('voiceId') as string | null;
    const modelId = formData.get('modelId') as string | null;

    // Contrato elevenlabs-sts@v1 (estrito): body montado do FormData (multipart).
    // O schema exige audio (File), voiceId e modelId com charset seguro.
    const parsed = parseOrReject('elevenlabs-sts', { v1: ElevenLabsStsV1Schema }, req, {
      audio: audioFile ?? undefined,
      voiceId: voiceId ?? '',
      modelId: modelId ?? '',
    }, { extraHeaders: getCorsHeaders(req) });
    if (!parsed.ok) return parsed.response;
    if (!audioFile) return errorResponse('Audio file is required', 400, req);
    if (!voiceId) return errorResponse('Valid voice ID is required', 400, req);

    const selectedModel = (modelId && modelId.length <= 100) ? modelId : 'eleven_multilingual_sts_v2';

    log.info("Converting audio", { size: audioFile.size, voiceId, model: selectedModel });

    const apiFormData = new FormData();
    apiFormData.append('audio', audioFile);
    apiFormData.append('model_id', selectedModel);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: apiFormData,
        signal: AbortSignal.timeout(60_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      log.error("ElevenLabs STS error", { status: response.status, detail: errorText.substring(0, 300) });
      if (response.status === 401) return errorResponse('Invalid ElevenLabs API key', 401, req);
      if (response.status === 429) return errorResponse('Rate limit exceeded', 429, req);
      throw new Error(`ElevenLabs STS error: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    log.done(200, { outputSize: audioBuffer.byteLength });

    return new Response(audioBuffer, {
      headers: { ...getCorsHeaders(req), 'Content-Type': 'audio/mpeg' },
    });
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
