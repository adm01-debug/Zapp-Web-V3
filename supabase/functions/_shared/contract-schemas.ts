/**
 * Contract Schemas — registro central de schemas Zod por contrato/versão.
 *
 * Fonte única consumida por `parseOrReject` (contract-kit.ts) e pelos testes
 * de contrato. Cada schema abaixo foi derivado do CONSUMO REAL de campos no
 * `index.ts` do endpoint (não inventado) — ver comentário em cada bloco.
 *
 * CONSOLIDAÇÃO (PR #254 follow-up): este arquivo agora re-exporta os helpers
 * de `edge-contract-schemas.ts`, tornando-se o ÚNICO ponto de import para
 * chamadores. Não há risco de ciclo — edge-contract-schemas.ts não importa daqui.
 *
 * Convenções:
 *  - Webhooks EXTERNOS (provedor envia): permissivos — `.passthrough()`,
 *    `.nullish()` — para nunca derrubar ingestão por campo novo do provedor.
 *  - Endpoints INTERNOS (UI/cron chama): estritos — enums fechados, UUID,
 *    limites de tamanho — para falhar cedo com 422 consistente.
 */
import { z } from "https://esm.sh/zod@3.23.8";
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
  WhatsAppCloudWebhookV2Schema,
  WhatsappWebhookV1Schema,
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
  ElevenLabsWebhookV1Schema,
  ElevenLabsWebhookV2Schema,
} from "./webhook-schemas.ts";
import {
  AiSuggestReplySchema,
  AiConversationSummarySchema,
  DetectNewDeviceSchema,
} from "./schemas.ts";
import type { SchemaMap } from "./contract-kit.ts";

/** Re-exported module members. */
export {
  z,
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
  WhatsAppCloudWebhookV2Schema,
  WhatsappWebhookV1Schema,
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
  ElevenLabsWebhookV1Schema,
  ElevenLabsWebhookV2Schema,
};

// ─── Webhooks externos (permissivos) ─────────────────────────────────────────
// Schemas V1/V2 dos webhooks externos vivem em webhook-schemas.ts (re-exportados
// acima): evolution, whatsapp-cloud (Meta), gmail e elevenlabs.

/**
 * email-track-link@v1 — GET de rastreio de clique; contrato por query param
 * (`l`/`link_id`), sem corpo. Schema permissivo guarda POSTs futuros sem
 * nunca derrubar o redirect 302 por campo desconhecido.
 */
export const EmailTrackLinkV1Schema = z.object({}).passthrough();

/**
 * email-track-pixel@v1 — GET de pixel 1x1; contrato por query param
 * (`t`/`tracking_id`), sem corpo. Sempre responde o GIF — nunca 422.
 */
export const EmailTrackPixelV1Schema = z.object({}).passthrough();

// ─── Endpoints internos (estritos) ───────────────────────────────────────────

/** talkx-send@v1 — UI envia { campaignId: uuid, action: start|pause|cancel } (useTalkX.ts). */
export const TalkxSendV1Schema = z.object({
  campaignId: z.string().uuid({ message: "campaignId deve ser UUID" }),
  action: z.enum(["start", "pause", "cancel"]).optional(),
}).strict();

/**
 * send-email@v1 — duas formas válidas:
 *  a) { accountId, ... } → delega para gmail-send;
 *  b) { to, subject, html } → fallback Resend. `to` aceita e-mail ou lista (≤50).
 */
const EmailAddr = z.string().trim().email({ message: "e-mail inválido" }).max(320);
/** Send Email V1 Schema constant. */
export const SendEmailV1Schema = z.object({
  accountId: z.string().min(1).max(200).optional(),
  action: z.string().max(50).optional(),
  to: z.union([EmailAddr, z.array(EmailAddr).min(1).max(50)]).optional(),
  subject: z.string().min(1, "subject vazio").max(500).optional(),
  html: z.string().min(1, "html vazio").max(500_000).optional(),
}).passthrough().superRefine((val, ctx) => {
  if (!val.accountId) {
    for (const f of ["to", "subject", "html"] as const) {
      if (val[f] == null || (typeof val[f] === "string" && (val[f] as string).length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `${f} é obrigatório sem accountId` });
      }
    }
  }
});

/** reprocess-failed-messages@v1 — cron chama sem body; admin pode passar {} . Body opcional. */
export const ReprocessFailedMessagesV1Schema = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  dryRun: z.boolean().optional(),
}).strict();

/** recheck-webhook-signature@v1 — index.ts exige event_id string; observed_signature opcional. */
export const RecheckWebhookSignatureV1Schema = z.object({
  event_id: z.string().min(1, "event_id é obrigatório").max(200),
  observed_signature: z.string().max(1000).nullish(),
}).passthrough();

/** webhook-diagnostic@v1 — action default 'full-diagnostic'; instanceName opcional. */
export const WebhookDiagnosticV1Schema = z.object({
  action: z.string().max(100).optional(),
  instanceName: z.string().min(1).max(100).optional(),
}).passthrough();

/** instance-pause-control@v1 — action obrigatória; limit/instance/minutes por rota. */
export const InstancePauseControlV1Schema = z.object({
  action: z.string().min(1, "action é obrigatória").max(100),
  limit: z.number().int().min(1).max(200).optional(),
  instance: z.string().min(1).max(100).optional(),
  minutes: z.number().int().min(1).max(1440).optional(),
}).passthrough();

/** contacts-import@v1 — rows[] obrigatório; workspace_id default 'wpp2'. */
export const ContactsImportV1Schema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, "rows vazio").max(10_000),
  workspace_id: z.string().min(1).max(100).optional(),
}).passthrough();

/** voice-copilot-action@v1 — { action, params }. */
export const VoiceCopilotActionV1Schema = z.object({
  action: z.string().min(1, "action é obrigatória").max(100),
  params: z.record(z.unknown()).nullish(),
}).passthrough();

/** gmail-send@v1 — roteado por action; campos por rota validados no handler. */
export const GmailSendV1Schema = z.object({
  action: z.string().min(1).max(50).optional(),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  to: z.union([EmailAddr, z.array(EmailAddr).min(1).max(50)]).optional(),
  cc: z.array(EmailAddr).max(50).optional(),
  bcc: z.array(EmailAddr).max(50).optional(),
  subject: z.string().max(500).optional(),
  bodyHtml: z.string().max(500_000).optional(),
  bodyPlain: z.string().max(500_000).optional(),
  threadId: z.string().max(200).optional(),
  messageId: z.string().max(200).optional(),
  messageIds: z.array(z.string().max(200)).max(500).optional(),
  read: z.boolean().optional(),
  addLabelIds: z.array(z.string().max(100)).max(50).optional(),
  removeLabelIds: z.array(z.string().max(100)).max(50).optional(),
  attachments: z.array(z.record(z.unknown())).max(25).optional(),
}).passthrough();

/** evolution-sync@v1 — action/instanceName/page/offset com defaults no handler. */
export const EvolutionSyncV1Schema = z.object({
  action: z.string().max(100).optional(),
  instanceName: z.string().min(1).max(100).optional(),
  page: z.number().int().min(1).max(100_000).optional(),
  offset: z.number().int().min(1).max(10_000).optional(),
  contactPhone: z.string().max(30).optional(),
}).passthrough();

/**
 * webhook-hmac-selftest@v1 — self-test HMAC (service-role/cron). index.ts
 * consome: instance (default 'selftest'), tolerance_seconds (clampado no
 * handler), include_negative (default true). Corpo opcional — GET roda sem.
 * Permissivo: tolerância é clampada no handler, não rejeitada.
 */
export const WebhookHmacSelftestV1Schema = z.object({
  instance: z.string().max(100).nullish(),
  tolerance_seconds: z.number().int().positive().nullish(),
  include_negative: z.boolean().nullish(),
}).passthrough();

/** webhook-secret-status@v1 — status admin (GET/POST); index.ts não lê corpo. */
export const WebhookSecretStatusV1Schema = z.object({}).passthrough();

/** whatsapp-cloud-secrets-status@v1 — status admin (GET/POST); corpo não lido. */
export const WhatsappCloudSecretsStatusV1Schema = z.object({}).passthrough();

/** whatsapp-cloud-webhook-verify@v1 — diagnóstico interno; corpo não lido. */
export const WhatsappCloudWebhookVerifyV1Schema = z.object({}).passthrough();

/**
 * whatsapp-cloud-api@v1 — espelho do evolution-api (staff JWT). index.ts
 * consome action + aliases por rota (instanceName|instance, number|to,
 * mediatype|mediaType, media|url, reaction|emoji, messageId|wamid,
 * templateName|template). Todos opcionais — roteado por action no handler.
 */
export const WhatsappCloudApiV1Schema = z.object({
  action: z.string().max(50).nullish(),
  instanceName: z.string().max(100).nullish(),
  instance: z.string().max(100).nullish(),
  number: z.string().max(30).nullish(),
  to: z.string().max(30).nullish(),
  text: z.string().max(100_000).nullish(),
  linkPreview: z.boolean().nullish(),
  mediatype: z.string().max(50).nullish(),
  mediaType: z.string().max(50).nullish(),
  media: z.string().max(5000).nullish(),
  url: z.string().max(5000).nullish(),
  caption: z.string().max(5000).nullish(),
  audio: z.string().max(5000).nullish(),
  sticker: z.string().max(5000).nullish(),
  reaction: z.string().max(100).nullish(),
  emoji: z.string().max(100).nullish(),
  messageId: z.string().max(300).nullish(),
  wamid: z.string().max(300).nullish(),
  templateName: z.string().max(200).nullish(),
  template: z.string().max(200).nullish(),
  language: z.string().max(50).nullish(),
  components: z.array(z.unknown()).max(100).nullish(),
}).passthrough();

/**
 * gmail-token-refresh@v1 — cron/UI. index.ts consome: action (default
 * 'refreshAll') e accountId (refreshSingle). Corpo opcional — cron chama sem.
 */
export const GmailTokenRefreshV1Schema = z.object({
  action: z.string().max(50).nullish(),
  accountId: z.string().max(200).nullish(),
}).passthrough();

/** gmail-health@v1 — health/status (service-role/cron); params por query string. */
export const GmailHealthV1Schema = z.object({}).passthrough();

// ─── Business/infra endpoints (v1 — estritos, derivados do consumo real) ────

/**
 * gmail-sync@v1 — UI envia { action, accountId, labelIds?, q?, pageToken?, maxResults? }.
 * action default 'listThreads'; maxResults clampado [1,100] no handler.
 */
export const GmailSyncV1Schema = z.object({
  action: z.enum(["listThreads", "syncFull", "syncLabels"]).optional(),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  labelIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  q: z.string().max(1000).optional(),
  pageToken: z.string().max(500).optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
}).strict();

/**
 * gmail-oauth@v1 — POST interno (JWT): action + campos por rota
 * (getAuthUrl | exchangeCode{code,userId,state} | refresh/revoke{accountId}).
 * Alias kebab-case aceitos (actionMap do handler).
 */
export const GmailOauthV1Schema = z.object({
  action: z.enum([
    "getAuthUrl", "exchangeCode", "refresh", "revoke", "listAccounts",
    "get-auth-url", "exchange-code", "refresh-token", "disconnect", "list-accounts",
  ]),
  accountId: z.string().min(1).max(200).optional(),
  code: z.string().min(1).max(4096).optional(),
  userId: z.string().min(1).max(200).optional(),
  state: z.string().min(1).max(1000).optional(),
}).strict();

/** Config IMAP/SMTP aninhada (saveCredentials/testConnection). */
const ImapSmtpConfigV1Schema = z.object({
  email: z.string().min(1).max(320).optional(),
  password: z.string().min(1).max(2000).optional(),
  provider: z.enum(["outlook", "yahoo", "gmail", "custom"]).optional(),
  imap_host: z.string().min(1).max(253).optional(),
  imap_port: z.number().int().min(1).max(65535).optional(),
  imap_use_ssl: z.boolean().optional(),
  smtp_host: z.string().min(1).max(253).optional(),
  smtp_port: z.number().int().min(1).max(65535).optional(),
  smtp_use_tls: z.boolean().optional(),
  username: z.string().max(320).optional(),
}).strict();

/** email-imap-bridge@v1 — action + provider/config por rota. */
export const EmailImapBridgeV1Schema = z.object({
  action: z.enum(["getProviderConfig", "saveCredentials", "testConnection", "listProviders"]),
  provider: z.string().min(1).max(50).optional(),
  config: ImapSmtpConfigV1Schema.optional(),
}).strict();

/** Cron sem body — aceita somente {} (ou nada). Base dos schedulers internos. */
const EmptyStrictV1Schema = z.object({}).strict();

/** evolution-sender@v1 — cron de fila; sem body. */
export const EvolutionSenderV1Schema = EmptyStrictV1Schema;

/** evolution-health@v1 — cron de health check; sem body. */
export const EvolutionHealthV1Schema = EmptyStrictV1Schema;

/** evolution-credentials@v1 — GET admin; sem body. */
export const EvolutionCredentialsV1Schema = EmptyStrictV1Schema;

/**
 * evolution-templates@v1 — POST { action: send|preview, template_name,
 * remote_jid?, variables? }; action default 'send' no handler.
 */
export const EvolutionTemplatesV1Schema = z.object({
  action: z.enum(["send", "preview"]).optional(),
  template_name: z.string().min(1).max(300).optional(),
  remote_jid: z.string().min(1).max(100).optional(),
  variables: z.record(z.unknown()).refine(
    (v) => Object.keys(v).length <= 200,
    "variables deve ter no máximo 200 chaves",
  ).optional(),
}).strict();

/** evolution-sentiment@v1 — POST { action?: analyze, text, remote_jid?, message_id?, instance_name? }. */
export const EvolutionSentimentV1Schema = z.object({
  action: z.enum(["analyze"]).optional(),
  text: z.string().min(1, "text deve ser uma string não vazia").max(5000),
  remote_jid: z.string().min(1).max(100).optional(),
  message_id: z.string().min(1).max(200).optional(),
  instance_name: z.string().min(1).max(100).optional(),
}).strict();

/** evolution-retry-metrics@v1 — GET admin (query params); sem body. */
export const EvolutionRetryMetricsV1Schema = EmptyStrictV1Schema;

/** evolution-followup@v1 — cron de follow-ups; sem body. */
export const EvolutionFollowupV1Schema = EmptyStrictV1Schema;

/** evolution-chatbot@v1 — POST { remote_jid, message, use_ai? } (service-role/cron). */
export const EvolutionChatbotV1Schema = z.object({
  remote_jid: z.string().min(1, "remote_jid deve ser uma string não vazia").max(100),
  message: z.string().min(1, "message deve ser uma string não vazia").max(5000),
  use_ai: z.boolean().optional(),
}).strict();

/** evolution-bitrix-sync@v1 — cron de sincronização Bitrix; sem body. */
export const EvolutionBitrixSyncV1Schema = EmptyStrictV1Schema;

/** db-health-monitor@v1 — cron de health check; sem body. */
export const DbHealthMonitorV1Schema = EmptyStrictV1Schema;

/** connection-health-check@v1 — GET (todas) ou POST { instanceName? } (verificar agora). */
export const ConnectionHealthCheckV1Schema = z.object({
  instanceName: z.string().min(1).max(100).optional(),
}).strict();

/** health-check@v1 — probe GET; sem body. */
export const HealthCheckV1Schema = EmptyStrictV1Schema;

/** health@v1 — probe GET (?probe=1 | detalhado); sem body. */
export const HealthV1Schema = EmptyStrictV1Schema;

/** status@v1 — probe GET; sem body. */
export const StatusV1Schema = EmptyStrictV1Schema;

/** metrics@v1 — scrape Prometheus GET; sem body. */
export const MetricsV1Schema = EmptyStrictV1Schema;

/** send-scheduled-report@v1 — cron/UI envia { reportId }. */
export const SendScheduledReportV1Schema = z.object({
  reportId: z.string().min(1, "reportId é obrigatório").max(200),
}).strict();

/** auto-escalate-sla@v1 — cron; sem body. */
export const AutoEscalateSlaV1Schema = EmptyStrictV1Schema;

/** auto-close-conversations@v1 — cron; sem body. */
export const AutoCloseConversationsV1Schema = EmptyStrictV1Schema;

/**
 * backfill-messages@v1 — POST { instance_name?|instance?, connection_id?,
 * offset?, limit?, dryRun? }; env vars têm precedência no handler.
 */
export const BackfillMessagesV1Schema = z.object({
  instance_name: z.string().min(1).max(100).optional(),
  instance: z.string().min(1).max(100).optional(),
  connection_id: z.string().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(1_000_000).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  dryRun: z.boolean().optional(),
}).strict();

/** Ajustes de voz (elevenlabs-voice textToSpeech) — valores numéricos em [0,1]. */
const ElevenLabsVoiceSettingsV1Schema = z.object({
  modelId: z.string().max(100).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarityBoost: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  useSpeakerBoost: z.boolean().optional(),
}).strict();

/** elevenlabs-voice@v1 — { action?: listVoices|textToSpeech, text?, voiceId?, settings? }. */
export const ElevenLabsVoiceV1Schema = z.object({
  action: z.enum(["listVoices", "textToSpeech"]).optional(),
  text: z.string().min(1).max(5000).optional(),
  voiceId: z.string().min(1).max(100).optional(),
  settings: ElevenLabsVoiceSettingsV1Schema.optional(),
}).strict().superRefine((val, ctx) => {
  if (val.action === "textToSpeech") {
    for (const f of ["text", "voiceId"] as const) {
      if (!val[f] || val[f].length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [f], message: `${f} é obrigatório para textToSpeech` });
      }
    }
  }
});

/** elevenlabs-tts@v1 — { text, voiceId?, modelId?, languageCode?, applyTextNormalization? }. */
export const ElevenLabsTtsV1Schema = z.object({
  text: z.string().min(1).max(10000),
  voiceId: z.string().max(100).optional().nullable(),
  modelId: z.string().max(100).optional().nullable(),
  languageCode: z.string().max(20).optional().nullable(),
  applyTextNormalization: z.string().max(20).optional().nullable(),
}).strict();

/**
 /** elevenlabs-sts@v1 — multipart: { audio: File, voiceId, modelId? }.
  * O body é montado pelo handler a partir do FormData (parseOrReject exige JSON).
  */
 export const ElevenLabsStsV1Schema = z.object({
   audio: z.custom<File>((v) => v instanceof File, {
     message: "audio deve ser um arquivo (multipart form-data)",
   }),
   voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, "voiceId inválido (apenas alfanumérico, hífen, underscore)"),
   modelId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, "modelId inválido").optional().nullable(),
 }).strict();

 // ─── Schemas para contratos com validação própria (órfãos do registro) ──────
 // Estes contratos já validam no index.ts (safeParse/parseBody/.parse()).
 // Registrá-los aqui fecha o gap CONTRACTS ↔ CONTRACT_SCHEMAS e habilita
 // os guard-rails de CI (contract-registry-integrity.test.ts).

 /** whatsapp-webhook@v1 — schema REAL em webhook-schemas.ts (re-exportado acima);
  *  espelha o Zod que o index.ts usa. Contrato estrito: payload fora do schema
  *  é rejeitado pelo endpoint (200 + warning, sem retry). */

 /** sicoob-bridge@v1 — valida no index.ts. Schema de registro. */
 export const SicoobBridgeV1Schema = z.object({}).passthrough();

 /** sicoob-bridge-reply@v1 — valida no index.ts. Schema de registro. */
 export const SicoobBridgeReplyV1Schema = z.object({}).passthrough();

 /** bitrix-api@v1 — valida no index.ts com Zod próprio. Schema de registro. */
 export const BitrixApiV1Schema = z.object({}).passthrough();

 /** auth-email-hook@v1 — hook interno do Supabase Auth. Schema de registro. */
 export const AuthEmailHookV1Schema = z.object({}).passthrough();

 /** whatsapp-cloud-send@v1 — valida no index.ts com Zod próprio. Schema de registro. */
 export const WhatsappCloudSendV1Schema = z.object({}).passthrough();

 /** public-api@v1 — valida no index.ts com Zod próprio. Schema de registro. */
 export const PublicApiV1Schema = z.object({}).passthrough();

 /** ai-proxy@v1 — valida no index.ts. Schema de registro. */
 export const AiProxyV1Schema = z.object({}).passthrough();

 /** ai-suggest-reply@v1 — schema em _shared/schemas.ts (AiSuggestReplySchema). Schema de registro. */
 // AiSuggestReplyV1Schema defined below as local alias

 /** ai-enhance-message@v1 — schema em _shared/schemas.ts. Schema de registro. */
 export const AiEnhanceMessageV1Schema = z.object({}).passthrough();

 /** ai-transcribe-audio@v1 — schema em _shared/schemas.ts. Schema de registro. */
 export const AiTranscribeAudioV1Schema = z.object({}).passthrough();

 /** ai-conversation-analysis@v1 — schema em _shared/schemas.ts. Schema de registro. */
 export const AiConversationAnalysisV1Schema = z.object({}).passthrough();

 /** ai-conversation-summary@v1 — schema em _shared/schemas.ts (AiConversationSummarySchema). Schema de registro. */
 // AiConversationSummaryV1Schema defined below as local alias

 /** ai-auto-tag@v1 — schema em _shared/schemas.ts. Schema de registro. */
 export const AiAutoTagV1Schema = z.object({}).passthrough();

 /** elevenlabs-tts-stream@v1 — streaming; body validado no handler. Schema de registro. */
 export const ElevenLabsTtsStreamV1Schema = z.object({}).passthrough();

 /** elevenlabs-sfx@v1 — valida no index.ts. Schema de registro. */
 export const ElevenLabsSfxV1Schema = z.object({}).passthrough();

 /** elevenlabs-dialogue@v1 — valida no index.ts. Schema de registro. */
 export const ElevenLabsDialogueV1Schema = z.object({}).passthrough();

 /** elevenlabs-voice-design@v1 — valida no index.ts. Schema de registro. */
 export const ElevenLabsVoiceDesignV1Schema = z.object({}).passthrough();

 /** create-user@v1 — valida no index.ts com Zod próprio. Schema de registro. */
 export const CreateUserV1Schema = z.object({}).passthrough();

 /** approve-password-reset@v1 — valida no index.ts. Schema de registro. */
 export const ApprovePasswordResetV1Schema = z.object({}).passthrough();

 /** detect-new-device@v1 — schema em _shared/schemas.ts (DetectNewDeviceSchema). Schema de registro. */
 // DetectNewDeviceV1Schema defined below as local alias

 /** webauthn@v1 — valida no index.ts. Schema de registro. */
 export const WebauthnV1Schema = z.object({}).passthrough();

 /** evolution-api@v1 — valida no index.ts via edge-contract-schemas.ts. Schema de registro. */
 export const EvolutionApiV1Schema = z.object({}).passthrough();

 // ─── Alias local para schema importado de schemas.ts ────────────────────────
 /** ai-suggest-reply@v1 — alias de AiSuggestReplySchema. */
 export const AiSuggestReplyV1Schema = AiSuggestReplySchema;
 /** ai-conversation-summary@v1 — alias de AiConversationSummarySchema. */
 export const AiConversationSummaryV1Schema = AiConversationSummarySchema;
 /** detect-new-device@v1 — alias de DetectNewDeviceSchema. */
 export const DetectNewDeviceV1Schema = DetectNewDeviceSchema;

 // ─── Registro central: contrato → { versão → schema } ───────────────────────
export const CONTRACT_SCHEMAS: Record<string, SchemaMap> = {
  // Webhooks externos
  "evolution-webhook":       { v1: EvolutionWebhookV1Schema, v2: EvolutionWebhookV2Schema },
  "whatsapp-cloud-webhook":  { v1: MetaWebhookPayloadSchema, v2: WhatsAppCloudWebhookV2Schema },
  "elevenlabs-webhook":      { v1: ElevenLabsWebhookV1Schema, v2: ElevenLabsWebhookV2Schema },
  "gmail-webhook":           { v1: GmailWebhookV1Schema, v2: GmailWebhookV2Schema },

  // Internos / UI / cron
  "talkx-send":                 { v1: TalkxSendV1Schema },
  "send-email":                 { v1: SendEmailV1Schema },
  "gmail-send":                 { v1: GmailSendV1Schema },
  "reprocess-failed-messages":  { v1: ReprocessFailedMessagesV1Schema },
  "recheck-webhook-signature":  { v1: RecheckWebhookSignatureV1Schema },
  "webhook-diagnostic":         { v1: WebhookDiagnosticV1Schema },
  "instance-pause-control":     { v1: InstancePauseControlV1Schema },
  "contacts-import":            { v1: ContactsImportV1Schema },
  "voice-copilot-action":       { v1: VoiceCopilotActionV1Schema },
  "evolution-sync":             { v1: EvolutionSyncV1Schema },
  "webhook-hmac-selftest":      { v1: WebhookHmacSelftestV1Schema },
  "webhook-secret-status":      { v1: WebhookSecretStatusV1Schema },
  "whatsapp-cloud-webhook-verify":  { v1: WhatsappCloudWebhookVerifyV1Schema },
  "whatsapp-cloud-secrets-status":  { v1: WhatsappCloudSecretsStatusV1Schema },
  "whatsapp-cloud-api":         { v1: WhatsappCloudApiV1Schema },
  "gmail-token-refresh":        { v1: GmailTokenRefreshV1Schema },
  "gmail-health":               { v1: GmailHealthV1Schema },
  "email-track-link":           { v1: EmailTrackLinkV1Schema },
  "email-track-pixel":          { v1: EmailTrackPixelV1Schema },

  // Business / infra (v1)
  "gmail-sync":                    { v1: GmailSyncV1Schema },
  "gmail-oauth":                   { v1: GmailOauthV1Schema },
  "email-imap-bridge":             { v1: EmailImapBridgeV1Schema },
  "evolution-sender":              { v1: EvolutionSenderV1Schema },
  "evolution-health":              { v1: EvolutionHealthV1Schema },
  "evolution-credentials":         { v1: EvolutionCredentialsV1Schema },
  "evolution-templates":           { v1: EvolutionTemplatesV1Schema },
  "evolution-sentiment":           { v1: EvolutionSentimentV1Schema },
  "evolution-retry-metrics":       { v1: EvolutionRetryMetricsV1Schema },
  "evolution-followup":            { v1: EvolutionFollowupV1Schema },
  "evolution-chatbot":             { v1: EvolutionChatbotV1Schema },
  "evolution-bitrix-sync":         { v1: EvolutionBitrixSyncV1Schema },
  "db-health-monitor":             { v1: DbHealthMonitorV1Schema },
  "connection-health-check":       { v1: ConnectionHealthCheckV1Schema },
  "health-check":                  { v1: HealthCheckV1Schema },
  "health":                        { v1: HealthV1Schema },
  "status":                        { v1: StatusV1Schema },
  "metrics":                       { v1: MetricsV1Schema },
  "send-scheduled-report":         { v1: SendScheduledReportV1Schema },
  "auto-escalate-sla":             { v1: AutoEscalateSlaV1Schema },
  "auto-close-conversations":      { v1: AutoCloseConversationsV1Schema },
  "backfill-messages":             { v1: BackfillMessagesV1Schema },
  "elevenlabs-voice":              { v1: ElevenLabsVoiceV1Schema },
  "elevenlabs-tts":                { v1: ElevenLabsTtsV1Schema },
  "elevenlabs-sts":                { v1: ElevenLabsStsV1Schema },

  // Contratos com validação própria (fecha gap CONTRACTS ⊇ CONTRACT_SCHEMAS)
  "whatsapp-webhook":              { v1: WhatsappWebhookV1Schema },
  "sicoob-bridge":                 { v1: SicoobBridgeV1Schema },
  "sicoob-bridge-reply":           { v1: SicoobBridgeReplyV1Schema },
  "bitrix-api":                    { v1: BitrixApiV1Schema },
  "auth-email-hook":               { v1: AuthEmailHookV1Schema },
  "whatsapp-cloud-send":           { v1: WhatsappCloudSendV1Schema },
  "public-api":                    { v1: PublicApiV1Schema },
  "ai-proxy":                      { v1: AiProxyV1Schema },
  "ai-suggest-reply":              { v1: AiSuggestReplyV1Schema },
  "ai-enhance-message":            { v1: AiEnhanceMessageV1Schema },
  "ai-transcribe-audio":           { v1: AiTranscribeAudioV1Schema },
  "ai-conversation-analysis":      { v1: AiConversationAnalysisV1Schema },
  "ai-conversation-summary":       { v1: AiConversationSummaryV1Schema },
  "ai-auto-tag":                   { v1: AiAutoTagV1Schema },
  "elevenlabs-tts-stream":         { v1: ElevenLabsTtsStreamV1Schema },
  "elevenlabs-sfx":                { v1: ElevenLabsSfxV1Schema },
  "elevenlabs-dialogue":           { v1: ElevenLabsDialogueV1Schema },
  "elevenlabs-voice-design":       { v1: ElevenLabsVoiceDesignV1Schema },
  "create-user":                   { v1: CreateUserV1Schema },
  "approve-password-reset":        { v1: ApprovePasswordResetV1Schema },
  "detect-new-device":             { v1: DetectNewDeviceV1Schema },
  "webauthn":                      { v1: WebauthnV1Schema },
  "evolution-api":                 { v1: EvolutionApiV1Schema },
};

// ─── Re-exports de edge-contract-schemas (ponto de import unificado) ─────────
//
// Callers agora importam tudo de um único módulo:
//   import { CONTRACT_SCHEMAS, EdgeFunctionContractSchemas, getContractSchema } from '…/contract-schemas.ts';
//
// Não há risco de ciclo: edge-contract-schemas.ts NÃO importa deste arquivo.
/** Re-exported module members. */
export {
  EdgeFunctionContractSchemas,
  getContractSchema,
  getContractLifecycle,
  validateContractPayload,
  parseContractRequest,
  EDGE_FUNCTION_NAMES,
  WebhookContractSchemas,
  ContractLifecycles,
} from './edge-contract-schemas.ts';
/** Re-exported module members. */
export type {
  ContractParseOptions,
  ContractParseResult,
} from './edge-contract-schemas.ts';
