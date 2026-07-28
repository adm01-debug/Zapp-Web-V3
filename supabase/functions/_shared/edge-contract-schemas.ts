import { z } from 'https://esm.sh/zod@3.23.8';
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
} from './evolution-schemas.ts';

// ─── Webhook inbound (Evolution → Edge Function) ───────────────────────────
export const WebhookPayloadSchema = z.union([
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
]);

export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ─── Send-message contract ──────────────────────────────────────────────────
export const SendMessageSchema = z.object({
  instanceName: z.string().min(1),
  to:           z.string().min(1),
  text:         z.string().optional(),
  mediaUrl:     z.string().url().optional(),
  mediaType:    z.enum(['image', 'video', 'audio', 'document']).optional(),
  caption:      z.string().optional(),
  filename:     z.string().optional(),
}).refine(d => d.text || d.mediaUrl, {
  message: 'Either text or mediaUrl is required',
});

export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ─── Rate-limit check request ───────────────────────────────────────────────
export const RateLimitCheckSchema = z.object({
  identifier:     z.string().min(1),
  rpcName:        z.string().min(1),
  maxCalls:       z.number().int().positive().default(60),
  windowMinutes:  z.number().int().positive().default(1),
});

export type RateLimitCheckInput = z.infer<typeof RateLimitCheckSchema>;
