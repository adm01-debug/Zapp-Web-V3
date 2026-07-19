/**
 * Zod schemas para linhas do Supabase.
 *
 * Objetivo: validar/normalizar payloads vindos do banco (que podem ter campos
 * `null` por padrão) antes de setar no state React, evitando erros de tipagem
 * e comportamentos inesperados na UI.
 *
 * Regra geral: `null` -> `undefined` ou valor default seguro por domínio.
 */
import { z } from 'zod';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Converte `null` em `undefined`, mantendo o tipo original quando válido. */
const nullish = <T extends z.ZodTypeAny>(schema: T) =>
  schema.nullish().transform((v) => (v === null ? undefined : v));

/** String com fallback para "" quando o valor for null/undefined. */
const strDefault = (fallback = '') =>
  z
    .string()
    .nullish()
    .transform((v) => v ?? fallback);

/** Boolean com fallback (default `false`). */
const boolDefault = (fallback = false) =>
  z
    .boolean()
    .nullish()
    .transform((v) => v ?? fallback);

/* -------------------------------------------------------------------------- */
/* Contacts                                                                   */
/* -------------------------------------------------------------------------- */

export const contactSchema = z.object({
  id: z.string().uuid(),
  name: strDefault(''),
  phone: strDefault(''),
  email: nullish(z.string()),
  avatar_url: nullish(z.string()),
  remote_jid: nullish(z.string()),
  push_name: nullish(z.string()),
  instance: nullish(z.string()),
  queue_id: nullish(z.string().uuid()),
  assigned_to: nullish(z.string().uuid()),
  status: strDefault('open'),
  contact_type: strDefault('cliente'),
  is_read: boolDefault(false),
  is_archived: boolDefault(false),
  last_message: nullish(z.string()),
  last_message_at: nullish(z.string()),
  created_at: strDefault(''),
  updated_at: strDefault(''),
});
/** Contact type alias. */
export type Contact = z.infer<typeof contactSchema>;

/* -------------------------------------------------------------------------- */
/* Messages                                                                   */
/* -------------------------------------------------------------------------- */

export const messageSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  agent_id: nullish(z.string().uuid()),
  content: strDefault(''),
  sender: z.enum(['agent', 'contact', 'system', 'bot']).catch('contact'),
  message_type: strDefault('text'),
  media_url: nullish(z.string()),
  media_payload: nullish(z.string()),
  is_read: boolDefault(false),
  status: strDefault('sent'),
  channel_type: nullish(z.string()),
  reply_to_message_id: nullish(z.string()),
  external_message_id: nullish(z.string()),
  created_at: strDefault(''),
  updated_at: nullish(z.string()),
});
/** Message type alias. */
export type Message = z.infer<typeof messageSchema>;

/* -------------------------------------------------------------------------- */
/* Conversations (contacts que atuam como agregador de conversa)              */
/* -------------------------------------------------------------------------- */

export const conversationSchema = z.object({
  id: z.string().uuid(),
  contact_id: nullish(z.string().uuid()),
  name: strDefault(''),
  phone: strDefault(''),
  avatar_url: nullish(z.string()),
  last_message: nullish(z.string()),
  last_message_at: nullish(z.string()),
  unread_count: z.number().nullish().transform((v) => v ?? 0),
  status: strDefault('open'),
  queue_id: nullish(z.string().uuid()),
  assigned_to: nullish(z.string().uuid()),
});
/** Conversation type alias. */
export type Conversation = z.infer<typeof conversationSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers de parsing seguro                                                  */
/* -------------------------------------------------------------------------- */

/** Faz parse seguro; retorna `null` em erro e não lança. */
export function safeParse<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): z.infer<T> | null {
  const result = schema.safeParse(input);
  return result.success ? result.data : null;
}

/** Parseia uma lista, descartando entradas inválidas. */
export function safeParseList<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): z.infer<T>[] {
  if (!Array.isArray(input)) return [];
  const out: z.infer<T>[] = [];
  for (const row of input) {
    const parsed = schema.safeParse(row);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
