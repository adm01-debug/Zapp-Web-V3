/**
 * Contract Schemas — Integrações externas (derivados).
 *
 * Contém APENAS os schemas DERIVADOS do consumo real que não tinham registro
 * prévio (outlook-oauth, promogifts-catalog). Os demais schemas de integração
 * vivem no registro central `contract-schemas.ts` — NÃO duplicar aqui.
 *
 * Convenção de permissividade (idêntica à do registro central):
 *  - Externos/API pública (provedor envia o payload): `.passthrough()` —
 *    nunca derrubar ingestão por campo novo do provedor.
 *  - Endpoints internos (UI/cron/JWT chama): `.strict()` — falhar cedo.
 */
import { z } from "https://esm.sh/zod@3.23.8";

/**
 * outlook-oauth@v1 — DERIVADO do index.ts (641 linhas). Endpoint INTERNO
 * (JWT obrigatório + rate-limit). Body roteado por `action` (linha 123:
 * `const action = typeof body.action === 'string' ? body.action : ''`) →
 * discriminatedUnion com as 7 rotas reais do handler. Variantes estritas:
 * campos extraídos do consumo real (`typeof body.X === 'string'` etc.),
 * nenhum campo inventado.
 */

/** Attachment de sendMessage — handler lê só name/contentType/content (com defaults). */
const OutlookOauthAttachmentV1Schema = z.object({
  name: z.string().max(255).optional(), // default 'file' no handler
  contentType: z.string().max(200).optional(), // default 'application/octet-stream'
  content: z.string().optional(), // base64; vazio → attachment descartado
}).passthrough(); // nunca rejeitar envio por metadado extra de attachment

const OutlookOauthGetAuthUrlV1Schema = z.object({
  action: z.literal("getAuthUrl"),
}).strict();

const OutlookOauthListProviderSupportV1Schema = z.object({
  action: z.literal("listProviderSupport"),
}).strict();

const OutlookOauthExchangeCodeV1Schema = z.object({
  action: z.literal("exchangeCode"),
  code: z.string().min(1, "code é obrigatório").max(4096),
  userId: z.string().min(1, "userId é obrigatório").max(200),
  state: z.string().min(1, "state é obrigatório").max(4096),
}).strict();

const OutlookOauthSyncInboxV1Schema = z.object({
  action: z.literal("syncInbox"),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  pageSize: z.number().min(1).max(500).optional(), // clampado [1,500] no handler (default 50)
  nextLink: z.string().max(2048).optional(), // validado contra graph.microsoft.com (anti-SSRF)
}).strict();

const OutlookOauthSendMessageV1Schema = z.object({
  action: z.literal("sendMessage"),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  to: z.union([
    z.string().min(1).max(320),
    z.array(z.string().min(1).max(320)).min(1).max(100),
  ]),
  cc: z.union([
    z.string().min(1).max(320),
    z.array(z.string().min(1).max(320)).min(1).max(100),
  ]).optional(),
  bcc: z.union([
    z.string().min(1).max(320),
    z.array(z.string().min(1).max(320)).min(1).max(100),
  ]).optional(),
  subject: z.string().min(1, "subject é obrigatório").max(500),
  bodyHtml: z.string().max(500_000).optional(),
  attachments: z.array(OutlookOauthAttachmentV1Schema).max(25).optional(),
}).strict();

const OutlookOauthMarkAsReadV1Schema = z.object({
  action: z.literal("markAsRead"),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  messageId: z.string().min(1, "messageId é obrigatório").max(500),
  isRead: z.boolean().optional(), // default true no handler
}).strict();

const OutlookOauthGetMessageBodyV1Schema = z.object({
  action: z.literal("getMessageBody"),
  accountId: z.string().min(1, "accountId é obrigatório").max(200),
  messageId: z.string().min(1, "messageId é obrigatório").max(500),
}).strict();

/** outlook-oauth@v1 — union discriminada por `action` com as rotas reais. */
export const OutlookOauthV1Schema = z.discriminatedUnion("action", [
  OutlookOauthGetAuthUrlV1Schema,
  OutlookOauthListProviderSupportV1Schema,
  OutlookOauthExchangeCodeV1Schema,
  OutlookOauthSyncInboxV1Schema,
  OutlookOauthSendMessageV1Schema,
  OutlookOauthMarkAsReadV1Schema,
  OutlookOauthGetMessageBodyV1Schema,
]);

/**
 * promogifts-catalog@v1 — DERIVADO do index.ts (313 linhas). Endpoint
 * INTERNO (Bearer JWT + rate-limit). Body real: { action, params? } —
 * roteado por `action` (ActionSchema: enum list_products|get_product|
 * list_categories|list_suppliers; `health` também é aceito via check
 * pré-Zod no handler) e `params` validado por rota (ListProductsSchema /
 * GetProductSchema). Variantes estritas derivadas do consumo real.
 */

/** params de list_products — espelha ListProductsSchema do index.ts (todos com default no handler). */
const PromogiftsListProductsParamsV1Schema = z.object({
  search: z.string().max(200).optional(),
  category_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).optional(), // default 50
  offset: z.number().int().min(0).max(1_000_000).optional(), // default 0
  order_by: z.enum([
    "name", "sale_price", "stock_quantity", "brand", "created_at", "sku",
  ]).optional(), // default 'name'
  ascending: z.boolean().optional(), // default true
  only_active: z.boolean().optional(), // default true
  only_in_stock: z.boolean().optional(), // default false
}).strict();

/** params de get_product — espelha GetProductSchema do index.ts. */
const PromogiftsGetProductParamsV1Schema = z.object({
  product_id: z.string().uuid("product_id deve ser UUID"),
}).strict();

/** promogifts-catalog@v1 — union discriminada por `action` (rotas reais). */
export const PromogiftsCatalogV1Schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list_products"),
    params: PromogiftsListProductsParamsV1Schema.optional(),
  }).strict(),
  z.object({
    action: z.literal("get_product"),
    params: PromogiftsGetProductParamsV1Schema.optional(),
  }).strict(),
  z.object({
    action: z.literal("list_categories"),
    params: z.record(z.unknown()).optional(), // handler ignora params nesta rota
  }).strict(),
  z.object({
    action: z.literal("list_suppliers"),
    params: z.record(z.unknown()).optional(), // handler ignora params nesta rota
  }).strict(),
  z.object({
    action: z.literal("health"),
    params: z.record(z.unknown()).optional(), // handler ignora params nesta rota
  }).strict(),
]);
