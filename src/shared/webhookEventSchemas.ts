import { z } from 'zod';

export const conversationSlaRowSchema = z.object({
  id: z.string(),
  contact_id: z.string(),
  first_response_breached: z.boolean(),
  resolution_breached: z.boolean(),
  first_message_at: z.string(),
  first_response_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
});

type ParseOk<T> = { ok: true; data: T; error?: never };
type ParseFail = { ok: false; data?: never; error: unknown };
type ParseResult<T> = ParseOk<T> | ParseFail;

export function safeParseEvent<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return { ok: false, error: result.error };
}
