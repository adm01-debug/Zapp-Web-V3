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
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
} from "./webhook-schemas.ts";
import {
  AiSuggestReplySchema,
  AiConversationSummarySchema,
  DetectNewDeviceSchema,
  AiChurnAnalysisV1Schema,
  ClassifyStickerV1Schema,
  AiConversationAnalysisV1Schema,
  AiEnhanceMessageV1Schema,
  AiProxyV1Schema,
  AiTranscribeAudioV1Schema,
  AiAutoTagSchema,
  isSafeHttpsUrl,
  isSafeHost,
  phoneOrJidField,
  phoneOnlyField,
} from "./schemas.ts";
/** ai-auto-tag@v1 — schema REAL (era placeholder). Proxy que injeta action:'auto_tag'
 * e repassa ao ai-router; validação do payload do cliente = AiAutoTagSchema estrito. */
export const AiAutoTagV1Schema = AiAutoTagSchema.strict();

import type { SchemaMap } from "./contract-kit.ts";
import * as AISchemas from "./contract-schemas-ai.ts";
import * as InfraSchemas from "./contract-schemas-infra.ts";
import { PromogiftsCatalogV1Schema } from "./contract-schemas-integrations.ts";


/** Re-exported module members. */
export {
  z,
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
  WhatsAppCloudWebhookV2Schema,
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
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

/**
 * evolution-notification-dispatcher@v1 — dispatcher da outbox de canais externos.
 * Cron chama sem body ({} aceito). limit controla o tamanho do batch (default 20,
 * teto 50 por ciclo); dryRun apenas lê/claima e devolve o batch sem enviar.
 * O body de ENTRADA é estrito ({limit?, dryRun?}). O RETORNO (não validado por
 * este schema) desde 2026-08-11 inclui config_used (itens cuja config de canal
 * foi lida via zapp.zapp_notif_config_get) e skipped_priority (itens descartados
 * por priority_filter da config), além de sent/failed/skipped_in_app.
 */
export const EvolutionNotificationDispatcherV1Schema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  dryRun: z.boolean().optional(),
}).strict();

/**
 * zapp-notifications-dispatch@v1 — executor DASHBOARD-08 (Etapa 68.4).
 * Evento que menciona uma conversa → dispatch pelos canais ativos de
 * `zapp.notification_channels_config`. conversation_id/workspace_id são
 * obrigatórios para DISPATCH REAL (contrato do produtor); o cron chama com {}
 * (heartbeat no-op, padrão dos crons do repo) — por isso os campos são
 * opcionais no gate, mas enums/UUIDs/tipos SÃO validados quando presentes.
 */
export const ZappNotificationsDispatchV1Schema = z.object({
  event_type: z.enum(['conversation_mentioned', 'new_message', 'sla_breach']).optional(),
  conversation_id: z.string().uuid({ message: 'conversation_id deve ser UUID' }).optional(),
  workspace_id: z.string().uuid({ message: 'workspace_id deve ser UUID' }).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  title: z.string().max(500).optional(),
  message: z.string().max(5000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();

/**
 * warroom-monthly-test@v1 (#1175) — POST-only, body IGNORADO por design
 * (payload de saída é fixo; zero risco de injeção/reflexão). Strict vazio:
 * satisfaz o Invariante 9 (registry-integrity proíbe placeholder permissivo).
 */
export const WarroomMonthlyTestV1Schema = z.object({}).strict();

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

/**
 * contacts-import@v1 — rows[] obrigatório; workspace_id default 'wpp2'.
 * Bloco 4 (2026-08-21): apesar do nome, workspace_id é o NOME DA INSTÂNCIA
 * WhatsApp (confirmado: index.ts usa como `rawInstanceName`), não um UUID.
 * O regex `/^[a-zA-Z0-9_-]{1,64}$/` vivia num bloco 400 manual pós-gate
 * ("Validate instance name to prevent URL path injection") — movido para
 * o schema; o bloco manual foi removido.
 * max(10_000) → max(50_000): o schema era mais restritivo que o handler,
 * que sempre documentou/checou manualmente até 50k ("Bulk CSV import — 50k
 * rows" no cabeçalho do index.ts) — como o gate roda ANTES do check manual,
 * o limite de 50k nunca era alcançado (10.001-50.000 linhas eram rejeitadas
 * cedo demais pelo próprio contrato).
 */
export const ContactsImportV1Schema = z.object({
  rows: z.array(z.record(z.unknown())).min(1, "rows vazio").max(50_000),
  workspace_id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, "workspace_id inválido").optional(),
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
 * evolution-group-sync@v1 — sync de grupos WhatsApp (Evolution fetchAllGroups
 * → zapp.zapp_upsert_group_from_event). Internal/cron (requireServiceRoleOrCron);
 * rota única action='groups' (default, corpo vazio {} válido para cron).
 * instanceName opcional (default 'wpp2', sanitizado no handler).
 */
export const EvolutionGroupSyncV1Schema = z.object({
  action: z.enum(["groups", "isonwa"]).optional(),
  instanceName: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).optional(),
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
  // Bloco 4 (2026-08-21): aceitava qualquer string ≤30 chars; number/to
  // (aliases) recebem telefone OU JID — phoneOrJidField reprova lixo sem
  // transformar o valor (mantém nullish: ausente em ações que não enviam).
  number: phoneOrJidField({ max: 30 }).nullish(),
  to: phoneOrJidField({ max: 30 }).nullish(),
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


/** email-health@v1 — GET health status (JWT required); no request body. */
export const EmailHealthV1Schema = z.object({}).strict();

// ─── Business/infra endpoints (v1 — estritos, derivados do consumo real) ────

/**
 * gmail-sync@v1 — UI envia { action, accountId, labelIds?, q?, pageToken?, maxResults? }.
 * action default 'listThreads'; maxResults clampado [1,100] no handler.
 */
export const GmailSyncV1Schema = z.object({
  action: z.enum(["listThreads", "syncFull", "syncLabels", "createLabel", "updateLabel", "deleteLabel"]).optional(),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  labelIds: z.array(z.string().min(1).max(200)).max(100).optional(),
  q: z.string().max(1000).optional(),
  pageToken: z.string().max(500).optional(),
  maxResults: z.number().int().min(1).max(100).optional(),
  // Label mutation fields (EMAIL-07)
  labelId: z.string().min(1).max(200).optional(),
  name: z.string().min(1).max(200).optional(),
  color: z.record(z.string().max(50)).optional(),
  labelListVisibility: z.enum(["labelShow", "labelShowIfUnread", "labelHide"]).optional(),
  messageListVisibility: z.enum(["show", "hide"]).optional(),
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
  // Bloco 4 (2026-08-21): endereço de login IMAP/SMTP (não header de e-mail
  // "Nome <endereço>" como zapp-email-inbound-webhook) — .email() é seguro aqui.
  email: z.string().max(320).email("email inválido").optional(),
  password: z.string().min(1).max(2000).optional(),
  provider: z.enum(["outlook", "yahoo", "gmail", "custom"]).optional(),
  // SEC-4 (Bloco 0, 2026-08-21): host de rede interna/privada bloqueado —
  // conecta via socket TCP direto (Deno.connect), risco de SSRF idêntico ao
  // de uma URL, só que sem scheme pra validar com isSafeHttpsUrl.
  imap_host: z.string().min(1).max(253).refine(isSafeHost, "imap_host não pode apontar para rede interna/privada").optional(),
  imap_port: z.number().int().min(1).max(65535).optional(),
  imap_use_ssl: z.boolean().optional(),
  smtp_host: z.string().min(1).max(253).refine(isSafeHost, "smtp_host não pode apontar para rede interna/privada").optional(),
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

/**
 * zapp-email-send@v1 — envio de email via Resend (caminho VIÁVEL pós EMAIL-02,
 * 2026-08-17). `to` aceita e-mail ou lista (≤50). Pelo menos um de html/text.
 * attachments: base64 (content) — o handler valida tamanho (≤20MB, limite do
 * bucket email-attachments) e grava cópia no storage antes de enviar.
 */
const EmailAttachmentV1Schema = z.object({
  filename: z.string().min(1).max(255),
  content_type: z.string().max(200).optional(),
  content: z.string().min(1, "attachment content (base64) vazio"),
});

/** zapp-email-send@v1 — payload de envio. */
export const ZappEmailSendV1Schema = z.object({
  to: z.union([EmailAddr, z.array(EmailAddr).min(1).max(50)]),
  subject: z.string().min(1, "subject vazio").max(500),
  html: z.string().max(500_000).optional(),
  text: z.string().max(500_000).optional(),
  reply_to: EmailAddr.optional(),
  attachments: z.array(EmailAttachmentV1Schema).max(10, "máximo de 10 anexos").optional(),
}).passthrough().superRefine((val, ctx) => {
  if (!val.html && !val.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["html"],
      message: "pelo menos um de html/text é obrigatório",
    });
  }
});

/**
 * zapp-email-inbound-webhook@v1 — envelope do webhook de entrada do Resend
 * (inbound emails). PERMISSIVO (passthrough + campos opcionais): o provider
 * evolui o payload e a ingestão nunca pode cair por campo novo. Auth é por
 * segredo (x-webhook-secret / ?token=) e/ou assinatura Svix — ver index.ts.
 */
export const ZappEmailInboundWebhookV1Schema = z.object({
  id: z.string().min(1).max(200, "message id inválido"),
  from: z.string().min(1).max(500),
  to: z.array(z.string().max(500)).optional(),
  cc: z.array(z.string().max(500)).optional(),
  bcc: z.array(z.string().max(500)).optional(),
  subject: z.string().max(1000).optional(),
  text: z.string().max(2_000_000).optional(),
  html: z.string().max(5_000_000).optional(),
  attachments: z.array(EmailAttachmentV1Schema).max(20).optional(),
  headers: z.unknown().optional(),
  date: z.string().max(100).optional(),
}).passthrough().superRefine((val, ctx) => {
  // Bloco 2 (etapa 23, 2026-08-21 — fecha D2): regras portadas de
  // validateMinimalPayload (index.ts), que rodava ANTES do gate — o 422
  // canônico nunca era atingido, sempre caía num 400 artesanal
  // {error,details:string[]}. id/from já eram obrigatórios aqui (min(1));
  // to/subject/text-ou-html só existiam no check manual — consolidados
  // nesta única fonte de validação.
  if (
    !Array.isArray(val.to) || val.to.length === 0 ||
    !val.to.every((t) => typeof t === "string" && t.trim().length > 0)
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to: obrigatório (array de destinatários, não vazio)" });
  }
  if (typeof val.subject !== "string" || val.subject.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["subject"], message: "subject: obrigatório (assunto, string não vazia)" });
  }
  const text = typeof val.text === "string" ? val.text.trim() : "";
  const html = typeof val.html === "string" ? val.html.trim() : "";
  if (text.length === 0 && html.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["text"], message: "text/html: pelo menos um dos dois é obrigatório (corpo do email)" });
  }
});

/** Cron sem body — aceita somente {} (ou nada). Base dos schedulers internos. */
const EmptyStrictV1Schema = z.object({}).strict();



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
    // SEC-4 (Bloco 0, 2026-08-21): api_url persistida e usada em chamadas
    // futuras — exige https público, bloqueia SSRF pra rede interna/privada.
    api_url: z.string().url("api_url deve ser uma URL válida").max(500)
      .refine(isSafeHttpsUrl, "api_url não pode apontar para rede interna/privada"),
    api_key: z.string().min(1).max(500),
    display_name: z.string().max(200).optional().nullable(),
    department: z.string().max(200).optional().nullable(),
    is_active: z.boolean().optional(),
  }).passthrough(),
  z.object({
    action: z.literal("delete"),
    // Bloco 4 (2026-08-21): regex manual equivalente a .uuid() — padronizado
    // com o resto do arquivo (ex.: zapp-auto-export) para consistência.
    id: z.string().uuid("id deve ser um UUID válido"),
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

/** evolution-retry-metrics@v1 — GET admin (query params); sem body. */
export const EvolutionRetryMetricsV1Schema = EmptyStrictV1Schema;


/** db-health-monitor@v1 — cron de health check; sem body. */
export const DbHealthMonitorV1Schema = EmptyStrictV1Schema;

/** connection-health-check@v1 — GET (todas) ou POST { instanceName?, connectionId? } (verificar agora). */
export const ConnectionHealthCheckV1Schema = z.object({
  instanceName: z.string().min(1).max(100).optional(),
  connectionId: z.string().uuid().optional(),
}).strict();

/**
 * zapp-n8n-sync@v1 — POST interno (requireAdminOrSupervisor). Actions:
 *   - { action: 'status' } → estado real da integração n8n (not_configured
 *     honesto quando não há config em zapp.n8n_config);
 *   - { action: 'configure', baseUrl } → persiste a URL base (enabled
 *     permanece false — contrato desligado; ativação é passo futuro).
 * Estrito: endpoint interno da UI — falhar cedo em payload fora do contrato.
 */
export const ZappN8nSyncV1Schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status") }).strict(),
  // SEC-4 (Bloco 0, 2026-08-21): baseUrl aceita host sem protocolo no
  // contrato (o handler normaliza com https:// antes de persistir — ver
  // normalizeBaseUrl/handleConfigure) — isSafeHttpsUrl roda no handler,
  // DEPOIS da normalização, não aqui (senão rejeitaria "n8n.example.com").
  z.object({ action: z.literal("configure"), baseUrl: z.string().min(1).max(2048) }).strict(),
]);

/** health-check@v1 — probe GET; sem body. */
export const HealthCheckV1Schema = EmptyStrictV1Schema;

/** health@v1 — probe GET (?probe=1 | detalhado); sem body. */
export const HealthV1Schema = EmptyStrictV1Schema;

/** status@v1 — probe GET; sem body. */
export const StatusV1Schema = EmptyStrictV1Schema;

/** metrics@v1 — scrape Prometheus GET; sem body. */
export const MetricsV1Schema = EmptyStrictV1Schema;

/** send-scheduled-report@v1 — UI/manual envia { reportId } (compat). */
export const SendScheduledReportV1Schema = z.object({
  reportId: z.string().min(1, "reportId é obrigatório").max(200),
}).strict();

/** zapp-auto-export@v1 — AutoExport (G4): UI/cron envia { jobId, action? }. */
export const ZappAutoExportV1Schema = z.object({
  jobId: z.string().uuid("jobId deve ser um UUID válido"),
  /** 'run' (padrão): gera/regenera o arquivo. 'link': só renova a signed URL do arquivo existente. */
  action: z.enum(["run", "link"]).optional(),
}).strict();

/**
 * send-scheduled-report@v2 — modo batch (cron dispatch chama sem body):
 * claima runs pendentes da outbox (rpc_claim_pending_report_runs), faz
 * upload do artefato p/ storage zapp-reports, gera signed URL 7d e envia
 * email. `limit` opcional (1..100), `dryRun` só conta sem enviar.
 */
export const SendScheduledReportV2Schema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().optional(),
}).strict();

/** auto-close-conversations@v1 — cron; sem body. */
export const AutoCloseConversationsV1Schema = EmptyStrictV1Schema;

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
 export const SicoobBridgeNewMessageV1Schema = z.object({
   action: z.literal("new_message"),
   message_id: z.string().max(200),
   sender_name: z.string().max(200).optional().nullable(),
   // Bloco 4 (2026-08-21): campos metadados do webhook externo Sicoob —
   // formato validado (email/telefone) sem ficar tão estrito a ponto de
   // dropar payloads reais por variação de formatação de terceiro.
   sender_email: z.string().max(320).email().optional().nullable(),
   sender_phone: phoneOnlyField({ min: 1, max: 50 }).optional().nullable(),
   singular_name: z.string().max(200).optional().nullable(),
   singular_id: z.string().max(200).optional().nullable(),
   content: z.string().max(10000),
   vendedor_user_id: z.string().max(200).optional().nullable(),
   created_at: z.string().max(50).optional().nullable(),
   sender_id: z.string().max(200).optional().nullable(),
 }).passthrough();

 export const SicoobBridgeMarkReadV1Schema = z.object({
   action: z.literal("mark_read"),
   external_ids: z.array(z.string().max(200)).max(1000),
 }).passthrough();

 export const SicoobBridgeV1Schema = z.discriminatedUnion("action", [
   SicoobBridgeNewMessageV1Schema,
   SicoobBridgeMarkReadV1Schema,
 ]);

 /**
  * sicoob-bridge@v2 — mesmo discriminatedUnion de V1 com metadata de contrato:
  * `version` ("2.0") e `timestamp` de entrega em cada branch de action.
  *
  * Retrocompat: payload V1 (sem `version`) falha V2 e cai para V1 na
  * auto-detecção do parseOrReject; payload V2 valida contra V2. V1 permanece
  * aceito até o sunset registrado em contract-versions.ts.
  */
 export const SicoobBridgeV2Schema = z.discriminatedUnion("action", [
   SicoobBridgeNewMessageV1Schema.extend({
     version: z.literal("2.0"),
     timestamp: z.number().int().positive(),
   }),
   SicoobBridgeMarkReadV1Schema.extend({
     version: z.literal("2.0"),
     timestamp: z.number().int().positive(),
   }),
 ]);

/**
 * sicoob-bridge-reply@v1 — Bloco 2/3 (2026-08-21): contact_id/content
 * eram `.optional()`, mas o handler sempre exigiu os dois (bloco 400
 * manual: "typeof contact_id !== 'string' || ... || typeof content !==
 * 'string' || ..."). Agora obrigatórios no schema — o 422 canônico já
 * reprova; o bloco 400 manual foi removido. message_id/created_at/
 * agent_id continuam opcionais (agent_id vem do JWT quando ausente).
 */
export const SicoobBridgeReplyV1Schema = z.object({
  contact_id: z.string().min(1, "contact_id é obrigatório"),
  content: z.string().min(1, "content é obrigatório"),
  message_id: z.string().optional(),
  created_at: z.string().optional(),
  agent_id: z.string().optional(),
}).passthrough();

/**
 * sicoob-bridge-reply@v2 — estende V1 com metadata de contrato: `version`
 * ("2.0") e `timestamp` de entrega. Retrocompat idêntica aos demais webhooks
 * (auto-detecção tenta v2 primeiro; payload V1 cai para v1).
 */
export const SicoobBridgeReplyV2Schema = SicoobBridgeReplyV1Schema.extend({
  version: z.literal('2.0'),
  timestamp: z.number().int().positive(),
});

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
  * zapp-crm-sync@v1 — contrato de sync de conversa para o CRM plugável
  * (Etapa 66, SIM-CRM F1). Espelha o payload real do hook useSyncToCRM +
  * entity_id (zapp_conversation_id). Endpoint INTERNO (UI chama): estrito —
  * enum fechado de direction, UUID validado, limites — para falhar cedo com
  * 422 consistente. Secrets NUNCA transitam aqui (settings é não-secreta).
  */
 export const ZappCrmSyncV1Schema = z.object({
   entity_id: z.string().uuid().optional(),
   entity_data: z.object({
     // Bloco 4 (2026-08-21): min(1) aceitava qualquer string não-vazia.
     phone: phoneOnlyField({ min: 1, max: 50 }),
     channel: z.string().min(1),
     direction: z.enum(["inbound", "outbound"]),
     assunto: z.string().nullable().optional(),
     resumo: z.string().nullable().optional(),
     sentiment: z.string().nullable().optional(),
     message_count: z.number().int().min(0).optional(),
     agent_name: z.string().nullable().optional(),
     zapp_conversation_id: z.string().nullable().optional(),
     dry_run: z.boolean().optional(),
   }),
 }).strict();



 /**
  * whatsapp-cloud-send@v1 — schema REAL (espelha o antigo SendSchema local,
  * agora validado pelo gate). to min 5 + type enum obrigatórios; demais
  * campos opcionais. Permissivo (extras passam) — igual ao schema local.
  */
 export const WhatsappCloudSendV1Schema = z.object({
   // Bloco 4 (2026-08-21): min(5) aceitava qualquer string curta; `to`
   // recebe telefone OU JID (handler faz `to.includes('@')`, index.ts:133)
   // — phoneOrJidField reprova lixo sem quebrar o caminho JID (não transforma).
   to: phoneOrJidField(),
   type: z.enum([
     "text", "image", "video", "audio", "document", "sticker", "template",
     "reaction", "location", "contacts", "read", "interactive",
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
   interactive: z.object({
     type: z.enum(["button", "list", "cta_url"]),
     header: z.object({ type: z.string(), text: z.string().optional() }).passthrough().optional(),
     body: z.object({ text: z.string() }).passthrough().optional(),
     footer: z.object({ text: z.string() }).passthrough().optional(),
     action: z.record(z.unknown()).optional(),
   }).passthrough().optional(),
   idemKey: z.string().min(8).max(200).optional(),
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
 
/**
 * elevenlabs-tts-stream@v1 — Bloco 2/3 (2026-08-21): schema antigo validava
 * voice_id/model_id (snake_case) e speed/stability/similarity (campos que
 * o handler nunca leu — voice_settings é hardcoded). O consumo real é
 * `{ text, voiceId?, modelId?, languageCode?, applyTextNormalization? }`
 * (camelCase, ver index.ts). A validação de verdade vivia num bloco 400
 * manual, removido junto com este fix.
 */
export const ElevenLabsTtsStreamV1Schema = z.object({
  text: z.string().min(1, "text é obrigatório").max(10000),
  voiceId: z.string().min(1).optional(),
  modelId: z.string().min(1).optional(),
  languageCode: z.string().max(10).optional(),
  applyTextNormalization: z.string().max(20).optional(),
}).strict();

/**
 * elevenlabs-sfx@v1 — Bloco 2/3 (2026-08-21): schema antigo validava
 * text/duration_seconds/prompt_influence — esses são campos do body de
 * SAÍDA (para a API da ElevenLabs), não do body de ENTRADA do cliente. O
 * consumo real é `{ prompt, duration?, mode? }` (ver index.ts e o único
 * chamador, src/components/settings/media-library/AIGenerateDialog.tsx).
 * A validação de verdade vivia num bloco 400 manual, removido junto.
 */
export const ElevenLabsSfxV1Schema = z.object({
  prompt: z.string().min(1, "prompt é obrigatório").max(2000),
  duration: z.number().positive().max(300).optional(),
  mode: z.enum(["sfx", "music"]).optional(),
}).strict();

/**
 * elevenlabs-dialogue@v1 — Bloco 2/3 (2026-08-21): schema antigo validava
 * action/text/voice_id/model_id/dialogue (nenhum lido pelo index.ts) — o
 * consumo real é `{ script: [{voice_id, text}], languageCode? }` (ver
 * index.ts e o único chamador, src/components/voice/ElevenLabsDialogue.tsx).
 * A validação de verdade vivia num bloco 400 manual, removido junto com
 * este fix.
 */
export const ElevenLabsDialogueV1Schema = z.object({
  script: z.array(z.object({
    voice_id: z.string().min(1),
    text: z.string().min(1),
  })).min(1, "script precisa de ao menos 1 fala").max(100, "script aceita no máximo 100 falas"),
  languageCode: z.string().max(10).optional(),
}).strict();

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

/**
 * approve-password-reset@v1 — Bloco 2/3 (2026-08-21): schema antigo validava
 * reset_id/request_id (snake_case) e approved/decision — campos que o
 * handler NUNCA leu; o campo real é `requestId` (camelCase), e a validação
 * de verdade vivia num bloco 400 manual logo após o gate (`index.ts`,
 * "Guarda de compatibilidade: schema registrado é permissivo"). Reescrito
 * para refletir o consumo real do index.ts — o bloco manual foi removido.
 */
export const ApprovePasswordResetV1Schema = z.object({
  requestId: z.string().min(1, "requestId é obrigatório"),
  action: z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(1000).optional(),
}).strict();

/**
 * request-password-reset@v1 — solicitação PÚBLICA de reset (Etapa 55).
 * Endpoint anônimo (página /forgot-password): só email + dados opcionais de
 * contexto. STRICT por design: superfície pública não aceita campos extras.
 */
export const RequestPasswordResetV1Schema = z
  .object({
    email: z.string().email("Email inválido").max(254),
    reason: z.string().max(500).optional(),
    userAgent: z.string().max(1000).optional(),
    ipAddress: z.string().max(64).optional(),
  })
  .strict();

 /**
  * zapp-auth-sessions@v1 — gestão de sessões ativas (Etapa 56). Endpoint
  * interno (frontend autenticado). action obrigatório; userId só para
  * admin/supervisor (alvo de outro usuário); sessionIds obrigatório para
  * action=revoke. UUIDs validados no gate.
  */
export const ZappAuthSessionsV1Schema = z.object({
  action: z.enum(["list", "revoke", "revoke_all"]),
  userId: z.string().uuid("userId inválido").optional(),
  sessionIds: z.array(z.string().uuid("sessionId inválido")).min(1).max(100).optional(),
}).passthrough();

/**
 * revoke-session@v1 — revogação de sessão ativa (Etapa 56, PR #1179). Endpoint
 * interno (frontend autenticado) → estrito. sessionId obrigatório UUID de
 * auth.sessions; dono só revoga as próprias; admin/supervisor revoga de
 * outros (ownership revalidado no backend).
 */
export const RevokeSessionV1Schema = z.object({
  sessionId: z.string().uuid("sessionId deve ser um UUID de auth.sessions"),
}).strict();

/**
 * download-wa-status-media@v1 — chamado por pg_cron (30min) p/ baixar mídia
 * de status antes da URL expirar. Body fiel ao index.ts.
 * SEC-3 (2026-08-21): status_id compõe o path do storage
 * (`status/<data>/${status_id}.${ext}`) sem sanitização — path traversal /
 * poluição de bucket se `status_id` contiver `/` ou `..`. Regex restringe a
 * caracteres seguros de nome de arquivo (o formato real é um WhatsApp msg id,
 * alfanumérico).
 */
export const DownloadWaStatusMediaV1Schema = z.object({
  status_id: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/, "status_id contém caracteres inválidos"),
  participant_jid: z.string().min(1, "participant_jid é obrigatório").max(200),
  message_id: z.string().min(1, "message_id é obrigatório").max(200),
  message_type: z.string().optional(),
}).passthrough();

/**
 * transcribe-audio-internal@v1 — transcrição interna (invocada por outras edges).
 * Body fiel ao index.ts. SEC-2 (2026-08-21): audioUrl ia direto a `fetch()`
 * sem validação de host — SSRF para a rede interna (ex.: metadata endpoint,
 * RFC-1918) a partir de qualquer caller com HEALTH_SECRET. isSafeHttpsUrl
 * bloqueia localhost/RFC-1918/link-local/IPv6 interno (mesmo guard usado nos
 * schemas de IA para image_url).
 */
export const TranscribeAudioInternalV1Schema = z.object({
  messageId: z.string().min(1, "messageId é obrigatório"),
  audioUrl: z.string().url("audioUrl inválida").refine(isSafeHttpsUrl, {
    message: "audioUrl deve ser uma URL HTTPS pública (SSRF bloqueado)",
  }),
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
   // Bloco 4 (2026-08-21): max(320) aceitava qualquer string; .email() valida
   // formato de verdade (max mantido — limite RFC 5321 de endereço de e-mail).
   userEmail: z.string().max(320).email().optional().nullable(),
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
  // Bloco 4 (2026-08-21): aceitava qualquer string; number recebe telefone
  // OU JID (mesmo domínio de whatsapp-cloud-api/whatsapp-cloud-send) —
  // phoneOrJidField reprova lixo sem transformar o valor.
  number: phoneOrJidField({ min: 1, max: 100 }).optional(),
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
 * followup-bridge@v1 — POST { sequence_id, contact_jid, instance_name, trigger_event? }
 * v2 (G8 2026-08-17): sequence_id aceita o sequence_group TEXTUAL do motor real
 * (ex. 'stage_change_rules') OU o id UUID de uma regra avulsa — o edge resolve
 * contra zapp.evolution_followup_rules (v1 lia followup_sequences, 0 rows).
 */
export const FollowupBridgeV1Schema = z.object({
  sequence_id: z.string().min(1).max(100, { message: "sequence_id deve ter no máximo 100 chars" }),
  contact_jid: z.string().min(1).max(200),
  instance_name: z.string().min(1).max(100),
  trigger_event: z.string().max(100).optional(),
}).strict();

/** csat-auto-send@v1 — POST { contact_id, connection_id, survey_id?, agent_id?, conversation_id?, delay_minutes? } */
export const CsatAutoSendV1Schema = z.object({
  survey_id: z.string().uuid().nullish(),
  contact_id: z.string().uuid({ message: "contact_id deve ser UUID" }),
  agent_id: z.string().uuid().nullish(),
  connection_id: z.string().uuid({ message: "connection_id deve ser UUID" }),
  conversation_id: z.string().uuid().nullish(),
  delay_minutes: z.number().int().min(0).max(1440).nullish(),
}).strict();

/**
 * csat-dispatch@v1 — cron a cada 1min (job csat-dispatch-tick, migration
 * 20260817210000). Body opcional ({}, como os demais schedulers internos);
 * limit controla o batch do claim (default 50, teto 100); dryRun apenas
 * claima e devolve o batch sem enviar (devolvendo os surveys a 'scheduled').
 */
export const CsatDispatchV1Schema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  dryRun: z.boolean().optional(),
}).strict();

/**
 * zapp-sentry-sync@v1 — config Sentry persistida em zapp.sentry_config
 * (contrato G3: substitui o stub da UI com mockErrors). Endpoint interno da
 * UI — estrito. `action:'test'` dispara evento real no ingest do DSN
 * configurado; sem `action`, os campos presentes são upsertados (admin-only
 * no runtime via requireAdminOrSupervisor). dsn vazio = desligado.
 */
export const SentrySyncV1Schema = z.object({
  dsn: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  environment: z.enum(['production', 'staging', 'development']).optional(),
  traces_sample_rate: z.number().min(0).max(1).optional(),
  replays_session_sample_rate: z.number().min(0).max(1).optional(),
  replays_on_error_sample_rate: z.number().min(0).max(1).optional(),
  action: z.enum(['save', 'test']).optional(),
}).strict();

/**
 * zapp-google-calendar-sync@v1 — status do contrato Google Calendar (G1).
 * GET (status) ou POST com body opcional { dryRun }. Resposta SEMPRE 200:
 * { synced:false, reason:'not_configured'|'disabled'|'error' } — nunca 500 e
 * nunca 'not_implemented' (ADR 2026-08-18: chamador de front removido; ver
 * supabase/functions/zapp-google-calendar-sync/ADR.md).
 */
export const ZappGoogleCalendarSyncV1Schema = z.object({
  dryRun: z.boolean().optional(),
}).strict();

/**
 /** warroom-monthly-test@v1 — teste mensal do pipeline de alerta Warroom.
  * Sem parâmetros de entrada: o handler IGNORA o body (saída fixa).
  */
 export const ZappWarroomMonthlyTestV1Schema = z.object({}).strict();

/**
 * invite-user@v1 — POST { email, role?, message? } (Etapa 57: convite de
 * usuário). Endpoint interno admin-only. role default 'agent' (espelha o
 * CreateUserV1Schema do repo); message é nota opcional do convite.
 */
export const InviteUserV1Schema = z.object({
  email: z.string().email("Email inválido").max(255),
  role: z.enum(["admin", "supervisor", "agent"]).optional().default("agent"),
  message: z.string().max(500).optional(),
}).strict();


 export const CONTRACT_SCHEMAS: Record<string, SchemaMap> = {
  // Webhooks externos
  "evolution-webhook":       { v1: EvolutionWebhookV1Schema, v2: EvolutionWebhookV2Schema },
  "whatsapp-cloud-webhook":  { v1: MetaWebhookPayloadSchema, v2: WhatsAppCloudWebhookV2Schema },
  "gmail-webhook":           { v1: GmailWebhookV1Schema, v2: GmailWebhookV2Schema },

  // Internos / UI / cron
  "talkx-send":                 { v1: TalkxSendV1Schema },
  "revoke-session":       { v1: RevokeSessionV1Schema },
  "invite-user":          { v1: InviteUserV1Schema },
  "send-email":                 { v1: SendEmailV1Schema },
  // evolution-proxy (2026-08-14): proxy server-side — envelope validado manualmente
  // (allowlist de method + path); contrato registrado para o gate de cobertura.
  "gmail-send":                 { v1: GmailSendV1Schema },
  "reprocess-failed-messages":  { v1: ReprocessFailedMessagesV1Schema },
  "evolution-notification-dispatcher": { v1: EvolutionNotificationDispatcherV1Schema },
  "zapp-notifications-dispatch": { v1: ZappNotificationsDispatchV1Schema },
  "warroom-monthly-test": { v1: WarroomMonthlyTestV1Schema },
  "recheck-webhook-signature":  { v1: RecheckWebhookSignatureV1Schema },
  "webhook-diagnostic":         { v1: WebhookDiagnosticV1Schema },
  "instance-pause-control":     { v1: InstancePauseControlV1Schema },
  "contacts-import":            { v1: ContactsImportV1Schema },
  "voice-copilot-action":       { v1: VoiceCopilotActionV1Schema },
  "evolution-sync":             { v1: EvolutionSyncV1Schema },
  "evolution-consumer-stats": { v1: z.object({
    collected_at: z.string().optional(),
    replica: z.string().optional(),
    ok: z.number().optional(), shadow: z.number().optional(),
    retry: z.number().optional(), drop: z.number().optional(), err: z.number().optional(),
    pg_log_ok: z.number().optional(), pg_log_err: z.number().optional(),
    sentry_sent: z.number().optional(), resub: z.number().optional(),
    pg_stats_ok: z.number().optional(), pg_stats_err: z.number().optional(),
    drop_by: z.record(z.string(), z.number()).optional(),
    retry_by: z.record(z.string(), z.number()).optional(),
  }).passthrough() },
  "evolution-group-sync":       { v1: EvolutionGroupSyncV1Schema },
  "webhook-hmac-selftest":      { v1: WebhookHmacSelftestV1Schema },
  "webhook-secret-status":      { v1: WebhookSecretStatusV1Schema },
  "whatsapp-cloud-webhook-verify":  { v1: WhatsappCloudWebhookVerifyV1Schema },
  "whatsapp-cloud-secrets-status":  { v1: WhatsappCloudSecretsStatusV1Schema },
  "whatsapp-cloud-api":         { v1: WhatsappCloudApiV1Schema },
  "gmail-token-refresh":        { v1: GmailTokenRefreshV1Schema },
  "email-health":               { v1: EmailHealthV1Schema },
  "email-track-link":           { v1: EmailTrackLinkV1Schema },
  "email-track-pixel":          { v1: EmailTrackPixelV1Schema },
  "zapp-sentry-sync":           { v1: SentrySyncV1Schema },

  // Business / infra (v1)
  "gmail-sync":                    { v1: GmailSyncV1Schema },
  "gmail-oauth":                   { v1: GmailOauthV1Schema },
  "email-imap-bridge":             { v1: EmailImapBridgeV1Schema },
  // Email viável (pós EMAIL-02, 2026-08-17): webhook de entrada (Resend) e
  // envio via Resend API + storage. Ver supabase/functions/zapp-email-*/.
  "zapp-email-inbound-webhook":    { v1: ZappEmailInboundWebhookV1Schema },
  "zapp-email-send":               { v1: ZappEmailSendV1Schema },
  "evolution-credentials":         { v1: EvolutionCredentialsV1Schema },
  // Sub-rota POST do evolution-credentials (dual-route por design — sem
  // diretório próprio; não consta em EDGE_FUNCTION_NAMES. Auditoria A9).
  "evolution-credentials-write":   { v1: EvolutionCredentialsWriteV1Schema },
  "evolution-templates":           { v1: EvolutionTemplatesV1Schema },
  "evolution-retry-metrics":       { v1: EvolutionRetryMetricsV1Schema },
  "db-health-monitor":             { v1: DbHealthMonitorV1Schema },
  "connection-health-check":       { v1: ConnectionHealthCheckV1Schema },
  "health-check":                  { v1: HealthCheckV1Schema },
  "health":                        { v1: HealthV1Schema },
  "status":                        { v1: StatusV1Schema },
  "metrics":                       { v1: MetricsV1Schema },
  "zapp-auto-export":              { v1: ZappAutoExportV1Schema },
  "send-scheduled-report":         { v1: SendScheduledReportV1Schema, v2: SendScheduledReportV2Schema },
  "auto-close-conversations":      { v1: AutoCloseConversationsV1Schema },
  "elevenlabs-voice":              { v1: ElevenLabsVoiceV1Schema },
  "elevenlabs-tts":                { v1: ElevenLabsTtsV1Schema },

  // Contratos com validação própria (fecha gap CONTRACTS ⊇ CONTRACT_SCHEMAS)
  "sicoob-bridge":                 { v1: SicoobBridgeV1Schema, v2: SicoobBridgeV2Schema },
  "sicoob-bridge-reply":           { v1: SicoobBridgeReplyV1Schema, v2: SicoobBridgeReplyV2Schema },
  "bitrix-api":                    { v1: BitrixApiV1Schema },
  "whatsapp-cloud-send":           { v1: WhatsappCloudSendV1Schema },
  "public-api":                    { v1: PublicApiV1Schema },
  "ai-proxy":                      { v1: AiProxyV1Schema },
  "ai-suggest-reply":              { v1: AiSuggestReplyV1Schema },
  "ai-enhance-message":            { v1: AiEnhanceMessageV1Schema },
  "ai-transcribe-audio":           { v1: AiTranscribeAudioV1Schema },
  "ai-conversation-analysis":      { v1: AiConversationAnalysisV1Schema },
  "ai-conversation-summary":       { v1: AiConversationSummaryV1Schema },
  "ai-churn-analysis":             { v1: AiChurnAnalysisV1Schema },
  "ai-auto-tag":                   { v1: AiAutoTagV1Schema },
  "elevenlabs-tts-stream":         { v1: ElevenLabsTtsStreamV1Schema },
  "classify-sticker":              { v1: ClassifyStickerV1Schema },
  "elevenlabs-sfx":                { v1: ElevenLabsSfxV1Schema },
  "elevenlabs-dialogue":           { v1: ElevenLabsDialogueV1Schema },
  "create-user":                   { v1: CreateUserV1Schema },
  "approve-password-reset":        { v1: ApprovePasswordResetV1Schema },
  "request-password-reset":        { v1: RequestPasswordResetV1Schema },
  "detect-new-device":             { v1: AISchemas.DetectNewDeviceV1Schema },
  "webauthn":                      { v1: WebauthnV1Schema },
  "evolution-api":                 { v1: EvolutionApiV1Schema },
  "zapp-auth-sessions":            { v1: ZappAuthSessionsV1Schema },
  // zapp-auth-invite: registro fantasma removido em 2026-08-21 (a edge virou
  // invite-user, já registrado acima com InviteUserV1Schema; era o único
  // motivo do teste contract-kit.test.ts:206 estar vermelho — ver
  // contract-versions.ts, comentário equivalente já existente lá).
  "zapp-n8n-sync":                 { v1: ZappN8nSyncV1Schema },

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
  "elevenlabs-scribe-token":  { v1: InfraSchemas.ElevenlabsScribeTokenV1Schema },
  "fetch-whatsapp-avatar":  { v1: InfraSchemas.FetchWhatsappAvatarV1Schema },
  "file-security-scanner":  { v1: InfraSchemas.FileSecurityScannerV1Schema },
  "get-mapbox-token":  { v1: InfraSchemas.GetMapboxTokenV1Schema },
  "get-sip-password":  { v1: InfraSchemas.GetSipPasswordV1Schema },
  "zapp-get-sip-credentials":  { v1: InfraSchemas.ZappGetSipCredentialsV1Schema },
  "lgpd-scheduled-jobs":  { v1: InfraSchemas.LgpdScheduledJobsV1Schema },
  "login-attempts":  { v1: InfraSchemas.LoginAttemptsV1Schema },
  "main":  { v1: InfraSchemas.MainV1Schema },
  "mcp":  { v1: InfraSchemas.McpV1Schema },
  "mcp-server":  { v1: InfraSchemas.McpServerV1Schema },
  "mcp-query":   { v1: InfraSchemas.McpQueryV1Schema },
  "migrate-media-storage":  { v1: InfraSchemas.MigrateMediaStorageV1Schema },
  "nps-scheduler":  { v1: InfraSchemas.NpsSchedulerV1Schema },
  "promogifts-catalog":  { v1: PromogiftsCatalogV1Schema },
  "provider-healthcheck":  { v1: InfraSchemas.ProviderHealthcheckV1Schema },
  "provider-router":  { v1: InfraSchemas.ProviderRouterV1Schema },
  "recover-corrupted-audios":  { v1: InfraSchemas.RecoverCorruptedAudiosV1Schema },
  "secure-upload":  { v1: InfraSchemas.SecureUploadV1Schema },
  "send-rate-limit-alert":  { v1: InfraSchemas.SendRateLimitAlertV1Schema },
  "sentiment-alert":  { v1: AISchemas.SentimentAlertV1Schema },
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

  // ─── INBOX-09 / AUTOMACOES-09 ─────────────────────────────────────────────
  "followup-bridge": { v1: FollowupBridgeV1Schema },
  "csat-auto-send":  { v1: CsatAutoSendV1Schema },
  "download-wa-status-media":      { v1: DownloadWaStatusMediaV1Schema },
  "transcribe-audio-internal":     { v1: TranscribeAudioInternalV1Schema },
  "csat-dispatch":   { v1: CsatDispatchV1Schema },

  // ─── GOOGLE CALENDAR (contrato honesto, ADR 2026-08-18) ───────────────────
  "zapp-google-calendar-sync": { v1: ZappGoogleCalendarSyncV1Schema },

  // ─── OUTROS ────────────────────────────────────────────────────────────────
  // ─── CRM plugável (Etapa 66) ──────────────────────────────────────────────
  "zapp-crm-sync":   { v1: ZappCrmSyncV1Schema },
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
  EDGE_FUNCTION_NAMES,
  WebhookContractSchemas,
  ContractLifecycles,
} from './edge-contract-schemas.ts';
export { CloudWebhookV1Schema, CloudSendV1Schema } from './edge-contract-schemas.ts';
