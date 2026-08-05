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
  AiChurnAnalysisV1Schema,
  ClassifyEmojiV1Schema,
  ClassifyStickerV1Schema,
  AiConversationAnalysisV1Schema,
  AiEnhanceMessageV1Schema,
  AiProxyV1Schema,
  AiTranscribeAudioV1Schema,
  AiAutoTagSchema,
} from "./schemas.ts";
/** ai-auto-tag@v1 — schema REAL (era placeholder). Proxy que injeta action:'auto_tag'
 * e repassa ao ai-router; validação do payload do cliente = AiAutoTagSchema estrito. */
export const AiAutoTagV1Schema = AiAutoTagSchema.strict();

import type { SchemaMap } from "./contract-kit.ts";
import * as AISchemas from "./contract-schemas-ai.ts";
import * as InfraSchemas from "./contract-schemas-infra.ts";
import { OutlookOauthV1Schema, PromogiftsCatalogV1Schema } from "./contract-schemas-integrations.ts";


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
 * evolution-credentials-write@v1 — POST CRUD (actions 'save' | 'delete').
 * Roteado por action via discriminatedUnion (padrão SicoobBridgeV1Schema).
 * Admin/supervisor + rate limit 10/60s no handler. Alinhado ao consumo REAL
 * do handleWrite (v2, 2026-07-06): save exige instance_name/api_url/api_key
 * (display_name/department opcionais, is_active default true); delete exige
 * id UUID. PASSTHROUGH: o handler lê só os campos conhecidos e valida
 * individualmente (api_url http(s), UUID_RE) — contrato garante os tipos
 * base, handler garante as regras de negócio. Correção 2026-08-04: o POST
 * lia req.json() sem gate (gap de cobertura — contract-coverage só via
 * presença de parseOrReject no GET).
 */
export const EvolutionCredentialsWriteV1Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    instance_name: z.string().min(1).max(100),
    api_url: z.string().min(1).max(500),
    api_key: z.string().min(1).max(500),
    display_name: z.string().max(200).optional().nullable(),
    department: z.string().max(200).optional().nullable(),
    is_active: z.boolean().optional(),
  }).passthrough(),
  z.object({
    action: z.literal("delete"),
    id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "invalid uuid"),
  }).passthrough(),
]);

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

/** connection-health-check@v1 — GET (todas) ou POST { instanceName?, connectionId? } (verificar agora). */
export const ConnectionHealthCheckV1Schema = z.object({
  instanceName: z.string().min(1).max(100).optional(),
  connectionId: z.string().uuid().optional(),
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
 * audio-transcribe@v1 — POST autenticado (requireUser + rate limit 5/min).
 * Espelho fiel do TranscribeInput inline v2.2 (migrado do Cloud Fator X):
 * { action?, audio_base64?, audio_url?, language?, format? } com refine
 * exigindo audio_base64 OU audio_url. v2.3 versionado no repo (2026-08-04).
 * NOTA: NÃO usar .strict() — o v2.2 original era permissivo a campos extras
 * e o handler lê apenas os campos conhecidos.
 */
export const AudioTranscribeV1Schema = z.object({
  action: z.enum(['transcribe', 'translate']).default('transcribe'),
  audio_base64: z.string().min(100).optional(),
  audio_url: z.string().url().optional(),
  language: z.string().min(2).max(5).default('pt'),
  format: z.enum(['text', 'srt', 'vtt', 'json']).default('text'),
}).refine(d => d.audio_base64 || d.audio_url, {
  message: 'Either audio_base64 or audio_url is required',
});

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


 /**
  * sicoob-bridge@v1 — schema REAL (espelha SicoobBridgeNewMessageSchema/
  * SicoobBridgeMarkReadSchema de _shared/schemas.ts, agora validados pelo gate).
  * Roteado por action via discriminatedUnion: new_message exige message_id+
  * content; mark_read exige external_ids. Webhook externo → permissivo
  * (extras passam), mas os campos obrigatórios por action são exigidos.
  */
 export const SicoobBridgeV1Schema = z.discriminatedUnion("action", [
   z.object({
     action: z.literal("new_message"),
     message_id: z.string().max(200),
     sender_name: z.string().max(200).optional().nullable(),
     sender_email: z.string().max(320).optional().nullable(),
     sender_phone: z.string().max(50).optional().nullable(),
     singular_name: z.string().max(200).optional().nullable(),
     singular_id: z.string().max(200).optional().nullable(),
     content: z.string().max(10000),
     vendedor_user_id: z.string().max(200).optional().nullable(),
     created_at: z.string().max(50).optional().nullable(),
     sender_id: z.string().max(200).optional().nullable(),
   }).passthrough(),
   z.object({
     action: z.literal("mark_read"),
     external_ids: z.array(z.string().max(200)).max(1000),
   }).passthrough(),
 ]);

 /** sicoob-bridge-reply@v1 — valida no index.ts. Schema de registro. */
 /**
 * sicoob-bridge-reply@v1 — real. Consumo (SicoobBridgeReplySchema):
 * { contact_id, content, message_id, created_at?, agent_id? }.
 * Ponte externa (dual-mode) → permissivo.
 */
export const SicoobBridgeReplyV1Schema = z.object({
  contact_id: z.string().optional(),
  content: z.string().optional(),
  message_id: z.string().optional(),
  created_at: z.string().optional(),
  agent_id: z.string().optional(),
}).passthrough();

 /**
  * bitrix-api@v1 — schema REAL (espelha o antigo BitrixBodySchema local, agora
  * validado pelo gate). action enum obrigatório; entityType?, entityId?,
  * data?, filters?. Permissivo (extras passam) — igual ao schema local.
  */
 export const BitrixApiV1Schema = z.object({
   action: z.enum(["list", "get", "create", "update", "delete", "register_call",
     "finish_call", "attach_record", "sync_contacts", "push_contact",
     "create_lead_from_conversation"]),
   entityType: z.enum(["lead", "contact", "deal", "activity", "call"]).optional(),
   entityId: z.string().max(100).optional(),
   data: z.record(z.unknown()).optional(),
   filters: z.record(z.unknown()).optional(),
 }).passthrough();


 /**
  * whatsapp-cloud-send@v1 — schema REAL (espelha o antigo SendSchema local,
  * agora validado pelo gate). to min 5 + type enum obrigatórios; demais
  * campos opcionais. Permissivo (extras passam) — igual ao schema local.
  */
 export const WhatsappCloudSendV1Schema = z.object({
   to: z.string().min(5),
   type: z.enum([
     "text", "image", "video", "audio", "document", "sticker", "template",
     "reaction", "location", "contacts", "read",
   ]),
   text: z.string().optional(),
   mediaUrl: z.string().url().optional(),
   caption: z.string().optional(),
   filename: z.string().optional(),
   template: z.object({
     name: z.string(),
     language: z.string().default("pt_BR"),
     components: z.array(z.any()).optional(),
   }).optional(),
   messageId: z.string().optional(),
   emoji: z.string().optional(),
   latitude: z.number().optional(),
   longitude: z.number().optional(),
   name: z.string().optional(),
   address: z.string().optional(),
   contacts: z.array(z.any()).optional(),
   messageIds: z.array(z.string()).optional(),
 }).passthrough();

 /**
  * public-api@v1 — schema REAL (espelha publicApiSendSchema de
  * criticalPayloadSchemas.ts, agora validado pelo gate). action literal
  * 'send'; number normalizado (DDI+DDD, ≥10 dígitos); message 1..10000;
  * connectionId UUID opcional. Permissivo (extras passam).
  */
 export const PublicApiV1Schema = z.object({
   action: z.literal("send"),
   number: z.string()
     .min(6, "Informe um número com DDI e DDD.")
     .max(30, "Número excede o tamanho permitido.")
     .transform((value: string) => value.replace(/\D/g, ""))
     .refine((digits: string) => digits.length >= 10, {
       message: "Número inválido. Use DDI + DDD + número.",
     }),
   message: z.string()
     .trim()
     .min(1, "A mensagem não pode estar vazia.")
     .max(10000, "Mensagem excede 10000 caracteres."),
   connectionId: z.string().uuid("connectionId deve ser um UUID válido.").optional(),
 }).passthrough();

 /** ai-proxy@v1 — valida no index.ts. Schema de registro. */
 
 /** ai-suggest-reply@v1 — schema em _shared/schemas.ts (AiSuggestReplySchema). Schema de registro. */
 // AiSuggestReplyV1Schema defined below as local alias

 /** ai-enhance-message@v1 — schema em _shared/schemas.ts. Schema de registro. */
 
 /** ai-transcribe-audio@v1 — schema em _shared/schemas.ts. Schema de registro. */
 
 /** ai-conversation-analysis@v1 — schema em _shared/schemas.ts. Schema de registro. */
 
 /** ai-conversation-summary@v1 — schema em _shared/schemas.ts (AiConversationSummarySchema). Schema de registro. */
 // AiConversationSummaryV1Schema defined below as local alias

 /** ai-auto-tag@v1 — schema em _shared/schemas.ts. Schema de registro. */
 
 /** elevenlabs-tts-stream@v1 — streaming; body validado no handler. Schema de registro. */
 /**
 * elevenlabs-tts-stream@v1 — real. Consumo: { action?, text, voice_id?,
 * model_id?, speed?, stability?, similarity? }. Externo → permissivo.
 */
export const ElevenLabsTtsStreamV1Schema = z.object({
  action: z.string().optional(),
  text: z.string().optional(),
  voice_id: z.string().optional(),
  model_id: z.string().optional(),
  speed: z.number().optional(),
  stability: z.number().optional(),
  similarity: z.number().optional(),
}).passthrough();

 /** elevenlabs-sfx@v1 — valida no index.ts. Schema de registro. */
 /**
 * elevenlabs-sfx@v1 — real. Consumo: { action?, text, duration_seconds?,
 * prompt_influence? }. Externo → permissivo.
 */
export const ElevenLabsSfxV1Schema = z.object({
  action: z.string().optional(),
  text: z.string().optional(),
  duration_seconds: z.number().optional(),
  prompt_influence: z.number().optional(),
}).passthrough();

 /** elevenlabs-dialogue@v1 — valida no index.ts. Schema de registro. */
 /**
 * elevenlabs-dialogue@v1 — real. Consumo: roteado por action (dialogue/tts).
 * Externo (ElevenLabs) → permissivo; campos conhecidos tipados opcionais.
 */
export const ElevenLabsDialogueV1Schema = z.object({
  action: z.string().optional(),
  text: z.string().optional(),
  voice_id: z.string().optional(),
  model_id: z.string().optional(),
  voice_settings: z.unknown().optional(),
  dialogue: z.unknown().optional(),
}).passthrough();

 /** elevenlabs-voice-design@v1 — valida no index.ts. Schema de registro. */
 /**
 * elevenlabs-voice-design@v1 — real. Consumo: roteado por action
 * (create/preview); voice_settings, name?, description?, preview_text?.
 * Externo → permissivo.
 */
export const ElevenLabsVoiceDesignV1Schema = z.object({
  action: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  preview_text: z.string().optional(),
  voice_settings: z.unknown().optional(),
}).passthrough();

 /**
  * create-user@v1 — schema REAL (espelha o antigo bodySchema local, agora
  * validado pelo gate). email/password/name obrigatórios com limites;
  * role default 'agent'; google_services default []. Endpoint interno
  * (admin) → permissivo em extras, igual ao schema local.
  */
 export const CreateUserV1Schema = z.object({
   email: z.string().email("Email inválido").max(255),
   password: z.string().min(8, "Senha deve ter no mínimo 8 caracteres").max(128),
   name: z.string().min(1, "Nome é obrigatório").max(255),
   nickname: z.string().max(100).optional(),
   signature: z.string().max(500).optional(),
   job_title: z.string().max(255).optional(),
   avatar_url: z.string().url("URL inválida").max(500).optional(),
   role: z.enum(["admin", "supervisor", "agent", "special_agent"]).optional().default("agent"),
   gmail_email: z.string().email("Email Gmail inválido").max(255).optional(),
   google_services: z.array(z.enum(["google_sheets", "google_docs", "google_calendar", "google_drive"])).optional().default([]),
   dropbox_email: z.string().email("Email Dropbox inválido").max(255).optional(),
 }).passthrough();

 /** approve-password-reset@v1 — valida no index.ts. Schema de registro. */
 /**
 * approve-password-reset@v1 — real. Consumo: { action (default 'approve'),
 * reset_id?/request_id?, approved?/decision? }. Endpoint interno →
 * permissivo (handler valida os campos).
 */
export const ApprovePasswordResetV1Schema = z.object({
  action: z.string().optional(),
  reset_id: z.string().optional(),
  request_id: z.string().optional(),
  approved: z.boolean().optional(),
  decision: z.string().optional(),
}).passthrough();

/**
 * @deprecated Edge auth-email-hook REMOVIDA do repo (commit 78fa7d7be, "zumbi sem index.ts").
 * Registro morto removido em 2026-08-04 — o schema placeholder permissivo
 * (z.object vazio) derrubava o gate contract-registry-integrity (Invariante 9).
 */

 /** detect-new-device@v1 — schema em _shared/schemas.ts (DetectNewDeviceSchema). Schema de registro. */
 // DetectNewDeviceV1Schema defined below as local alias

 /**
  * webauthn@v1 — schema REAL (espelha WebAuthnActionSchema de
  * _shared/schemas.ts, agora validado pelo gate). action enum obrigatório
  * (registration-options|verify-registration|authentication-options|
  * verify-authentication); userId/userEmail/userName/friendlyName opcionais;
  * credential opaco. Permissivo (extras passam) — igual ao schema local.
  */
 export const WebauthnV1Schema = z.object({
   action: z.enum([
     "registration-options",
     "verify-registration",
     "authentication-options",
     "verify-authentication",
   ]),
   userId: z.string().max(200).optional().nullable(),
   userEmail: z.string().max(320).optional().nullable(),
   userName: z.string().max(200).optional().nullable(),
   credential: z.record(z.unknown()).optional().nullable(),
   friendlyName: z.string().max(200).optional().nullable(),
 }).passthrough();

 /** evolution-api@v1 — valida no index.ts via edge-contract-schemas.ts. Schema de registro. */
 /**
 * evolution-api@v1 — real. Consumo: proxy roteado por action (fallback
 * pathAction); instanceName|instance, number, remoteJid|chat, readMessages,
 * key, message etc. (JSON ou multipart). Permissivo — validação real no endpoint.
 */
export const EvolutionApiV1Schema = z.object({
  action: z.string().optional(),
  instanceName: z.string().optional(),
  instance: z.string().optional(),
  number: z.string().optional(),
  remoteJid: z.string().optional(),
  chat: z.string().optional(),
  readMessages: z.boolean().optional(),
  key: z.unknown().optional(),
  message: z.unknown().optional(),
}).passthrough();

 // ─── Alias local para schema importado de schemas.ts ────────────────────────
 /** ai-suggest-reply@v1 — alias de AiSuggestReplySchema. */
 const _conversationItemSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'agent', 'client']),
  content: z.string().max(10000),
});
/** ai-suggest-reply@v1 — gateway schema; aceita 'messages' como alias de
 *  'conversationHistory' (campo que o inbox envia) e requestId opcional. */
export const AiSuggestReplyV1Schema = AiSuggestReplySchema
  .omit({ conversationHistory: true, requestId: true })
  .extend({
    conversationHistory: _conversationItemSchema.array().min(1).max(50).optional(),
    messages: _conversationItemSchema.array().min(1).max(50).optional(),
    requestId: z.string().max(256).optional(),
  });
 /** ai-conversation-summary@v1 — alias de AiConversationSummarySchema. */
 export const AiConversationSummaryV1Schema = AiConversationSummarySchema;


// ─── Re-exportados do registro central (contract-schemas.ts) ────────────────

/**
 * bitrix-api@v1 — re-exportado. Consumo real no index.ts (BitrixBodySchema
 * local): { action: enum[list, get, create, update, delete, register_call,
 * finish_call, attach_record, sync_contacts, push_contact,
 * create_lead_from_conversation], entityType?, entityId?, data?, filters? }.
 * Externo (origin do portal Bitrix validado) → permissivo no registro.
 */

/**
 * contacts-import@v1 — re-exportado. Consumo real no index.ts:
 * { rows: array de objetos (1..50.000 no handler), workspace_id? (default
 * 'wpp2') }. Schema do registro caps rows em 10.000 e é permissivo.
 */

/**
 * create-user@v1 — re-exportado. Consumo real no index.ts (bodySchema
 * local): { email, password, name, nickname?, signature?, job_title?,
 * avatar_url?, role?, gmail_email?, google_services?, dropbox_email? }.
 * Registro mantém schema de registro permissivo (validação real no index).
 */

/**
 * evolution-api@v1 — re-exportado. Consumo real no index.ts: proxy roteado
 * por `action` (fallback pathAction); lê instanceName|instance, number,
 * remoteJid|chat, readMessages, key, message etc. (multipart ou JSON).
 * Registro permissivo — schema real vive no endpoint.
 */

/**
 * evolution-sync@v1 — re-exportado. Consumo real no index.ts: { action
 * (default 'sync-contacts'), instanceName (default 'wpp2'), page, offset,
 * contactPhone, webhookUrl, messagesPerContact } — passthrough cobre os
 * campos não listados no schema do registro.
 */

/**
 * gmail-send@v1 — re-exportado. Consumo real no index.ts: roteado por
 * action (default 'send'); accountId obrigatório; to/cc/bcc, subject,
 * bodyHtml, bodyPlain, threadId, messageId, messageIds, read,
 * addLabelIds/removeLabelIds, attachments. Registro permissivo.
 */

/**
 * instance-pause-control@v1 — re-exportado. Consumo real no index.ts:
 * action ∈ {list, history, pause, unpause, recent_events,
 * mark_investigated, status}; campos limit, instance, minutes, reason,
 * since_minutes, pause_id, notes — passthrough cobre os não listados.
 */

/**
 * public-api@v1 — re-exportado. Consumo real no index.ts:
 * publicApiSendSchema (criticalPayloadSchemas.ts): { action: 'send',
 * number, message, connectionId? }. API pública (x-api-key) → permissivo.
 */

/**
 * sicoob-bridge@v1 — re-exportado. Consumo real no index.ts: roteado por
 * action ∈ {new_message, mark_read}, validado por
 * SicoobBridgeNewMessageSchema/SicoobBridgeMarkReadSchema (_shared/schemas.ts)
 * — message_id, sender_name, sender_email, sender_phone, singular_name,
 * singular_id, content, vendedor_user_id, created_at, sender_id,
 * external_ids. Webhook externo (SICOOB_BRIDGE_SECRET) → permissivo.
 */

/**
 * sicoob-bridge-reply@v1 — re-exportado. Consumo real no index.ts:
 * SicoobBridgeReplySchema (_shared/schemas.ts): { contact_id, content,
 * message_id, created_at?, agent_id? }. Ponte externa (dual-mode
 * JWT/service-role) → permissivo.
 */

/**
 * whatsapp-cloud-send@v1 — re-exportado. Consumo real no index.ts
 * (SendSchema local): { to, type: enum[text, image, video, audio, document,
 * sticker, template, reaction, location, contacts, read], text?, mediaUrl?,
 * caption?, filename?, template?, messageId?, emoji?, latitude?,
 * longitude?, name?, address?, contacts?, messageIds? }. Externo (Meta
 * Cloud API) → permissivo.
 */

/**
 * whatsapp-webhook@v1 — re-exportado de webhook-schemas.ts (fonte canônica;
 * contract-schemas.ts o importa e registra mas não o re-exporta). Payload
 * Meta: entry[] → changes[] → value{statuses?, messages?}. Webhook externo
 * → permissivo.
 */

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
  "evolution-credentials-write":   { v1: EvolutionCredentialsWriteV1Schema },
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
  "elevenlabs-voice":              { v1: ElevenLabsVoiceV1Schema },
  "elevenlabs-tts":                { v1: ElevenLabsTtsV1Schema },
  "elevenlabs-sts":                { v1: ElevenLabsStsV1Schema },

  // Contratos com validação própria (fecha gap CONTRACTS ⊇ CONTRACT_SCHEMAS)
  "whatsapp-webhook":              { v1: WhatsappWebhookV1Schema },
  "sicoob-bridge":                 { v1: SicoobBridgeV1Schema },
  "sicoob-bridge-reply":           { v1: SicoobBridgeReplyV1Schema },
  "bitrix-api":                    { v1: BitrixApiV1Schema },
  "whatsapp-cloud-send":           { v1: WhatsappCloudSendV1Schema },
  "public-api":                    { v1: PublicApiV1Schema },
  "ai-proxy":                      { v1: AiProxyV1Schema },
  "ai-suggest-reply":              { v1: AiSuggestReplyV1Schema },
  "ai-enhance-message":            { v1: AiEnhanceMessageV1Schema },
  "ai-transcribe-audio":           { v1: AiTranscribeAudioV1Schema },
  "audio-transcribe":              { v1: AudioTranscribeV1Schema },
  "ai-conversation-analysis":      { v1: AiConversationAnalysisV1Schema },
  "ai-conversation-summary":       { v1: AiConversationSummaryV1Schema },
  "ai-churn-analysis":             { v1: AiChurnAnalysisV1Schema },
  "ai-auto-tag":                   { v1: AiAutoTagV1Schema },
  "elevenlabs-tts-stream":         { v1: ElevenLabsTtsStreamV1Schema },
  "classify-emoji":                { v1: ClassifyEmojiV1Schema },
  "classify-sticker":              { v1: ClassifyStickerV1Schema },
  "elevenlabs-sfx":                { v1: ElevenLabsSfxV1Schema },
  "elevenlabs-dialogue":           { v1: ElevenLabsDialogueV1Schema },
  "elevenlabs-voice-design":       { v1: ElevenLabsVoiceDesignV1Schema },
  "create-user":                   { v1: CreateUserV1Schema },
  "approve-password-reset":        { v1: ApprovePasswordResetV1Schema },
  "detect-new-device":             { v1: AISchemas.DetectNewDeviceV1Schema },
  "webauthn":                      { v1: WebauthnV1Schema },
  "evolution-api":                 { v1: EvolutionApiV1Schema },

  // ─── Onda 1 (2026-08-04): cobertura 100% — schemas reais dos workers ───
  "ai-classify-tickets":  { v1: AISchemas.AiClassifyTicketsV1Schema },
  "ai-router":  { v1: AISchemas.AiRouterV1Schema },
  "automation-suggest-reply":  { v1: AISchemas.AutomationSuggestReplyV1Schema },
  "batch-fetch-avatars":  { v1: InfraSchemas.BatchFetchAvatarsV1Schema },
  "chatbot-l1":  { v1: AISchemas.ChatbotL1V1Schema },
  "classify-audio-meme":  { v1: AISchemas.ClassifyAudioMemeV1Schema },
  "cleanup-rate-limit-logs":  { v1: InfraSchemas.CleanupRateLimitLogsV1Schema },
  "cleanup-storage-orphans":  { v1: InfraSchemas.CleanupStorageOrphansV1Schema },
  "client-observability":  { v1: InfraSchemas.ClientObservabilityV1Schema },
  "connection-test":  { v1: InfraSchemas.ConnectionTestV1Schema },
  "contact-media":  { v1: InfraSchemas.ContactMediaV1Schema },
  "elevenlabs-agent-token":  { v1: InfraSchemas.ElevenlabsAgentTokenV1Schema },
  "elevenlabs-scribe-token":  { v1: InfraSchemas.ElevenlabsScribeTokenV1Schema },
  "fetch-whatsapp-avatar":  { v1: InfraSchemas.FetchWhatsappAvatarV1Schema },
  "file-security-scanner":  { v1: InfraSchemas.FileSecurityScannerV1Schema },
  "get-mapbox-token":  { v1: InfraSchemas.GetMapboxTokenV1Schema },
  "get-sip-password":  { v1: InfraSchemas.GetSipPasswordV1Schema },
  "lgpd-scheduled-jobs":  { v1: InfraSchemas.LgpdScheduledJobsV1Schema },
  "login-attempts":  { v1: InfraSchemas.LoginAttemptsV1Schema },
  "main":  { v1: InfraSchemas.MainV1Schema },
  "mcp":  { v1: InfraSchemas.McpV1Schema },
  "mcp-server":  { v1: InfraSchemas.McpServerV1Schema },
  "migrate-media-storage":  { v1: InfraSchemas.MigrateMediaStorageV1Schema },
  "nps-scheduler":  { v1: InfraSchemas.NpsSchedulerV1Schema },
  "outlook-oauth":  { v1: OutlookOauthV1Schema },
  "promogifts-catalog":  { v1: PromogiftsCatalogV1Schema },
  "provider-healthcheck":  { v1: InfraSchemas.ProviderHealthcheckV1Schema },
  "provider-router":  { v1: InfraSchemas.ProviderRouterV1Schema },
  "queue-rebalance":  { v1: InfraSchemas.QueueRebalanceV1Schema },
  "recover-corrupted-audios":  { v1: InfraSchemas.RecoverCorruptedAudiosV1Schema },
  "secure-upload":  { v1: InfraSchemas.SecureUploadV1Schema },
  "send-rate-limit-alert":  { v1: InfraSchemas.SendRateLimitAlertV1Schema },
  "sentiment-alert":  { v1: AISchemas.SentimentAlertV1Schema },
  "sicoob-outbox-consumer":  { v1: InfraSchemas.SicoobOutboxConsumerV1Schema },
  "sla-alert-forward":  { v1: InfraSchemas.SlaAlertForwardV1Schema },
  "sla-alert-log-failure":  { v1: InfraSchemas.SlaAlertLogFailureV1Schema },
  "speech-to-text":  { v1: AISchemas.SpeechToTextV1Schema },
  "talkx-add-recipients":  { v1: InfraSchemas.TalkxAddRecipientsV1Schema },
  "talkx-control":  { v1: InfraSchemas.TalkxControlV1Schema },
  "talkx-scheduler":  { v1: InfraSchemas.TalkxSchedulerV1Schema },
  "ticket-router":  { v1: InfraSchemas.TicketRouterV1Schema },
  "virustotal-test":  { v1: InfraSchemas.VirustotalTestV1Schema },
  "voice-agent":  { v1: AISchemas.VoiceAgentV1Schema },
  "voice-changer":  { v1: InfraSchemas.VoiceChangerMultipartV1Schema },
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
