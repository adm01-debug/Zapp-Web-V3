import { z } from 'https://esm.sh/zod@3.23.8';

/** Re-exported module members. */
export { z };

/**
 * Evolution Webhook V1 Schema
 *
 * NOTA: Evolution API 2.3.x envia `apikey: "***"` (e ocasionalmente
 * `sender`/`data` nulos) em eventos connection.update quando a instância
 * está desconectada/deslogada. `.nullish()` aceita undefined E null;
 * `.optional()` rejeita null e causava 422 contract_violation.
 * NOTA 2: `data` pode chegar como ARRAY em eventos como labels.association
 * e messages.set — z.record() rejeita arrays no Zod 3.22, por isso o union.
 */
export const EvolutionWebhookV1Schema = z.object({
  event: z.string().trim().min(1),
  instance: z.string().trim().min(1),
  data: z.union([z.record(z.any()), z.array(z.any())]).nullish(),
  sender: z.string().trim().min(1).nullish(),
  apikey: z.string().trim().min(1).nullish(),
});

/**
 * Evolution Webhook V2 Schema (Draft / Future)
 * Adds explicit versioning and enhanced metadata
 */
export const EvolutionWebhookV2Schema = EvolutionWebhookV1Schema.extend({
  version: z.literal('2.0'),
  timestamp: z.number().int().positive(),
  environment: z.enum(['production', 'development', 'staging']).optional(),
});

/** Webhook Payload Schema constant. */
export const WebhookPayloadSchema = z.union([EvolutionWebhookV1Schema, EvolutionWebhookV2Schema]);

/**
 * WhatsApp Cloud Webhook Schemas (Meta)
 */
export const MetaWebhookChangeSchema = z.object({
  field: z.string().trim().min(1),
  value: z.object({
    messaging_product: z.literal('whatsapp').optional(),
    metadata: z
      .object({
        display_phone_number: z.string().trim().min(1).optional(),
        phone_number_id: z.string().trim().min(1).optional(),
      })
      .optional(),
    contacts: z.array(z.any()).optional(),
    messages: z.array(z.any()).optional(),
    statuses: z.array(z.any()).optional(),
  }),
});

/** Meta Webhook Entry Schema constant. */
export const MetaWebhookEntrySchema = z.object({
  id: z.string().trim().min(1),
  changes: z.array(MetaWebhookChangeSchema).min(1),
});

/** Meta Webhook Payload Schema constant. */
export const MetaWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(MetaWebhookEntrySchema).min(1),
});

/**
 * whatsapp-cloud-webhook@v2 — estende o envelope Meta (V1) com metadata de
 * contrato: version obrigatória ("2.0"), timestamp de entrega e
 * delivery_attempt (contagem de tentativas do provedor, opcional — webhooks
 * externos são permissivos por design).
 *
 * Retrocompat: payload V1 (sem `version`) continua validando contra V1; a
 * auto-detecção do parseOrReject tenta V2 primeiro e cai para V1.
 */
export const WhatsAppCloudWebhookV2Schema = MetaWebhookPayloadSchema.extend({
  version: z.literal('2.0'),
  timestamp: z.number().int().positive(),
  delivery_attempt: z.number().int().nonnegative().optional(),
});

/**
 * gmail-webhook@v1 — index.ts consome: action (rotas internas), accountId,
 * message (envelope Pub/Sub push: { data: base64, messageId, publishTime }).
 * Union: chamada interna (action) OU push do Google (message).
 */
export const GmailWebhookV1Schema = z.object({
  // SEC-1 hardening (2026-08-21): único action autenticado é 'registerWatch'
  // (index.ts:61 exige requireUser); qualquer outro POST é tratado como push
  // do Pub/Sub e exige token (index.ts, guarda `action !== 'registerWatch'`).
  // Enum fecha a superfície no schema — defesa em profundidade com o handler.
  action: z.enum(['registerWatch']).nullish(),
  accountId: z.string().max(200).nullish(),
  message: z.object({
    data: z.string().max(1_000_000).nullish(),
    messageId: z.string().max(200).nullish(),
    publishTime: z.string().max(100).nullish(),
  }).passthrough().nullish(),
  subscription: z.string().max(500).nullish(),
}).passthrough();

/**
 * gmail-webhook@v2 — estende V1 (todos os campos V1 + novos):
 * version ("2.0"), timestamp de recebimento e environment. V2 é a versão
 * current; V1 permanece aceito até o sunset registrado em contract-versions.ts.
 */
export const GmailWebhookV2Schema = GmailWebhookV1Schema.extend({
  version: z.literal('2.0'),
  timestamp: z.number().int().positive(),
  environment: z.enum(['production', 'development', 'staging']).optional(),
});

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
 * elevenlabs-webhook@v2 — estende V1 com version ("2.0") e timestamp de
 * entrega. Campos V1 continuam todos aceitos (retrocompat).
 */
export const ElevenLabsWebhookV2Schema = ElevenLabsWebhookV1Schema.extend({
  version: z.literal('2.0'),
  timestamp: z.number().int().positive(),
});

/**
 * whatsapp-webhook@v1 — esquema REAL do index.ts (webhook legado Meta Cloud
 * API: object + entry[].changes[].value com statuses/messages). Copiado
 * verbatim do Zod inline que o index.ts usava antes da consolidação —
 * sem .passthrough()/nullish de propósito: o endpoint valida estrito e
 * retorna 200 com warning em payload fora do contrato.
 */
export const WhatsappWebhookV1Schema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string().optional(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }).optional(),
        statuses: z.array(z.object({
          id: z.string().max(500),
          status: z.enum(['sent', 'delivered', 'read', 'failed']),
          timestamp: z.string(),
          recipient_id: z.string().optional(),
          errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(),
        })).optional(),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          timestamp: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
});
