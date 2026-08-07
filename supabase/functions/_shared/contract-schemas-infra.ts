/**
 * Contract Schemas — Infraestrutura (registro dedicado).
 *
 * Schemas Zod V1 das Edge Functions de infraestrutura/operação de zapp-web-v3
 * (observabilidade, roteamento, segurança de arquivos, alertas, crons),
 * derivados do CONSUMO REAL do body no `index.ts` de cada endpoint (nunca
 * inventados). Ver comentário em cada bloco com a referência do campo.
 *
 * Convenções (mesmas de contract-schemas.ts):
 *  - Endpoints INTERNOS (UI/cron/service-role chamam): estritos — `.strict()`,
 *    enums fechados, UUID, limites de tamanho — para falhar cedo com 422.
 *  - Multipart (file-security-scanner, secure-upload, voice-changer): campos
 *    de arquivo via `z.custom<File>` (File é global no Deno; padrão
 *    ElevenLabsStsV1Schema em contract-schemas.ts:413).
 *  - GET/cron sem body (17 funções): `EmptyStrictV1Schema` (body opcional).
 */
import { z } from "https://esm.sh/zod@3.23.8";
import { RateLimitAlertSchema } from "./schemas.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Corpo vazio estrito — para endpoints GET/cron que não consomem body.
 * `{}` (ou body ausente, tratado como `{}` pelo parseOrReject) passa; qualquer
 * campo desconhecido é rejeitado com 422.
 */
export const EmptyStrictV1Schema = z.object({}).strict();

/**
 * Opções de cron — endpoints disparados por pg_cron podem receber body vazio
 * ou campos opcionais de agendamento; o contrato base aceita `{}` e rejeita
 * campos desconhecidos (estrito). Usado pelas funções de scheduler.
 */

// ─── GET/cron sem body (EmptyStrictV1Schema) ─────────────────────────────────
// Nenhuma destas lê `await req.json()` no index.ts (verificado por grep).

/** batch-fetch-avatars@v1 — GET/cron; não consome body. */
export const BatchFetchAvatarsV1Schema = EmptyStrictV1Schema;

/** cleanup-rate-limit-logs@v1 — cron; não consome body. */
export const CleanupRateLimitLogsV1Schema = EmptyStrictV1Schema;

/** cleanup-storage-orphans@v1 — cron; não consome body. */
export const CleanupStorageOrphansV1Schema = EmptyStrictV1Schema;

/** elevenlabs-agent-token@v1 — GET; não consome body. */
export const ElevenlabsAgentTokenV1Schema = EmptyStrictV1Schema;

/** elevenlabs-scribe-token@v1 — GET; não consome body. */
export const ElevenlabsScribeTokenV1Schema = EmptyStrictV1Schema;

/** get-mapbox-token@v1 — GET; não consome body. */
export const GetMapboxTokenV1Schema = EmptyStrictV1Schema;

/** get-sip-password@v1 — GET; não consome body. */
export const GetSipPasswordV1Schema = EmptyStrictV1Schema;

/** lgpd-scheduled-jobs@v1 — cron; não consome body. */
export const LgpdScheduledJobsV1Schema = EmptyStrictV1Schema;

/** main@v1 — rota raiz/health; não consome body. */
export const MainV1Schema = EmptyStrictV1Schema;

/** mcp@v1 — rota MCP; não consome body. */
export const McpV1Schema = EmptyStrictV1Schema;

/** migrate-media-storage@v1 — cron; não consome body. */
export const MigrateMediaStorageV1Schema = EmptyStrictV1Schema;

/** nps-scheduler@v1 — cron; não consome body. */
export const NpsSchedulerV1Schema = EmptyStrictV1Schema;

/** provider-healthcheck@v1 — cron; não consome body. */
export const ProviderHealthcheckV1Schema = EmptyStrictV1Schema;

/** sicoob-outbox-consumer@v1 — cron; não consome body. */
export const SicoobOutboxConsumerV1Schema = EmptyStrictV1Schema;

/** talkx-scheduler@v1 — cron; não consome body. */
export const TalkxSchedulerV1Schema = EmptyStrictV1Schema;

/**
 * reprocess-failed-messages@v1 — cron; não consome body no index.ts
 * (o `payload` lido vem de rows do banco, não do request).
 * NOTA: contract-schemas.ts já registra este nome com { limit?, dryRun? }
 * (derivado de comentário, não do código) — o consumo real é vazio.
 */
// (ReprocessFailedMessagesV1Schema removido daqui — o canônico é o real
// {limit?, dryRun?}.strict() em contract-schemas.ts:103. EmptyStrict aqui
// era definição morta e conflitava; validação Claude C4 2026-08-04.)

// ─── Observabilidade ─────────────────────────────────────────────────────────

/**
 * client-observability@v1 — POST interno (requireUser). index.ts:
 * `const body = await req.json(); const events = Array.isArray(body?.metrics)
 * ? body.metrics : [];` e consome event.name/value/rating/path (interface
 * VitalPayload no próprio index.ts). metrics[] vazio → 400.
 */
export const ClientObservabilityV1Schema = z.object({
  metrics: z.array(
    z.object({
      name: z.enum(["LCP", "FID", "CLS", "INP", "TTFB"]),
      value: z.number(),
      rating: z.enum(["good", "needs-improvement", "poor"]),
      delta: z.number(),
      id: z.string(),
      path: z.string().optional(),
      url: z.string().optional(),
      userAgent: z.string().optional(),
      timestamp: z.string().optional(),
    }),
  ).min(1),
}).strict();

/**
 * connection-test@v1 — POST interno (requireAdminOrSupervisor). index.ts:
 * `if (body?.mode === "official" || body?.mode === "unofficial") mode = body.mode;`
 * Body opcional (default "unofficial").
 */
export const ConnectionTestV1Schema = z.object({
  mode: z.enum(["official", "unofficial"]).optional(),
}).strict();

/**
 * contact-media@v1 — POST (ou GET por query params) autenticado por JWT.
 * index.ts consome: contact_id (UUID obrigatório), limit (default 30, clamp
 * 1..100), media_type (enum, default "all"), cursor (string opaco) e offset
 * (número ≥ 0). Schema espelha o body do POST (equivalente aos query params).
 */
export const ContactMediaV1Schema = z.object({
  contact_id: z.string().uuid("contact_id is required and must be a UUID"),
  limit: z.number().int().min(1).max(100).optional(),
  media_type: z.enum(["image", "video", "audio", "document", "all"]).optional(),
  cursor: z.string().optional(),
  offset: z.number().int().min(0).optional(),
}).strict();

/**
 * fetch-whatsapp-avatar@v1 — POST interno (requireUser). index.ts:
 * `const phoneRaw = body?.phone;` — phone string obrigatória (dígitos).
 */
export const FetchWhatsappAvatarV1Schema = z.object({
  phone: z.string().min(1).max(32),
}).strict();

// ─── Segurança / upload ──────────────────────────────────────────────────────

/**
 * login-attempts@v1 — POST interno. index.ts: `body.action` (obrigatório,
 * enum), `body.email` (obrigatório, validado por regex de email, max 255) e
 * `body.userAgent` (interface LoginAttemptRequest, opcional/nullable).
 */
export const LoginAttemptsV1Schema = z.object({
  action: z.enum(["check", "record_failed", "clear"]),
  email: z.string().email().max(255),
  userAgent: z.string().max(500).optional().nullable(),
}).strict();

/**
 * file-security-scanner@v1 — MULTIPART (POST, requireUser). index.ts:
 * `formData.get("file")` (File obrigatório) e `formData.get("bucket")`
 * (string, default "uploads", allowlist).
 */
export const FileSecurityScannerV1Schema = z.object({
  file: z.custom<File>((v) => v instanceof File, {
    message: "file deve ser um arquivo (multipart form-data)",
  }),
  bucket: z.string().max(100).optional(),
}).strict();

/**
 * secure-upload@v1 — MULTIPART (POST, requireUser). index.ts:
 * `formData.get("file")` (File obrigatório), `formData.get("bucket")`
 * (string, default "whatsapp-media") e `formData.get("path")`
 * (string|null, sanitizado).
 */
export const SecureUploadV1Schema = z.object({
  file: z.custom<File>((v) => v instanceof File, {
    message: "file deve ser um arquivo (multipart form-data)",
  }),
  bucket: z.string().max(100).optional(),
  path: z.string().max(500).optional().nullable(),
}).strict();

/**
 * voice-changer@v1 — MULTIPART (ou JSON). index.ts, branch multipart:
 * `formData.get('audio')` (Blob/File), `voice_preset` (string, default
 * 'grave'), `task_id` (string|null) e `authorized` ('true'/'false' como
 * string no multipart; boolean no branch JSON). Schema multipart.
 * NOTA: edge-contract-schemas.ts registra 'voice-changer' com o schema JSON
 * (VoiceChangerV1Schema em schemas.ts: { task_id?, authorized? }) — este
 * cobre o fluxo multipart; reconciliar na consolidação.
 */
export const VoiceChangerMultipartV1Schema = z.object({
  audio: z.custom<File>((v) => v instanceof File, {
    message: "audio deve ser um arquivo (multipart form-data)",
  }),
  voice_preset: z.string().max(50).optional(),
  task_id: z.string().max(100).optional().nullable(),
  authorized: z.union([z.boolean(), z.string()]).optional(),
}).strict();

// ─── Alertas / SLA ───────────────────────────────────────────────────────────

/**
 * send-rate-limit-alert@v1 — POST interno (requireServiceRoleOrCron). index.ts
 * valida com `RateLimitAlertSchema` (schemas.ts) via parseBody — reutilizado
 * aqui para não divergir da validação real: { ip_address, endpoint,
 * request_count, blocked? }.
 */
export const SendRateLimitAlertV1Schema = RateLimitAlertSchema;

/**
 * sla-alert-forward@v1 — POST interno (requireUser). index.ts define e usa
 * `PayloadSchema` (safeParse): contact_id, contact_name, kind, severity,
 * scope, rule_name?, duration_ms?, occurred_at?. Espelhado 1:1 + .strict()
 * (endpoint interno).
 */
export const SlaAlertForwardV1Schema = z.object({
  contact_id: z.string().min(1),
  contact_name: z.string().min(1),
  kind: z.enum(["first_response", "resolution", "delivery_delay"]),
  severity: z.enum(["warning", "breached"]),
  scope: z.enum(["current", "queue", "agent", "none"]),
  rule_name: z.string().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
  occurred_at: z.string().optional(),
}).strict();

/**
 * sla-alert-log-failure@v1 — POST autenticado. index.ts (FailurePayload):
 * contact_id (uuid|null obrigatório), attempted_event_type (string obrigatória
 * ≤64), event_type?, error_code?, error_message? (slice 500), error_details?
 * (slice 1000), original_metadata? (record|null).
 */
export const SlaAlertLogFailureV1Schema = z.object({
  contact_id: z.string().uuid().nullable(),
  attempted_event_type: z.string().min(1).max(64),
  event_type: z.string().max(64).optional(),
  error_code: z.string().max(100).optional().nullable(),
  error_message: z.string().max(500).optional().nullable(),
  error_details: z.string().max(1000).optional().nullable(),
  original_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

// ─── Roteamento / filas / TalkX / catálogo ───────────────────────────────────

/**
 * provider-router@v1 — POST interno (requireAdminOrSupervisor). index.ts
 * (RouteRequest): action (enum obrigatório), channel_connection_id?,
 * whatsapp_connection_id?, payload? (forwarded as-is ao provider).
 */
export const ProviderRouterV1Schema = z.object({
  action: z.enum(["sendText", "sendMedia", "getStatus", "ping"]),
  channel_connection_id: z.string().max(100).optional(),
  whatsapp_connection_id: z.string().max(100).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
}).strict();

/**
 * queue-rebalance@v1 — POST interno (requireServiceRoleOrCron). index.ts
 * (BulkRequest): limit? (default 50, clamp 1..200), dry_run? (boolean) e
 * source? (string, default "panel").
 */
export const QueueRebalanceV1Schema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  dry_run: z.boolean().optional(),
  source: z.string().max(50).optional(),
}).strict();

/**
 * recover-corrupted-audios@v1 — POST interno (requireServiceRoleOrCron).
 * index.ts: `const { batch_size = 20, offset = 0, dry_run = false } =
 * await req.json().catch(() => ({}));` — body opcional.
 */
export const RecoverCorruptedAudiosV1Schema = z.object({
  batch_size: z.number().int().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  dry_run: z.boolean().optional(),
}).strict();

/**
 * mcp-server@v1 — POST interno (requireUser). index.ts consome apenas
 * `body.method` (comparado a "list_tools"); demais campos não são lidos.
 * PERMISSIVO: endpoint publicado como servidor MCP HTTP (JSON-RPC 2.0 —
 * envelopes reais têm `jsonrpc`, `id`, `params`). `.strict()` rejeitaria
 * todo request legítimo com 422 (validação Claude, B1 2026-08-04).
 */
export const McpServerV1Schema = z.object({
  method: z.string().max(100).optional(),
}).passthrough();

/**
 * mcp-query@v1 — POST interno (header x-mcp-secret). index.ts consome
 * { sql: string, limit?: number (default 100) }. Gate adicionado 2026-08-07
 * (nasceu sem contrato — quebrava o contract-coverage; ver PR #957 follow-up).
 */
export const McpQueryV1Schema = z.object({
  sql: z.string().min(1, "sql é obrigatório").max(50_000),
  limit: z.number().int().min(1).max(10_000).optional(),
}).passthrough();

/**
 * talkx-add-recipients@v1 — POST interno (requireUser). index.ts
 * (AddRecipientsBody): campaignId (string obrigatória) e contactIds
 * (array não-vazio ≤1000).
 */
export const TalkxAddRecipientsV1Schema = z.object({
  campaignId: z.string().min(1).max(100),
  contactIds: z.array(z.string()).min(1).max(1000),
}).strict();

/**
 * talkx-control@v1 — POST interno (requireAdminOrSupervisor). index.ts:
 * campaignId (string obrigatória) e action (enum start|pause|cancel
 * obrigatório).
 */
export const TalkxControlV1Schema = z.object({
  action: z.enum(["start", "pause", "cancel"]),
  campaignId: z.string().min(1).max(100),
}).strict();

/**
 * ticket-router@v1 — POST interno (requireAdminOrSupervisor). index.ts
 * (RouteRequest): contact_id (string obrigatória), channel_connection_id?
 * (string|null), queue_id? (string|null) e apply? (boolean).
 */
export const TicketRouterV1Schema = z.object({
  contact_id: z.string().min(1).max(100),
  channel_connection_id: z.string().max(100).optional().nullable(),
  queue_id: z.string().max(100).optional().nullable(),
  apply: z.boolean().optional(),
}).strict();

/**
 * virustotal-test@v1 — POST interno (requireUser). index.ts:
 * `const { apiKey } = await req.json();` — apiKey string obrigatória.
 */
export const VirustotalTestV1Schema = z.object({
  apiKey: z.string().min(1).max(500),
}).strict();

// (PromogiftsCatalogV1Schema removido daqui na consolidação — a versão
// canônica é a discriminatedUnion com health em contract-schemas-integrations.ts,
// re-exportada por contract-schemas.ts. Definição duplicada = risco de drift.)

// (Registro local removido na consolidação — o registro canônico vive em
// contract-schemas.ts via namespace InfraSchemas.*)
