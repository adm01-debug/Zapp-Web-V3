import { z } from 'https://esm.sh/zod@3.23.8';

/** Re-exported module members. */
export { z };

/**
 * Evolution Webhook V1 Schema
 *
 * NOTA: Evolution API 2.3.x envia `apikey: null` (e ocasionalmente
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
