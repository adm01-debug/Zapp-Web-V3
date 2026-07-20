import { z } from 'zod';

export function safeParse<T>(schema: z.ZodType<T>, data: unknown): T | null {
  try {
    return schema.parse(data);
  } catch {
    return null;
  }
}

export function safeParseList<T>(schema: z.ZodType<T>, data: unknown): T[] {
  if (!Array.isArray(data)) return [];
  return data.map((item) => safeParse(schema, item)).filter((item): item is T => item !== null);
}

export const contactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable().catch('').transform((n) => n ?? ''),
  phone: z.string().nullable().catch('').transform((p) => p ?? ''),
  status: z.string().nullable().catch('open').transform((s) => s ?? 'open'),
  contact_type: z.string(),
  is_read: z.boolean().nullable().catch(false).transform((v) => v ?? false),
  is_archived: z.boolean().nullable().catch(false).transform((v) => v ?? false),
  created_at: z.string(),
  updated_at: z.string(),
  email: z.string().nullable().optional().transform((v) => v ?? undefined),
  avatar_url: z.string().nullable().optional().transform((v) => v ?? undefined),
  remote_jid: z.string().nullable().optional().transform((v) => v ?? undefined),
  queue_id: z.string().uuid().nullable().optional().transform((v) => v ?? undefined),
  assigned_to: z.string().uuid().nullable().optional().transform((v) => v ?? undefined),
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  content: z.string().nullable().catch('').transform((c) => c ?? ''),
  sender: z.enum(['agent', 'contact', 'system', 'bot']).catch('contact'),
  message_type: z.string(),
  is_read: z.boolean().nullable().catch(false).transform((v) => v ?? false),
  status: z.string(),
  created_at: z.string(),
  media_url: z.string().nullable().optional().transform((v) => v ?? undefined),
  agent_id: z.string().uuid().nullable().optional().transform((v) => v ?? undefined),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable().catch('').transform((p) => p ?? ''),
  status: z.string(),
  unread_count: z.number().nullable().catch(0).transform((v) => v ?? 0),
  last_message: z.string().nullable().optional().transform((v) => v ?? undefined),
  contact_id: z.string().uuid().nullable().optional().transform((v) => v ?? undefined),
});
