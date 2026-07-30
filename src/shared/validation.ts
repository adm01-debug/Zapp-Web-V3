/**
 * Schemas de validação Zod para inputs críticos do ZAPP Web.
 *
 * Centraliza validação para:
 * - Mensagens (envio, edição, deleção)
 * - Contatos (criação, edição, merge)
 * - Campanhas (disparo, audience)
 * - Webhooks (payloads Evolution)
 * - Settings (retry config, theme, etc.)
 */
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Mensagens
// ─────────────────────────────────────────────────────────────────────────────

export const messageContentSchema = z
  .string()
  .min(1, 'Mensagem não pode ser vazia')
  .max(4096, 'Mensagem excede limite de 4096 caracteres')
  .refine((val) => val.trim().length > 0, 'Mensagem não pode ser só espaços');

export const sendMessageSchema = z.object({
  contactId: z.string().uuid('ID de contato inválido'),
  content: messageContentSchema,
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document', 'sticker']).default('text'),
  mediaUrl: z.string().url().optional().nullable(),
  mediaPayload: z.string().optional().nullable(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Contatos
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const brazilianPhoneRegex = /^(\+?55)?[1-9]{2}9?[0-9]{8}$/;

export const contactPhoneSchema = z
  .string()
  .min(10, 'Telefone muito curto')
  .max(20, 'Telefone muito longo')
  .refine((val) => {
    const cleaned = val.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 13;
  }, 'Telefone inválido');

export const contactEmailSchema = z
  .string()
  .email('E-mail inválido')
  .max(255, 'E-mail muito longo')
  .optional()
  .nullable();

export const createContactSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200, 'Nome muito longo'),
  phone: contactPhoneSchema,
  email: contactEmailSchema,
  company: z.string().max(200).optional().nullable(),
  jobTitle: z.string().max(100).optional().nullable(),
  tags: z.array(z.string().uuid()).max(50, 'Máximo 50 tags').optional().default([]),
  notes: z.string().max(2000).optional().nullable(),
});

export const updateContactSchema = createContactSchema.partial().extend({
  version: z.number().int().min(0).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Campanhas
// ─────────────────────────────────────────────────────────────────────────────

export const campaignTargetSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1, 'Pelo menos um contato').max(10000, 'Máximo 10k contatos'),
  scheduledAt: z.string().datetime().optional().nullable(),
  templateId: z.string().uuid('Template inválido'),
});

// ─────────────────────────────────────────────────────────────────────────────
// Webhooks Evolution
// ─────────────────────────────────────────────────────────────────────────────

const jidRegex = /^[^@\s]+@[^@\s]+$/;

export const evolutionMessageKeySchema = z.object({
  id: z.string().min(1),
  remoteJid: z.string().regex(jidRegex).optional(),
  fromMe: z.boolean().optional().default(false),
  participant: z.string().regex(jidRegex).optional(),
});

export const evolutionUpsertPayloadSchema = z.object({
  event: z.literal('messages.upsert'),
  instance: z.string().min(1),
  data: z.object({
    key: evolutionMessageKeySchema,
    message: z.unknown().optional(),
    messageType: z.string().optional(),
    messageTimestamp: z.union([z.number(), z.string()]).optional(),
    pushName: z.string().optional(),
  }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Settings (Retry Config)
// ─────────────────────────────────────────────────────────────────────────────

export const retryConfigSchema = z
  .object({
    maxRetries: z.number().int().min(1).max(10),
    baseBackoffMs: z.number().int().min(100).max(10_000),
    maxBackoffMs: z.number().int().min(1000).max(60_000),
    timeoutMs: z.number().int().min(5_000).max(120_000),
  })
  .refine((c) => c.maxBackoffMs >= c.baseBackoffMs, {
    message: 'maxBackoffMs deve ser >= baseBackoffMs',
    path: ['maxBackoffMs'],
  })
  .refine((c) => c.timeoutMs >= c.baseBackoffMs, {
    message: 'timeoutMs deve ser >= baseBackoffMs',
    path: ['timeoutMs'],
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type CampaignTargetInput = z.infer<typeof campaignTargetSchema>;
export type RetryConfigInput = z.infer<typeof retryConfigSchema>;

/**
 * Valida um input e retorna o resultado tipado ou lança erro com mensagem clara.
 */
export function validateInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validação falhou: ${issues}`);
  }
  return result.data;
}

/**
 * Valida um input e retorna { ok, data, error } sem throw.
 */
export function safeValidateInput<T>(
  schema: z.ZodType<T>,
  input: unknown
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    const error = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { ok: false, error };
  }
  return { ok: true, data: result.data };
}
