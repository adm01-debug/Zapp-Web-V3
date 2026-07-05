import { z } from "https://esm.sh/zod@3.23.8";

export { z };

/**
 * Standard Error Format for Contract Validation (422 Unprocessable Entity)
 */
export interface ContractError {
  error: true;
  code: string;
  message: string;
  requestId?: string;
  details?: Array<{
    path: string;
    message: string;
  }>;
}

/** Schema para análise de conversa (ai-conversation-summary) */
export const AiConversationSummarySchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system', 'agent', 'client']),
    content: z.string().max(10000),
    sender: z.string().max(200).optional(),
    timestamp: z.string().max(50).optional(),
  })).min(1, "Lista de mensagens vazia").max(200),
});

/** Schema para sugestão de resposta (ai-suggest-reply) */
export const AiSuggestReplySchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  contactName: z.string().max(200).optional().nullable(),
  conversationHistory: z.array(z.object({
    role: z.string().max(20),
    content: z.string().max(10000),
  })).max(50),
  context: z.string().max(2000).optional(),
});

/** Schema para detecção de novo dispositivo (detect-new-device) */
export const DetectNewDeviceSchema = z.object({
  device_fingerprint: z.string().min(8).max(128),
  browser: z.string().min(1).max(100),
  os: z.string().min(1).max(100),
  device_name: z.string().min(1).max(200),
});

/** Validates that image_url is a safe HTTPS URL (not private IPs or metadata endpoints) */
function isSafeHttpsUrl(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' ||
    /^127\./.test(host) || /^169\.254\./.test(host) ||
    /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    // IPv6 loopback, link-local, unique-local (ULA), and IPv4-mapped
    host === '[::1]' || host.startsWith('[fe80:') ||
    host.startsWith('[fc00:') || host.startsWith('[fd') ||
    host.startsWith('[::ffff:')
  ) return false;
  return true;
}

const safeImageUrlSchema = z.string().url().refine(isSafeHttpsUrl, {
  message: 'image_url must be a public HTTPS URL',
});

/** Schema para classificação de emoji customizado (classify-emoji) */
export const ClassifyEmojiSchema = z.object({
  image_url: safeImageUrlSchema.optional().nullable(),
  file_name: z.string().max(255).optional().nullable(),
});

/** Schema para classificação de sticker (classify-sticker) */
export const ClassifyStickerSchema = z.object({
  image_url: safeImageUrlSchema.optional().nullable(),
});

/** Helper para parse seguro */
export function parseBody<T>(schema: z.ZodSchema<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '),
      issues: result.error.issues,
    };
  }
  return { success: true, data: result.data };
}
