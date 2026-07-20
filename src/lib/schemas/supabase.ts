import { z } from 'zod';

export function safeParse<T>(schema: z.ZodType<T>, input: unknown): T | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}

export function safeParseList<T>(schema: z.ZodType<T>, input: unknown): T[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => safeParse(schema, item)).filter((v): v is T => v !== null);
}

export const contactSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  phone: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  status: z
    .string()
    .nullable()
    .transform((v) => v ?? 'open'),
  contact_type: z.string(),
  is_read: z
    .boolean()
    .nullable()
    .transform((v) => v ?? false),
  is_archived: z
    .boolean()
    .nullable()
    .transform((v) => v ?? false),
  created_at: z.string(),
  updated_at: z.string(),
  email: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  avatar_url: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  remote_jid: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  queue_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  assigned_to: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

export const messageSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  content: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  sender: z.enum(['agent', 'contact', 'system', 'bot']).catch('contact'),
  message_type: z.string(),
  is_read: z
    .boolean()
    .nullable()
    .transform((v) => v ?? false),
  status: z.string(),
  created_at: z.string(),
  media_url: z
    .string()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
  agent_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});

export const conversationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z
    .string()
    .nullable()
    .transform((v) => v ?? ''),
  status: z.string(),
  unread_count: z
    .number()
    .nullable()
    .transform((v) => v ?? 0),
  last_message: z
    .unknown()
    .optional()
    .transform((v) => (v === null || v === undefined ? undefined : v)),
  contact_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .transform((v) => v ?? undefined),
});
