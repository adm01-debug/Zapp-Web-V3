import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export { z };



/**
 * Evolution Webhook V1 Schema
 */
export const EvolutionWebhookV1Schema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.record(z.any()).optional(),
  // Evolution v2.3.x envia `sender`/`apikey` como null em eventos emitidos antes
  // da sessão autenticar (ex.: connection.update durante reconexão). `.optional()`
  // sozinho rejeita null e derrubava todo connection.update com 422.
  sender: z.string().nullish(),
  apikey: z.string().nullish(),
});

/**
 * Evolution Webhook V2 Schema (Draft / Future)
 * Adds explicit versioning and enhanced metadata
 */
export const EvolutionWebhookV2Schema = EvolutionWebhookV1Schema.extend({
  version: z.literal('2.0'),
  timestamp: z.number(),
  environment: z.enum(['production', 'development', 'staging']).optional(),
});

export const WebhookPayloadSchema = z.union([
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema
]);

/**
 * WhatsApp Cloud Webhook Schemas (Meta)
 */
export const MetaWebhookChangeSchema = z.object({
  field: z.string(),
  value: z.object({
    messaging_product: z.literal('whatsapp').optional(),
    metadata: z.object({
      display_phone_number: z.string().optional(),
      phone_number_id: z.string().optional(),
    }).optional(),
    contacts: z.array(z.any()).optional(),
    messages: z.array(z.any()).optional(),
    statuses: z.array(z.any()).optional(),
  }),
});

export const MetaWebhookEntrySchema = z.object({
  id: z.string(),
  changes: z.array(MetaWebhookChangeSchema),
});

export const MetaWebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(MetaWebhookEntrySchema),
});
