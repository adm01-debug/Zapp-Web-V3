// audio-transcribe v2.2 (Self-Hosted, vault-aware) — migrado de Cloud Fator X
// v2.1: F6 security fix — SSRF guard in fetchAudioWithCap (isSafeAudioUrl)
// v2.2: refactor — dependências migradas dos módulos -legacy para os canônicos
//       (`auth.ts`, `validation.ts`, `vault.ts`). Sem mudança de comportamento:
//       mantém heavy=5 req/60s por usuário, preflight CORS via cors.ts,
//       jsonResponse/errorResponse do cors.ts (assinatura req-first).
// v2.3 (2026-08-04): versionado no repo — contrato Zod registrado em
//       CONTRACT_SCHEMAS['audio-transcribe'] com gate parseOrReject (422
//       unificado). O schema do body agora é AudioTranscribeV1Schema (registro
//       canônico, espelho fiel do TranscribeInput inline v2.2).
import { handleCorsPreflight, jsonResponse, errorResponse, getCorsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/validation.ts";
import { getSecret } from "../_shared/vault.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

const VERSION = "v2.3-self-hosted";
const WHISPER_MODEL = 'openai/whisper-large-v3-turbo';
const WHISPER_TIMEOUT_MS = 30000;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB
// Rate limit "heavy" (equivalente a RATE_LIMITS.heavy do rate-limiter-legacy):
// 5 requisições por janela de 60s por usuário. Preserva a semântica exata pré-refactor.
const RL_MAX = 5;
const RL_WINDOW_MS = 60_000;

/**
 * Returns true only for HTTPS URLs pointing outside loopback / link-local /
 * private / metadata ranges. Prevents SSRF to AWS metadata, internal services,
 * or non-HTTPS protocols.
 *
 * REALIDADE DO DENO (verificado 2026-08-04, validação Claude #783): URL.hostname
 * devolve IPv6 COM colchetes — `new URL('https://[::1]/').hostname === '[::1]'`
 * (o comentário v2.2 dizia "bracketless", o que era FALSO). Por isso o guard
 * normaliza stripando `[` `]` ANTES de testar (o padrão antigo `host.startsWith('::')`
 * nunca casava → GAP de SSRF em IPv6: `https://[::1]/...` passava).
 */
function isSafeAudioUrl(raw: string): boolean {
  let parsed: URL;
  try { parsed = new URL(raw); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); // strip colchetes IPv6 + trailing dot (FQDN localhost. — probe 2026-08-04)
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '0.0.0.0' ||
    /^127\./.test(host) ||
    /^169\.254\./.test(host) ||            // AWS/GCP/Azure metadata + link-local
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.startsWith('::') ||               // loopback ::1, unspecified ::, IPv4-compat/mapped
    /^fe[89ab][0-9a-f]:/i.test(host) ||   // link-local fe80::/10 (fe80–febf)
    /^fec[0-9a-f]:/i.test(host) ||        // site-local fec0::/10
    /^f[cd][0-9a-f]{2}:/i.test(host)      // ULA fc00::/7 (fc+fd)
  ) return false;
  return true;
}

/**
 * Stream a remote audio URL into a Uint8Array while enforcing the byte cap.
 * Avoids buffering the entire response in memory before checking size.
 * F6: SSRF guard applied before fetch — blocks private ranges.
 */
async function fetchAudioWithCap(url: string, maxBytes: number): Promise<Uint8Array | null> {
  // redirect: 'error' prevents SSRF bypass via server-side redirects to private IPs.
  // isSafeAudioUrl validates the initial URL; without this flag a redirect could
  // silently forward the request to 169.254.169.254 or internal addresses.
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
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

Deno.serve(async (req) => {
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
    // Auth obrigatório (novo helper: retorna Response quando 401, senão { user })
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const { user } = authed;

    // Rate limit (heavy: 5/min/user) — in-memory por isolate, comportamento equivalente ao legacy.
    const rateCheck = checkRateLimit(`audio-transcribe:user:${user.id}`, RL_MAX, RL_WINDOW_MS);
    if (!rateCheck.allowed) {
      return errorResponse(req, 'Rate limit exceeded', 429, { retryAfterSeconds: 60 });
    }

    // Contrato audio-transcribe@v1 (estrito) — envelope 422 unificado.
    // v2.3: gate parseOrReject no lugar do parseBody inline (mesmos campos e
    // refine audio_base64|audio_url — espelhados em AudioTranscribeV1Schema).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('audio-transcribe', CONTRACT_SCHEMAS['audio-transcribe'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, any>;
    const { action, audio_base64, audio_url, language, format } = body;

    // Resolve HF token (env-first, vault fallback)
    const hfToken = await getSecret('hf_api_token');
    if (!hfToken) {
      return errorResponse(req, 'HF_API_TOKEN not configured (set env var or populate vault.secrets[hf_api_token])', 503);
    }

    // Carrega audio bytes — enforce cap BEFORE buffering to prevent memory exhaustion
    let audioBytes: Uint8Array;
    if (audio_base64) {
      const raw64 = atob(audio_base64);
      if (raw64.length > MAX_AUDIO_BYTES) {
        return errorResponse(req, 'Audio file exceeds 25MB limit', 413);
      }
      audioBytes = new Uint8Array(raw64.length);
      for (let i = 0; i < raw64.length; i++) audioBytes[i] = raw64.charCodeAt(i);
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
      // Cast BlobPart: Deno strict tipa Uint8Array como ArrayBufferLike (inclui
      // SharedArrayBuffer) e o construtor Blob exige ArrayBuffer — runtime é
      // idêntico, só a assinatura de tipo diverge.
      formData.append('inputs', new Blob([audioBytes as BlobPart], { type: 'audio/wav' }), 'audio.wav');
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
