// audio-transcribe v2.0 (Self-Hosted, vault-aware) — migrado de Cloud Fator X
// Mudanças: lê HF_API_TOKEN via getSecret() (env-first + vault fallback)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    
    // Carrega audio bytes
    let audioBytes;
    if (audio_base64) {
      const raw = atob(audio_base64);
      audioBytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) audioBytes[i] = raw.charCodeAt(i);
    } else if (audio_url) {
      const resp = await fetch(audio_url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return errorResponse(req, `Failed to fetch audio: ${resp.status}`, 400);
      audioBytes = new Uint8Array(await resp.arrayBuffer());
    } else {
      return errorResponse(req, 'No audio provided', 400);
    }
    
    if (audioBytes.length > MAX_AUDIO_BYTES) {
      return errorResponse(req, 'Audio file exceeds 25MB limit', 413);
    }
    
    // Chama HF Whisper
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
    
    try {
      const hfUrl = `https://router.huggingface.co/hf-inference/models/${WHISPER_MODEL}`;
      const resp = await fetch(hfUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfToken}`, 'Content-Type': 'audio/wav' },
        body: audioBytes,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      
      if (!resp.ok) {
        const errText = await resp.text();
        return errorResponse(req, `Whisper API error: ${errText.slice(0, 500)}`, resp.status);
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
    return errorResponse(req, error instanceof Error ? error.message : 'Internal error', 500);
  }
});
