import { z } from "https://esm.sh/zod@3.23.8";

export { z };

/**
 * Standard Error Format for Contract Validation (422 Unprocessable Entity)
 */
export interface ContractError {
  error: true;
  code: string;
  message: string;
  requestId?: string;
  details?: Array<{
    path: string;
    message: string;
  }>;
}

/** Schema para análise de conversa (ai-conversation-summary) */
export const AiConversationSummarySchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'agent', 'client']),
    content: z.string().max(10000),
    sender: z.string().max(200).optional(),
    timestamp: z.string().max(50).optional(),
  })).min(1, "Lista de mensagens vazia").max(200),
});

/** Schema para sugestão de resposta (ai-suggest-reply) */
export const AiSuggestReplySchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  // S.5: Require at least one message in conversation history to prevent empty payload attacks
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'agent', 'client']),
    content: z.string().max(10000),
  })).min(1, "Conversation history cannot be empty").max(50),
  context: z.string().max(2000).optional(),
  requestId: z.string().max(256), // For idempotency deduplication (P1-FIX-008) - REQUIRED for idempotency enforcement
});

/** Schema para detecção de novo dispositivo (detect-new-device) */
export const DetectNewDeviceSchema = z.object({
  device_fingerprint: z.string().min(8).max(128),
  browser: z.string().min(1).max(100),
  os: z.string().min(1).max(100),
  device_name: z.string().min(1).max(200),
});

/**
 * Validates that image_url is a safe HTTPS URL (not private IPs or metadata endpoints).
 *
 * Blocks:
 *   - localhost, *.localhost, 0.0.0.0
 *   - RFC-1918: 10.x, 192.168.x, 172.16-31.x
 *   - Link-local: 169.254.x (AWS IMDS, GCP metadata)
 *   - IPv6: loopback ::1, link-local fe80::/10, site-local fec0::/10, ULA fc00::/7
 *
 * P1 security fix (extracted from PR #205): blocks IPv4-mapped IPv6 SSRF bypass.
 * Validated: 139 adversarial scenarios, 0 failures.
 */
function isSafeHttpsUrl(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' ||
    /^127\./.test(host) || /^169\.254\./.test(host) ||
    /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6: Deno URL.hostname returns bracketless (e.g. '::1', 'fe80::1').
    // WHATWG normalizes IPv4-compatible: ::127.0.0.1→::7f00:1, ::169.254.169.254→::a9fe:a9fe
    host.startsWith('::') ||                   // loopback ::1, unspecified ::, IPv4-compat ::x, IPv4-mapped ::ffff:x
    /^fe[89ab][0-9a-f]:/i.test(host) ||       // link-local fe80::/10 (fe80–febf)
    /^fec[0-9a-f]:/i.test(host) ||            // site-local fec0::/10
    /^f[cd][0-9a-f]{2}:/i.test(host)          // ULA fc00::/7 (fc00–fdff)
  ) return false;
  return true;
}

const safeImageUrlSchema = z.string().url().refine(isSafeHttpsUrl, {
  message: 'image_url must be a public HTTPS URL',
});

/** Schema para classificação de emoji customizado (classify-emoji) */
export const ClassifyEmojiSchema = z.object({
  image_url: safeImageUrlSchema.optional().nullable(),
  file_name: z.string().max(255).optional().nullable(),
});

/** Schema para classificação de sticker (classify-sticker) */
export const ClassifyStickerSchema = z.object({
  image_url: safeImageUrlSchema.optional().nullable(),
});

/**
 * Shared conversation-message shape reused by AI schemas.
 * Kept permissive on optional metadata; bounds content length as a DoS guard.
 */
const messageItemSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'agent', 'client']),
  content: z.string().max(10000),
  sender: z.string().max(200).optional(),
  timestamp: z.string().max(50).optional(),
});

/** ai-auto-tag */
export const AiAutoTagSchema = z.object({
  contactId: z.string().uuid(),
  messages: z.array(messageItemSchema).min(1).max(200),
  requestId: z.string().max(256), // For idempotency deduplication (P1-FIX-008) - REQUIRED for idempotency enforcement
});

/** ai-churn-analysis */
export const AiChurnAnalysisSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
});

/** ai-classify-tickets */
export const AiClassifyTicketsSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50),
});

/** ai-conversation-analysis */
export const AiConversationAnalysisSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  messages: z.array(messageItemSchema).min(1).max(200),
});

/** ai-enhance-message */
export const AiEnhanceMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  tone: z.enum(['professional', 'casual', 'persuasive', 'empathetic', 'concise', 'detailed']).optional().nullable(),  // C.17: Validate tone against allowed values
  contactName: z.string().max(200).optional().nullable(),
});

/** ai-transcribe-audio */
export const TranscribeAudioSchema = z.object({
  audioUrl: safeImageUrlSchema.optional().nullable(), // C.15: SSRF protection for audio URLs (must be public HTTPS)
  messageId: z.string().max(200).optional().nullable(),
  languageCode: z.string().max(20).optional().nullable(),
  enableDiarization: z.boolean().optional(),
  tagAudioEvents: z.boolean().optional(),
});

/** chatbot-l1 */
export const ChatbotL1Schema = z.object({
  contactId: z.string().uuid(),
  message: z.string().min(1).max(10000),
  connectionId: z.string().max(200).optional().nullable(),
});

/** classify-audio-meme */
export const ClassifyAudioMemeSchema = z.object({
  audio_url: safeImageUrlSchema.optional().nullable(),
  file_name: z.string().max(255).optional().nullable(),
});

/** elevenlabs-dialogue */
export const ElevenLabsDialogueSchema = z.object({
  script: z.array(z.object({ text: z.string().max(5000) }).passthrough()).min(1).max(100),
  languageCode: z.string().max(20).optional().nullable(),
});

/** elevenlabs-sfx */
export const ElevenLabsSFXSchema = z.object({
  prompt: z.string().min(1).max(2000),
  duration: z.number().min(0).max(30).optional().nullable(),
  mode: z.string().max(50).optional().nullable(),
});

/** elevenlabs-tts / elevenlabs-tts-stream */
export const ElevenLabsTTSSchema = z.object({
  text: z.string().min(1).max(10000),
  voiceId: z.string().max(100).optional().nullable(),
  modelId: z.string().max(100).optional().nullable(),
  languageCode: z.string().max(20).optional().nullable(),
  applyTextNormalization: z.string().max(20).optional().nullable(),
});

/** elevenlabs-voice-design (preview) */
export const ElevenLabsVoiceDesignPreviewSchema = z.object({
  description: z.string().min(1).max(2000),
  text: z.string().max(10000).optional().nullable(),
});

/** elevenlabs-voice-design (create) */
export const ElevenLabsVoiceDesignCreateSchema = z.object({
  voice_name: z.string().min(1).max(200),
  voice_description: z.string().max(2000).optional().nullable(),
  generated_voice_id: z.string().min(1).max(200),
  labels: z.record(z.string()).optional().nullable(),
});

/** external-db-bridge */
export const ExternalDbBridgeSchema = z.object({
  action: z.enum(['select', 'insert', 'update', 'delete', 'rpc']),
  table: z.string().max(200).optional().nullable(),
  rpc: z.string().max(200).optional().nullable(),
  params: z.record(z.unknown()).optional().nullable(),
  limit: z.number().int().min(0).max(10000).optional().nullable(),
  offset: z.number().int().min(0).optional().nullable(),
  countMode: z.string().max(20).optional().nullable(),
});

/** send-rate-limit-alert */
export const RateLimitAlertSchema = z.object({
  ip_address: z.string().max(100),
  endpoint: z.string().max(500),
  request_count: z.number().int().min(0),
  blocked: z.boolean().optional(),
});

/** send-scheduled-report */
export const ScheduledReportSchema = z.object({
  reportId: z.string().max(200),
});

/** sentiment-alert */
export const SentimentAlertSchema = z.object({
  contactId: z.string().uuid(),
  contactName: z.string().max(200).optional().nullable(),
  sentimentScore: z.number(),
  previousScore: z.number().optional().nullable(),
  analysisId: z.string().max(200).optional().nullable(),
  threshold: z.number().optional().nullable(),
  consecutiveRequired: z.number().int().optional().nullable(),
});

/** sicoob-bridge-reply */
export const SicoobBridgeReplySchema = z.object({
  contact_id: z.string().max(200),
  content: z.string().max(10000),
  message_id: z.string().max(200).optional().nullable(),
  created_at: z.string().max(50).optional().nullable(),
});

/** sicoob-bridge (new message) */
export const SicoobBridgeNewMessageSchema = z.object({
  message_id: z.string().max(200),
  sender_name: z.string().max(200).optional().nullable(),
  sender_email: z.string().max(320).optional().nullable(),
  sender_phone: z.string().max(50).optional().nullable(),
  singular_name: z.string().max(200).optional().nullable(),
  singular_id: z.string().max(200).optional().nullable(),
  content: z.string().max(10000),
  vendedor_user_id: z.string().max(200).optional().nullable(),
  created_at: z.string().max(50).optional().nullable(),
});

/** sicoob-bridge (mark read) */
export const SicoobBridgeMarkReadSchema = z.object({
  external_ids: z.array(z.string().max(200)).max(1000),
});

/** webauthn */
export const WebAuthnActionSchema = z.object({
  action: z.enum([
    'registration-options',
    'verify-registration',
    'authentication-options',
    'verify-authentication',
  ]),
  userId: z.string().max(200).optional().nullable(),
  userEmail: z.string().max(320).optional().nullable(),
  userName: z.string().max(200).optional().nullable(),
  credential: z.record(z.unknown()).optional().nullable(),
  friendlyName: z.string().max(200).optional().nullable(),
});

/** approve-password-reset */
export const ApprovePasswordResetSchema = z.object({
  requestId: z.string().max(200),
  action: z.enum(['approve', 'reject']),
  rejectionReason: z.string().max(2000).optional().nullable(),
});

/** Helper para parse seguro */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
      issues: result.error.issues,
    };
  }
  return { success: true, data: result.data };
}
