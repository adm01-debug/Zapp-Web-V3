import { z } from 'zod';

// Row shape for the `conversation_events` table used by TicketHistorySheet.
export const conversationEventRowSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  contact_id: z.string().optional(),
  from_agent_id: z.string().nullable().optional(),
  to_agent_id: z.string().nullable().optional(),
  from_queue_id: z.string().nullable().optional(),
  to_queue_id: z.string().nullable().optional(),
  performed_by: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
  status: z.string().optional(),
  error_message: z.string().optional(),
});

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
