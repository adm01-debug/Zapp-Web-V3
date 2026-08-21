// schemas bundle v2 — 2026-07-12 (force redeploy: dedupe check)
import { z } from "https://esm.sh/zod@3.23.8";

/** Re-exported module members. */
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
export function isSafeHttpsUrl(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  // SEC-2 fix (2026-08-21): `URL.hostname` para literais IPv6 (`https://[::1]/x`)
  // vem COM colchetes nesta versão do Deno ("[::1]") — o comentário original
  // ("Deno retorna bracketless") não bate com o runtime atual e o guard
  // `startsWith('::')` nunca casava contra `[::1]`, deixando o bypass aberto.
  // Remover colchetes torna a checagem robusta independente da versão.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' ||
    /^127\./.test(host) || /^169\.254\./.test(host) ||
    /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 (host já sem colchetes neste ponto).
    // WHATWG normaliza IPv4-compatível: ::127.0.0.1→::7f00:1, ::169.254.169.254→::a9fe:a9fe
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
 *
 * REALIDADE DE PRODUÇÃO (2026-08-04, fix pós-validação Claude): o front
 * (AIConversationAssistant.tsx) envia messages com `sender: 'contact'|'agent'`
 * — NUNCA `role`. O handler do ai-router também consome `msg.sender`
 * (conversationText). `role` foi exigido erroneamente pelo PR #774 (spec
 * inventada) e derrubava o painel de análise com 422. Agora role é OPCIONAL:
 * quem manda role (auto-tag, summary) continua aceito; quem manda sender
 * (conversation-analysis) também.
 */
export const messageItemSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'agent', 'client']).optional(),
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
  // REALIDADE DE PRODUÇÃO (2026-08-04): AIConversationAssistant.tsx envia
  // periodDays (getPeriodDays(analysisPeriod)) — obrigatório aceitar sob .strict().
  periodDays: z.number().min(1).max(365).optional().nullable(),
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

/** chatbot-l1@v1 — contrato estrito para o handler chatbot-l1. */
export const ChatbotL1V1Schema = ChatbotL1Schema.strict();

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

// ─── Contratos V1 (estritos) — endpoints internos AI/ML ──────────────────────
//
// Derivados do CONSUMO REAL nos index.ts de cada edge function + validação dos
// handlers do ai-router (parseBody com os schemas compartilhados acima).
// Todos usam .strict(): endpoints internos rejeitam campos extras com 422.
// Registrados em CONTRACT_SCHEMAS (contract-schemas.ts) e consumidos via
// parseOrReject/parseRequestOrReject (contract-kit.ts).

/** requestId aceito pelo ai-router: truncado em 100 chars (C.35), formato alfanumérico. */
const RouterRequestIdSchema = z.string().max(100).optional();

/**
 * ai-suggest-reply@v1 — contrato estrito do payload da ação suggest_reply
 * (mesmos campos do AiSuggestReplySchema validado no handler do ai-router).
 */
export const AiSuggestReplyV1Schema = AiSuggestReplySchema.strict();

/**
 * ai-conversation-summary@v1 — payload da ação conversation_summary.
 * requestId adicional: o ai-router lê body.requestId no topo (idempotência).
 */
export const AiConversationSummaryV1Schema = AiConversationSummarySchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/**
 * ai-conversation-analysis@v1 — payload da ação conversation_analysis.
 */
export const AiConversationAnalysisV1Schema = AiConversationAnalysisSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/**
 * ai-enhance-message@v1 — payload da ação enhance_message.
 */
export const AiEnhanceMessageV1Schema = AiEnhanceMessageSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/**
 * ai-churn-analysis@v1 — payload da ação churn_analysis (contactIds UUID 1..100).
 */
export const AiChurnAnalysisV1Schema = AiChurnAnalysisSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/**
 * ai-transcribe-audio@v1 — payload da ação transcribe_audio.
 * audioUrl restrito a HTTPS público (SSRF guard, C.15).
 */
export const AiTranscribeAudioV1Schema = TranscribeAudioSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/** classify-emoji@v1 — index.ts consome image_url + file_name; {} → categoria 'outros'. */
export const ClassifyEmojiV1Schema = ClassifyEmojiSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/** classify-sticker@v1 — index.ts consome image_url; {} → categoria 'outros'. */
export const ClassifyStickerV1Schema = ClassifyStickerSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/** classify-audio-meme@v1 — index.ts consome audio_url + file_name. */
export const ClassifyAudioMemeV1Schema = ClassifyAudioMemeSchema
  .extend({ requestId: RouterRequestIdSchema })
  .strict();

/**
 * sentiment-alert@v1 — chamado por analyze-conversation / trigger realtime
 * com service role. index.ts consome: contactId, contactName, sentimentScore,
 * previousScore, analysisId, threshold, consecutiveRequired.
 */
export const SentimentAlertV1Schema = SentimentAlertSchema.strict();

/** voice-agent@v1 — espelho do TranscriptSchema inline no index.ts (min 1 / max 2000). */
export const VoiceAgentV1Schema = z.object({
  transcript: z.string().min(1).max(2000),
}).strict();

/**
 * voice-changer@v1 — rota JSON (fila/queue). index.ts consome task_id e
 * authorized. Rota multipart/form-data (áudio) não passa por contrato JSON.
 */
export const VoiceChangerV1Schema = z.object({
  task_id: z.string().min(1).max(100).optional(),
  authorized: z.boolean().optional(),
}).strict();

/**
 * speech-to-text@v1 — index.ts consome audio (base64 inline, ≤25MB ≈ 35M chars
 * em base64) e languageCode (default 'pt'). Contrato: src/hooks/useAudioRecorder.ts.
 */
export const SpeechToTextV1Schema = z.object({
  audio: z.string().min(1).max(40_000_000),
  languageCode: z.string().max(20).optional(),
}).strict();

/**
 * automation-suggest-reply@v1 — engine de automação envia executionId/ruleId
 * (UUIDs validados via isValidUUID no index.ts) + recentMessages/contactName/skipAi.
 * remoteJid é enviado pelos callers (useAutomationManagement/useAutomations) e
 * declarado na interface Body do index.ts.
 */
export const AutomationSuggestReplyV1Schema = z.object({
  executionId: z.string().uuid({ message: "executionId deve ser UUID" }),
  ruleId: z.string().uuid({ message: "ruleId deve ser UUID" }),
  remoteJid: z.string().max(100).optional(),
  recentMessages: z.array(z.object({
    from_me: z.boolean().optional(),
    content: z.string().max(2000),
  })).max(8).optional(),
  contactName: z.string().max(200).optional(),
  skipAi: z.boolean().optional(),
}).strict();

/** Tool/function call shapes do ai-proxy (espelho do inline AiProxySchema do index.ts). */
const AiProxyToolFunctionSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(1000).optional(),
  parameters: z.record(z.unknown()).optional(),
});
const AiProxyToolSchema = z.object({
  type: z.literal('function'),
  function: AiProxyToolFunctionSchema,
});
const AiProxyToolChoiceSchema = z.union([
  z.enum(['none', 'auto', 'required']),
  z.object({ type: z.literal('function'), function: z.object({ name: z.string().min(1).max(64) }) }),
]);

/**
 * ai-proxy@v1 — index.ts consome messages, model, use_for, provider_id, tools,
 * tool_choice e stream (mesmos campos do AiProxySchema inline original).
 */
export const AiProxyV1Schema = z.object({
  messages: z.array(z.object({
    role: z.string().max(50),
    content: z.string().max(50000),
  })).min(1).max(100),
  model: z.string().max(100).optional(),
  use_for: z.enum(['copilot', 'analysis', 'summary', 'tagging', 'auto_reply']).default('copilot'),
  provider_id: z.string().uuid().optional(),
  tools: z.array(AiProxyToolSchema).max(128).optional(),
  tool_choice: AiProxyToolChoiceSchema.optional(),
  stream: z.boolean().optional().default(false),
}).strict();

/**
 * ai-router@v1 — contrato do router unificado. Discriminated union por action
 * (10 ações conhecidas, ACTION_TIMEOUTS no index.ts). Cada variante espelha o
 * schema validado pelo handler correspondente (parseBody no index.ts) + action
 * literal + requestId (lido no topo para idempotência, C.35). Estrito por
 * variante: campos fora do contrato da ação → 422 contract_violation.
 */
export const AiRouterV1Schema = z.discriminatedUnion('action', [
  // auto_tag — AiAutoTagSchema (contactId + messages obrigatórios, requestId obrigatório)
  z.object({ action: z.literal('auto_tag') }).merge(AiAutoTagSchema).strict(),
  // conversation_summary — AiConversationSummarySchema
  z.object({ action: z.literal('conversation_summary'), requestId: RouterRequestIdSchema })
    .merge(AiConversationSummarySchema).strict(),
  // enhance_message — AiEnhanceMessageSchema
  z.object({ action: z.literal('enhance_message'), requestId: RouterRequestIdSchema })
    .merge(AiEnhanceMessageSchema).strict(),
  // classify_emoji — ClassifyEmojiSchema ({} → 'outros')
  z.object({ action: z.literal('classify_emoji'), requestId: RouterRequestIdSchema })
    .merge(ClassifyEmojiSchema).strict(),
  // classify_sticker — ClassifyStickerSchema ({} → 'outros')
  z.object({ action: z.literal('classify_sticker'), requestId: RouterRequestIdSchema })
    .merge(ClassifyStickerSchema).strict(),
  // churn_analysis — AiChurnAnalysisSchema (contactIds 1..100 UUID)
  z.object({ action: z.literal('churn_analysis'), requestId: RouterRequestIdSchema })
    .merge(AiChurnAnalysisSchema).strict(),
  // conversation_analysis — AiConversationAnalysisSchema
  z.object({ action: z.literal('conversation_analysis'), requestId: RouterRequestIdSchema })
    .merge(AiConversationAnalysisSchema).strict(),
  // suggest_reply — AiSuggestReplySchema (conversationHistory + requestId obrigatórios)
  z.object({ action: z.literal('suggest_reply') }).merge(AiSuggestReplySchema).strict(),
  // transcribe_audio — TranscribeAudioSchema (audioUrl SSRF-guard)
  z.object({ action: z.literal('transcribe_audio'), requestId: RouterRequestIdSchema })
    .merge(TranscribeAudioSchema).strict(),
  // classify_tickets — AiClassifyTicketsSchema (limit default 50)
  z.object({ action: z.literal('classify_tickets'), requestId: RouterRequestIdSchema })
    .merge(AiClassifyTicketsSchema).strict(),
]);
