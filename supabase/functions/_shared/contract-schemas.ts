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
} from "./webhook-schemas.ts";
import type { SchemaMap } from "./contract-kit.ts";

/** Re-exported module members. */
export { z, EvolutionWebhookV1Schema, EvolutionWebhookV2Schema, MetaWebhookPayloadSchema };

// ─── Webhooks externos (permissivos) ─────────────────────────────────────────

/**
 * elevenlabs-webhook@v1 — index.ts consome: type|event_type, id|request_id, error.
 * Aceita `{}` (evento é logado como 'unknown', comportamento preservado).
 */
export const ElevenLabsWebhookV1Schema = z.object({
  type: z.string().max(100).nullish(),
  event_type: z.string().max(100).nullish(),
  id: z.union([z.string().max(200), z.number()]).nullish(),
  request_id: z.union([z.string().max(200), z.number()]).nullish(),
  error: z.unknown().optional(),
}).passthrough();

/**
 * gmail-webhook@v1 — index.ts consome: action (rotas internas), accountId,
 * message (envelope Pub/Sub push: { data: base64, messageId, publishTime }).
 * Union: chamada interna (action) OU push do Google (message).
 */
export const GmailWebhookV1Schema = z.object({
  action: z.string().max(100).nullish(),
  accountId: z.string().max(200).nullish(),
  message: z.object({
    data: z.string().max(1_000_000).nullish(),
    messageId: z.string().max(200).nullish(),
    publishTime: z.string().max(100).nullish(),
  }).passthrough().nullish(),
  subscription: z.string().max(500).nullish(),
}).passthrough();

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

// ─── Registro central: contrato → { versão → schema } ───────────────────────

/** C O N T R A C T_ S C H E M A S constant. */
export const CONTRACT_SCHEMAS: Record<string, SchemaMap> = {
  // Webhooks externos
  "evolution-webhook":       { v1: EvolutionWebhookV1Schema, v2: EvolutionWebhookV2Schema },
  "whatsapp-cloud-webhook":  { v1: MetaWebhookPayloadSchema, v2: MetaWebhookPayloadSchema },
  "elevenlabs-webhook":      { v1: ElevenLabsWebhookV1Schema },
  "gmail-webhook":           { v1: GmailWebhookV1Schema },

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
