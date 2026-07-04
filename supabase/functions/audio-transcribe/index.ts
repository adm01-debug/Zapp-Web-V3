// audio-transcribe v2.0 (Self-Hosted, vault-aware) — migrado de Cloud Fator X
// Mudanças: lê HF_API_TOKEN via getSecret() (env-first + vault fallback)
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import {
  handleCorsPreflight, jsonResponse, errorResponse,
  authenticateRequest,
  checkRateLimit, createRateLimitResponse, getRateLimitIdentifier, RATE_LIMITS,
  parseBody, z,
  getSecret,
} from "../_shared/mod.ts";

const VERSION = "v2.0-self-hosted";
const WHISPER_MODEL = 'openai/whisper-large-v3-turbo';
const WHISPER_TIMEOUT_MS = 30000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

const TranscribeInput = z.object({
  action: z.enum(['transcribe', 'translate']).default('transcribe'),
  audio_base64: z.string().min(100).optional(),
  audio_url: z.string().url().optional(),
  language: z.string().min(2).max(5).default('pt'),
  format: z.enum(['text', 'srt', 'vtt', 'json']).default('text'),
}).refine(d => d.audio_base64 || d.audio_url, {
  message: 'Either audio_base64 or audio_url is required',
});

/**
 * Returns true only for HTTPS URLs pointing outside link-local / loopback /
 * metadata ranges. Prevents SSRF to AWS metadata (169.254.169.254), internal
 * services, or non-HTTP protocols.
 */
function isSafeAudioUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  // Block loopback, link-local, private, and metadata service addresses (IPv4 + IPv6)
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||  // AWS/GCP/Azure metadata
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 loopback, link-local, and unique-local (ULA)
    host === '[::1]' ||
    host.startsWith('[fe80:') ||   // link-local
    host.startsWith('[fc00:') ||   // ULA
    host.startsWith('[fd')         // ULA (fd00::/8)
  ) return false;
  return true;
}

/**
 * Stream a remote audio URL into a Uint8Array while enforcing the byte cap.
 * Avoids buffering the entire response in memory before checking size.
 */
async function fetchAudioWithCap(url: string, maxBytes: number): Promise<Uint8Array | null> {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok || !resp.body) return null;

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const reader = resp.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        reader.cancel();
        return null; // signal oversized
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req);

  // Health check público (GET)
  if (req.method === 'GET') {
    const hfAvailable = !!(await getSecret('hf_api_token'));
    return jsonResponse(req, {
      service: 'audio-transcribe',
      version: VERSION,
      status: 'healthy',
      hf_token_configured: hfAvailable,
      model: WHISPER_MODEL,
    });
  }

  if (req.method !== 'POST') {
    return errorResponse(req, 'Method not allowed', 405);
  }

  try {
    // Auth obrigatório
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const { user } = auth;

    // Rate limit (heavy: 5/min/user)
    const identifier = getRateLimitIdentifier(req, user.id);
    const rateCheck = checkRateLimit(identifier, RATE_LIMITS.heavy);
    if (!rateCheck.allowed) return createRateLimitResponse(rateCheck);

    // Body validation
    const parsed = await parseBody(req, TranscribeInput);
    if (parsed.error) return parsed.error;
    const { action, audio_base64, audio_url, language, format } = parsed.data;

    // Resolve HF token (env-first, vault fallback)
    const hfToken = await getSecret('hf_api_token');
    if (!hfToken) {
      return errorResponse(req, 'HF_API_TOKEN not configured (set env var or populate vault.secrets[hf_api_token])', 503);
    }

    // Carrega audio bytes — enforce cap BEFORE buffering to prevent memory exhaustion
    let audioBytes: Uint8Array;
    if (audio_base64) {
      const raw = atob(audio_base64);
      if (raw.length > MAX_AUDIO_BYTES) {
        return errorResponse(req, 'Audio file exceeds 25MB limit', 413);
      }
      audioBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) audioBytes[i] = raw.charCodeAt(i);
    } else if (audio_url) {
      if (!isSafeAudioUrl(audio_url)) {
        return errorResponse(req, 'Invalid or disallowed audio URL', 400);
      }
      const fetched = await fetchAudioWithCap(audio_url, MAX_AUDIO_BYTES);
      if (fetched === null) {
        return errorResponse(req, 'Audio fetch failed or file exceeds 25MB limit', 413);
      }
      audioBytes = fetched;
    } else {
      return errorResponse(req, 'No audio provided', 400);
    }

    // Chama HF Whisper — pass task parameter to enable translation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);

    // Build HF Inference API parameters
    // action='translate' instructs Whisper to translate to English regardless of source language
    const hfParams: Record<string, unknown> = {};
    if (action === 'translate') {
      hfParams.task = 'translation';
    }
    if (format !== 'text') {
      hfParams.return_timestamps = true;
    }

    try {
      const hfUrl = `https://router.huggingface.co/hf-inference/models/${WHISPER_MODEL}`;

      // Send parameters alongside the audio blob
      const formData = new FormData();
      formData.append('inputs', new Blob([audioBytes], { type: 'audio/wav' }), 'audio.wav');
      if (Object.keys(hfParams).length > 0) {
        formData.append('parameters', JSON.stringify(hfParams));
      }

      const resp = await fetch(hfUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfToken}` },
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[audio-transcribe] HuggingFace Whisper error', { status: resp.status, detail: errText.slice(0, 500) });
        if (resp.status === 429) return errorResponse(req, 'Transcription rate limit exceeded', 429);
        if (resp.status === 503) return errorResponse(req, 'Transcription service temporarily unavailable', 503);
        return errorResponse(req, 'Audio transcription failed', 502);
      }

      const result = await resp.json();
      const text = result.text || '';

      return jsonResponse(req, {
        ok: true,
        text: text.trim(),
        language, action, format,
        model: WHISPER_MODEL,
        audio_size_bytes: audioBytes.length,
        version: VERSION,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('[audio-transcribe] unhandled error:', error);
    return errorResponse(req, 'Internal server error', 500);
  }
});
