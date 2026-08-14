/**
 * providers/evolution/contract.zod.ts — Contrato Zod do Gateway Evolution
 *
 * Define `evolutionGatewayContract`: contrato request/response de cada um dos
 * 12 verbos expostos por `providers/evolution/client.ts` (sendText, sendMedia,
 * sendSticker, getConnectionState, getQrCode, restartInstance, listInstances,
 * listGroups, checkWhatsApp, getProfilePicture + get/post genéricos).
 *
 * Convenções (padrão da casa — ver contract-schemas.ts e contract-kit.ts):
 *  - REQUEST valida o body que o GATEWAY ENVIA para a Evolution (nós
 *    controlamos o shape → pode ser mais estrito, porém sempre `.passthrough()`
 *    para não quebrar com campos aditivos).
 *  - RESPONSE valida o payload que a EVOLUTION DEVOLVE (o campo `data` de
 *    EvolutionResponse). O provedor varia entre v1/v2.3.x e entre endpoints →
 *    SEMPRE permissivo (`.passthrough()`, campos opcionais, unions de formas
 *    conhecidas) — regra do incidente 2026-07-03: 422 indevido em payload
 *    real do provedor causa perda de dados.
 *  - `get`/`post` genéricos: schema permissivo documentado (`z.unknown()`);
 *    o contrato real é path/query/body opaco re-encaminhado (allowlist de
 *    paths no evolution-proxy), não o shape do payload.
 *
 * ESCOPO: este arquivo NÃO participa do fluxo parseOrReject (contract-kit.ts)
 * — é contrato de CLIENT (saída para o provedor), não de endpoint (entrada).
 * Por isso NÃO é registrado em CONTRACT_SCHEMAS nem em CONTRACTS
 * (contract-versions.ts). Se no futuro o gateway for exposto como endpoint
 * com gate, o orquestrador deve registrar `evolution-gateway@v1`.
 */

import { z } from "https://esm.sh/zod@3.23.8";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Verbos do gateway Evolution cobertos pelo contrato. */
export type EvolutionGatewayVerb =
  | "sendText"
  | "sendMedia"
  | "sendSticker"
  | "getConnectionState"
  | "getQrCode"
  | "restartInstance"
  | "listInstances"
  | "listGroups"
  | "checkWhatsApp"
  | "getProfilePicture"
  | "get"
  | "post";

/** Entrada do contrato: schema do request (body enviado) e do response (payload da Evolution). */
export interface EvolutionGatewayContractEntry {
  request: z.ZodTypeAny;
  response: z.ZodTypeAny;
}

// ─── Schemas compartilhados ──────────────────────────────────────────────────

/**
 * Request vazio para verbos GET/DELETE (sem body). Permissivo para nunca
 * rejeitar query params extras (mesmo padrão de EmailTrackLinkV1Schema).
 */
export const EvolutionGatewayEmptyRequestSchema = z.object({}).passthrough();

/**
 * Recibo de mensagem da Evolution (sendText/sendMedia/sendSticker).
 * Shape Baileys: `{ key, message?, messageTimestamp, status }` — varia entre
 * v1 e v2.3.x → permissivo, campos conhecidos opcionais.
 */
export const EvolutionGatewayMessageResponseSchema = z.object({
  key: z.object({
    remoteJid: z.string().optional(),
    fromMe: z.boolean().optional(),
    id: z.string().optional(),
  }).passthrough().optional(),
  message: z.unknown().optional(),
  messageTimestamp: z.union([z.number(), z.string()]).optional(),
  status: z.string().optional(),
}).passthrough();

/** Instância da Evolution (connectionState/restartInstance/fetchInstances). */
export const EvolutionGatewayInstanceSchema = z.object({
  instanceName: z.string().optional(),
  status: z.string().optional(),
  ownerJid: z.string().optional(),
  profileName: z.string().optional(),
  profilePicUrl: z.string().optional(),
}).passthrough();

// ─── getConnectionState ──────────────────────────────────────────────────────

export const EvolutionGatewayConnectionStateResponseSchema = z.object({
  instance: EvolutionGatewayInstanceSchema.optional(),
  state: z.string().optional(),
  statusReason: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
  }).passthrough().optional(),
}).passthrough();

// ─── getQrCode ───────────────────────────────────────────────────────────────

export const EvolutionGatewayQrCodeResponseSchema = z.object({
  base64: z.string().optional(),
  code: z.string().optional(),
  count: z.number().optional(),
  pairingCode: z.string().optional(),
  groups: z.array(z.unknown()).optional(),
}).passthrough();

// ─── restartInstance ─────────────────────────────────────────────────────────

export const EvolutionGatewayRestartResponseSchema = z.object({
  restart: z.boolean().optional(),
  instance: EvolutionGatewayInstanceSchema.optional(),
}).passthrough();

// ─── listInstances ───────────────────────────────────────────────────────────

/** Evolução v2.3.x retorna array puro; algumas versões embrulham em objeto. */
export const EvolutionGatewayListInstancesResponseSchema = z.union([
  z.array(EvolutionGatewayInstanceSchema),
  z.object({ instances: z.array(EvolutionGatewayInstanceSchema).optional() }).passthrough(),
]);

// ─── listGroups ──────────────────────────────────────────────────────────────

/** Grupo do fetchAllGroups (getParticipants=false → sem participants). */
export const EvolutionGatewayGroupSchema = z.object({
  id: z.string().optional(),
  subject: z.string().optional(),
  subjectOwner: z.string().optional(),
  subjectTime: z.number().optional(),
  size: z.number().optional(),
  creation: z.number().optional(),
  owner: z.string().optional(),
  desc: z.string().optional(),
  participants: z.array(z.unknown()).optional(),
}).passthrough();

/** Evolução v2.3.x retorna array puro; algumas versões embrulham em objeto. */
export const EvolutionGatewayListGroupsResponseSchema = z.union([
  z.array(EvolutionGatewayGroupSchema),
  z.object({ groups: z.array(EvolutionGatewayGroupSchema).optional() }).passthrough(),
]);

// ─── checkWhatsApp ───────────────────────────────────────────────────────────

export const EvolutionGatewayCheckWhatsAppRequestSchema = z.object({
  numbers: z.array(z.string()).min(1),
}).passthrough();

export const EvolutionGatewayWhatsAppNumberSchema = z.object({
  exists: z.boolean().optional(),
  jid: z.string().optional(),
}).passthrough();

/** Endpoint devolve array de `{ exists, jid }` ou objeto único — aceita ambos. */
export const EvolutionGatewayCheckWhatsAppResponseSchema = z.union([
  z.array(EvolutionGatewayWhatsAppNumberSchema),
  EvolutionGatewayWhatsAppNumberSchema,
  z.object({}).passthrough(),
]);

// ─── getProfilePicture ───────────────────────────────────────────────────────

export const EvolutionGatewayGetProfilePictureRequestSchema = z.object({
  number: z.string().min(1),
}).passthrough();

/** `{ url }` com url vazia ou payload null em v2.3.x — aceita ambos. */
export const EvolutionGatewayGetProfilePictureResponseSchema = z.union([
  z.object({ url: z.string().nullable().optional() }).passthrough(),
  z.null(),
]);

// ─── sendText / sendMedia / sendSticker ──────────────────────────────────────

export const EvolutionGatewaySendTextRequestSchema = z.object({
  number: z.string().min(1),
  textMessage: z.object({ text: z.string().min(1) }).passthrough(),
}).passthrough();

/**
 * sendMedia recebe payload opaco (`Record<string, unknown>` no client).
 * Campos conhecidos do v2 (number, mediatype, media, url, caption,
 * fileName, mimetype) documentados como opcionais; resto passa intacto.
 */
export const EvolutionGatewaySendMediaRequestSchema = z.object({
  number: z.string().optional(),
  mediatype: z.string().optional(),
  media: z.string().optional(),
  url: z.string().optional(),
  caption: z.string().optional(),
  fileName: z.string().optional(),
  mimetype: z.string().optional(),
}).passthrough();

export const EvolutionGatewaySendStickerRequestSchema = z.object({
  number: z.string().min(1),
  stickerMessage: z.object({ url: z.string().min(1) }).passthrough(),
}).passthrough();

// ─── get/post genéricos (permissivos documentados) ───────────────────────────

/**
 * `get` — GET genérico (evolutionFetch GET). Request: body nulo — o contrato
 * real é path/query (allowlist do evolution-proxy), não o shape. Response:
 * payload arbitrário da Evolution. `z.unknown()` aceita qualquer valor sem
 * stripping nem rejeição — por design, nada a preservar/validar aqui.
 */
export const EvolutionGatewayGetRequestSchema = z.unknown();
export const EvolutionGatewayGetResponseSchema = z.unknown();

/**
 * `post` — POST genérico (evolutionFetch POST). Request: body opaco
 * re-encaminhado à Evolution (qualquer JSON estruturado ou primitivo).
 * Response: payload arbitrário da Evolution. Permissivo por design.
 */
export const EvolutionGatewayPostRequestSchema = z.unknown();
export const EvolutionGatewayPostResponseSchema = z.unknown();

// ─── Contrato agregado ───────────────────────────────────────────────────────

/**
 * Contrato Zod do Gateway Evolution — 12 verbos de `evolutionClient`.
 * Cada entrada valida request (body enviado à Evolution) e response
 * (payload `data` da Evolution, ANTES do envelope EvolutionResponse do client).
 */
export const evolutionGatewayContract: Record<EvolutionGatewayVerb, EvolutionGatewayContractEntry> = {
  sendText: {
    request: EvolutionGatewaySendTextRequestSchema,
    response: EvolutionGatewayMessageResponseSchema,
  },
  sendMedia: {
    request: EvolutionGatewaySendMediaRequestSchema,
    response: EvolutionGatewayMessageResponseSchema,
  },
  sendSticker: {
    request: EvolutionGatewaySendStickerRequestSchema,
    response: EvolutionGatewayMessageResponseSchema,
  },
  getConnectionState: {
    request: EvolutionGatewayEmptyRequestSchema,
    response: EvolutionGatewayConnectionStateResponseSchema,
  },
  getQrCode: {
    request: EvolutionGatewayEmptyRequestSchema,
    response: EvolutionGatewayQrCodeResponseSchema,
  },
  restartInstance: {
    request: EvolutionGatewayEmptyRequestSchema,
    response: EvolutionGatewayRestartResponseSchema,
  },
  listInstances: {
    request: EvolutionGatewayEmptyRequestSchema,
    response: EvolutionGatewayListInstancesResponseSchema,
  },
  listGroups: {
    request: EvolutionGatewayEmptyRequestSchema,
    response: EvolutionGatewayListGroupsResponseSchema,
  },
  checkWhatsApp: {
    request: EvolutionGatewayCheckWhatsAppRequestSchema,
    response: EvolutionGatewayCheckWhatsAppResponseSchema,
  },
  getProfilePicture: {
    request: EvolutionGatewayGetProfilePictureRequestSchema,
    response: EvolutionGatewayGetProfilePictureResponseSchema,
  },
  get: {
    request: EvolutionGatewayGetRequestSchema,
    response: EvolutionGatewayGetResponseSchema,
  },
  post: {
    request: EvolutionGatewayPostRequestSchema,
    response: EvolutionGatewayPostResponseSchema,
  },
};
