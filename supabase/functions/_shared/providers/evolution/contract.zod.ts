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
 *    EvolutionResponse). O provedor varia entre v1/v2.3.x/v2.4.x e entre endpoints →
 *    SEMPRE permissivo (`.passthrough()`, campos opcionais, unions de formas
 *    conhecidas) — regra do incidente 2026-07-03: 422 indevido em payload
 *    real do provedor causa perda de dados.
 *  - REGRA DE MARCADOR (incidente 2026-07-03): todo response permissivo exige
 *    ao menos 1 CAMPO MARCADOR conhecido presente — `instance` em listInstances
 *    (elemento `{ instance: {...} }` do v2.3.x/v2.4.x/v2.4.x real), `key` OU `message` em
 *    respostas de mensagem, etc. Lixo total (`{}`, `{ foo: 'bar' }`) FALHA;
 *    qualquer payload real do provedor passa (nunca 422 em payload válido).
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
 * Marcador obrigatório (regra do incidente 2026-07-03): `key` OU `message`
 * presente — lixo total (`{}`, `{ status: 'PENDING' }` sem key/message) falha.
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
}).passthrough().refine(
  (v) => v.key !== undefined || v.message !== undefined,
  { message: "resposta de mensagem sem campo marcador (key | message)" },
);

/**
 * Instância da Evolution (connectionState/restartInstance/fetchInstances).
 * `state` incluso por compatibilidade (v2.3.x/fake devolvem
 * `{ instance: { state: 'open' } }`). Marcador: ao menos 1 campo conhecido.
 */
export const EvolutionGatewayInstanceSchema = z.object({
  instanceName: z.string().optional(),
  status: z.string().optional(),
  ownerJid: z.string().optional(),
  profileName: z.string().optional(),
  profilePicUrl: z.string().optional(),
  state: z.string().optional(),
}).passthrough().refine(
  (v) =>
    v.instanceName !== undefined || v.status !== undefined ||
    v.ownerJid !== undefined || v.profileName !== undefined ||
    v.profilePicUrl !== undefined || v.state !== undefined,
  {
    message:
      "instância sem campo marcador (instanceName | status | ownerJid | profileName | profilePicUrl | state)",
  },
);

// ─── getConnectionState ──────────────────────────────────────────────────────

export const EvolutionGatewayConnectionStateResponseSchema = z.object({
  instance: EvolutionGatewayInstanceSchema.optional(),
  state: z.string().optional(),
  statusReason: z.object({
    code: z.number().optional(),
    message: z.string().optional(),
  }).passthrough().optional(),
}).passthrough().refine(
  (v) => v.instance !== undefined || v.state !== undefined || v.statusReason !== undefined,
  { message: "getConnectionState sem campo marcador (instance | state | statusReason)" },
);

// ─── getQrCode ───────────────────────────────────────────────────────────────

/**
 * v2.3.x devolve `{ base64, code, count, pairingCode? }`; `qrcode` é shape
 * legado (fake/versões antigas). Marcador: ao menos 1 campo conhecido.
 */
export const EvolutionGatewayQrCodeResponseSchema = z.object({
  base64: z.string().optional(),
  code: z.string().optional(),
  count: z.number().optional(),
  pairingCode: z.string().optional(),
  qrcode: z.object({
    base64: z.string().optional(),
    code: z.string().optional(),
    count: z.number().optional(),
  }).passthrough().optional(),
  groups: z.array(z.unknown()).optional(),
}).passthrough().refine(
  (v) =>
    v.base64 !== undefined || v.code !== undefined || v.count !== undefined ||
    v.pairingCode !== undefined || v.qrcode !== undefined || v.groups !== undefined,
  { message: "getQrCode sem campo marcador (base64 | code | count | pairingCode | qrcode | groups)" },
);

// ─── restartInstance ─────────────────────────────────────────────────────────

export const EvolutionGatewayRestartResponseSchema = z.object({
  restart: z.boolean().optional(),
  instance: EvolutionGatewayInstanceSchema.optional(),
  error: z.string().optional(),
}).passthrough().refine(
  (v) => v.restart !== undefined || v.instance !== undefined || v.error !== undefined,
  { message: "restartInstance sem campo marcador (restart | instance | error)" },
);

// ─── listInstances ───────────────────────────────────────────────────────────

/**
 * Elemento REAL do v2.3.x/v2.4.x (fetchInstances): o objeto da instância vem ANINHADO
 * sob a chave `instance` (`{ instance: {...}, integration? }`) — ver fixture
 * do v237-fallback.test.ts e o default do fakeProvider.
 */
export const EvolutionGatewayInstanceWrapperSchema = z.object({
  instance: EvolutionGatewayInstanceSchema,
  integration: z.string().optional(),
}).passthrough();

/**
 * v2.3.x/v2.4.x real: array de `{ instance: {...} }` (marcador `instance` por
 * elemento). v1/versões antigas: array puro de instâncias (marcador: 1 campo
 * conhecido). Algumas versões: wrapper `{ instances: [...] }` (exige a chave
 * `instances`). Array vazio `[]` é resposta legítima (zero instâncias) e
 * passa; `null` NÃO é shape real do fetchInstances → falha (lixo).
 */
export const EvolutionGatewayListInstancesResponseSchema = z.union([
  z.array(EvolutionGatewayInstanceWrapperSchema),
  z.array(EvolutionGatewayInstanceSchema),
  z.object({
    instances: z.array(
      z.union([EvolutionGatewayInstanceWrapperSchema, EvolutionGatewayInstanceSchema]),
    ).optional(),
  }).passthrough().refine(
    (v) => v.instances !== undefined,
    { message: "listInstances: wrapper sem campo marcador 'instances'" },
  ),
]);

// ─── listGroups ──────────────────────────────────────────────────────────────

/**
 * Grupo do fetchAllGroups (getParticipants=false → sem participants).
 * Marcador: ao menos 1 campo conhecido presente.
 */
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
}).passthrough().refine(
  (v) =>
    v.id !== undefined || v.subject !== undefined || v.subjectOwner !== undefined ||
    v.subjectTime !== undefined || v.size !== undefined || v.creation !== undefined ||
    v.owner !== undefined || v.desc !== undefined || v.participants !== undefined,
  {
    message:
      "grupo sem campo marcador (id | subject | subjectOwner | subjectTime | size | creation | owner | desc | participants)",
  },
);

/** v2.3.x retorna array puro; algumas versões embrulham em `{ groups: [...] }`. `null` não é shape real → falha. */
export const EvolutionGatewayListGroupsResponseSchema = z.union([
  z.array(EvolutionGatewayGroupSchema),
  z.object({
    groups: z.array(EvolutionGatewayGroupSchema).optional(),
  }).passthrough().refine(
    (v) => v.groups !== undefined,
    { message: "listGroups: wrapper sem campo marcador 'groups'" },
  ),
]);

// ─── checkWhatsApp ───────────────────────────────────────────────────────────

export const EvolutionGatewayCheckWhatsAppRequestSchema = z.object({
  numbers: z.array(z.string()).min(1),
}).passthrough();

/**
 * Item do whatsappNumbers: v2.3.x devolve `{ exists, jid }`; docs v1 usam
 * `{ number, numberExists, jid }`. Marcador: ao menos 1 campo conhecido.
 */
export const EvolutionGatewayWhatsAppNumberSchema = z.object({
  exists: z.boolean().optional(),
  jid: z.string().optional(),
  number: z.string().optional(),
  numberExists: z.boolean().optional(),
}).passthrough().refine(
  (v) =>
    v.exists !== undefined || v.jid !== undefined ||
    v.number !== undefined || v.numberExists !== undefined,
  {
    message:
      "checkWhatsApp: número sem campo marcador (exists | jid | number | numberExists)",
  },
);

/**
 * Endpoint devolve array de `{ exists, jid }` ou objeto único — aceita ambos;
 * wrapper `{ numbers: [...] }` exige a chave `numbers`. `null` não é shape
 * real → falha.
 */
export const EvolutionGatewayCheckWhatsAppResponseSchema = z.union([
  z.array(EvolutionGatewayWhatsAppNumberSchema),
  EvolutionGatewayWhatsAppNumberSchema,
  z.object({
    numbers: z.array(EvolutionGatewayWhatsAppNumberSchema).optional(),
  }).passthrough().refine(
    (v) => v.numbers !== undefined,
    { message: "checkWhatsApp: wrapper sem campo marcador 'numbers'" },
  ),
]);

// ─── getProfilePicture ───────────────────────────────────────────────────────

export const EvolutionGatewayGetProfilePictureRequestSchema = z.object({
  number: z.string().min(1),
}).passthrough();

/**
 * v2.3.x REAL devolve a chave `profilePictureUrl` (pode vir `null` quando o
 * contato não tem foto — consumidores como fetch-whatsapp-avatar leem
 * `profilePictureUrl` primeiro). v1 usava `url`; `profilePicUrl` é o shape
 * legado (fake/versões antigas). Payload `null` (v2.3.x sem foto) também é
 * aceito. Marcador: ao menos 1 das chaves presente — lixo total falha.
 */
export const EvolutionGatewayGetProfilePictureResponseSchema = z.union([
  z.object({
    profilePictureUrl: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    profilePicUrl: z.string().nullable().optional(),
  }).passthrough().refine(
    (v) =>
      v.profilePictureUrl !== undefined || v.url !== undefined ||
      v.profilePicUrl !== undefined,
    {
      message:
        "getProfilePicture sem campo marcador (profilePictureUrl | url | profilePicUrl)",
    },
  ),
  z.null(),
]);

// ─── sendText / sendMedia / sendSticker ──────────────────────────────────────

/**
 * sendText — envelope v2 (obrigatório no gateway): o texto vai em
 * `textMessage.text`. Na v1 da Evolution o campo era `text` no top-level;
 * o client.ts SEMPRE envia o envelope v2 e o contrato valida esse shape.
 */
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
