import { z } from 'zod';

// ─────────────────────────────────────────────
// Contract error types
// ─────────────────────────────────────────────

/** Typed error codes used by safeParseEvent to distinguish payload vs envelope validation failures. */
export enum ContractErrorCode {
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_EVENT_SHAPE = 'INVALID_EVENT_SHAPE',
}

// ─────────────────────────────────────────────
// safeParseEvent — structured error with code + details
// ─────────────────────────────────────────────

type ParseErrorDetail = { path: string; message: string };
type ParseOk<T> = { ok: true; data: T; error?: never };
type ParseFail = {
  ok: false;
  data?: never;
  error: { code: ContractErrorCode; details: ParseErrorDetail[] };
};
type ParseResult<T> = ParseOk<T> | ParseFail;

/** Validates `raw` against `schema` and returns a discriminated union: `{ok: true, data}` or `{ok: false, error}` with typed details. */
export function safeParseEvent<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  code: ContractErrorCode = ContractErrorCode.INVALID_PAYLOAD
): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: {
      code,
      details: result.error.issues.map((e) => ({
        path: e.path.map(String).join('.'),
        message: e.message,
      })),
    },
  };
}

// ─────────────────────────────────────────────
// Realtime envelope
// ─────────────────────────────────────────────

/** Zod schema for the generic Supabase Realtime change envelope (INSERT/UPDATE/DELETE) without a typed row payload. */
export const realtimeEnvelopeSchema = z.object({
  schema: z.string().optional(),
  table: z.string(),
  eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  new: z.record(z.string(), z.unknown()).nullable().optional(),
  old: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** Returns a typed Realtime envelope schema where the `new` field is validated against the provided `rowSchema`. */
export function realtimeEnvelopeFor<T extends z.ZodTypeAny>(rowSchema: T) {
  return z.object({
    schema: z.string().optional(),
    table: z.string(),
    eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    new: rowSchema.nullable().optional(),
    old: z.record(z.string(), z.unknown()).nullable().optional(),
  });
}

// ─────────────────────────────────────────────
// Generic row schemas
// ─────────────────────────────────────────────

/** Zod schema for a public.messages row received via Supabase Realtime; uses passthrough to tolerate new columns. */
export const messageRowSchema = z
  .object({
    id: z.string().uuid(),
    contact_id: z.string().nullable(),
    content: z.string().nullable(),
    sender: z.string().nullable(),
    status: z.string().nullable(),
    channel_type: z.string().nullable(),
    external_id: z.string().nullable(),
    media_url: z.string().nullable(),
    media_type: z.string().nullable(),
    created_at: z.string().nullable(),
    agent_id: z.string().nullable(),
  })
  .passthrough();

/** Zod schema for a public.contacts row received via Supabase Realtime; uses passthrough to tolerate new columns. */
export const contactRowSchema = z
  .object({
    id: z.string().uuid(),
    remote_jid: z.string().nullable(),
    phone: z.string().nullable(),
    push_name: z.string().nullable(),
    assigned_to: z.string().nullable(),
    queue_id: z.string().nullable(),
    contact_type: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .passthrough();

/** Zod schema for a public.failed_messages row used to surface delivery-failure events via Realtime. */
export const failedMessageRowSchema = z.object({
  id: z.string().uuid(),
  instance_name: z.string().nullable(),
  message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  retry_count: z.number().int().nullable(),
  status: z.string().nullable(),
  created_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Evolution webhook (messages.upsert)
// ─────────────────────────────────────────────

const jidRegex = /^[^@\s]+@[^@\s]+$/;

/** Zod schema for the Evolution API `messages.upsert` webhook payload; validates event name, instance, and message key. */
export const evolutionMessageUpsertSchema = z.object({
  event: z.literal('messages.upsert'),
  instance: z.string(),
  data: z.object({
    key: z.object({
      id: z.string().min(1),
      remoteJid: z.string().regex(jidRegex),
      fromMe: z.boolean().optional().default(false),
    }),
    pushName: z.string().nullable().optional(),
    message: z.unknown().nullable().optional(),
    messageType: z.string().nullable().optional(),
    messageTimestamp: z.union([z.number(), z.string()]).nullable().optional(),
  }),
});

// ─────────────────────────────────────────────
// WhatsApp Cloud webhook
// ─────────────────────────────────────────────

/** Zod schema for the WhatsApp Cloud API webhook envelope; validates the entry/changes structure and message status enum. */
export const whatsappCloudWebhookSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z.array(
          z.object({
            field: z.string(),
            value: z
              .object({
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.enum(['sent', 'delivered', 'read', 'failed']),
                      timestamp: z.string(),
                    })
                  )
                  .optional(),
              })
              .passthrough(),
          })
        ),
      })
    )
    .min(1),
});

// ─────────────────────────────────────────────
// Gmail push
// ─────────────────────────────────────────────

/** Zod schema for the Gmail push notification payload sent by Google Pub/Sub on new email activity. */
export const gmailPushSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]),
});

// ─────────────────────────────────────────────
// Notification row
// ─────────────────────────────────────────────

/** Zod schema for a zapp.notifications row used for in-app notification delivery via Realtime subscriptions. */
export const notificationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  is_read: z.boolean().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Conversation event row
// ─────────────────────────────────────────────

/** Zod schema for a zapp.conversation_events row capturing agent assignment, queue transfer, and status change events. */
export const conversationEventRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(), // non-nullable per DB constraint
  event_type: z.string().min(1), // any non-empty string (tolerates future event types)
  from_agent_id: z.string().uuid().nullable(),
  to_agent_id: z.string().nullable(),
  from_queue_id: z.string().nullable(),
  to_queue_id: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  performed_by: z.string().nullable(),
  created_at: z.string(),
});

/** TypeScript type inferred from conversationEventRowSchema for use in subscription handlers and reducers. */
export type ConversationEventRow = z.infer<typeof conversationEventRowSchema>;

// ─────────────────────────────────────────────
// Conversation transfer row
// ─────────────────────────────────────────────

/** Zod schema for a zapp.conversation_transfers row tracking agent/queue handoff lifecycle (pending→active→closed). */
export const conversationTransferRowSchema = z.object({
  id: z.string().uuid(),
  source_conversation_id: z.string().uuid(), // non-nullable per DB constraint
  from_agent_id: z.string().nullable(),
  to_agent_id: z.string().nullable(),
  from_queue_id: z.string().nullable(),
  to_queue_id: z.string().nullable(),
  status: z.enum(['pending', 'active', 'closed', 'cancelled', 'rejected']),
  transfer_type: z.enum(['queue', 'agent', 'bot', 'external']),
  priority: z.number().int().nullable(),
  ticket_number: z.string(),
  contact_id: z.string().nullable(),
  remote_jid: z.string().nullable(),
  contact_name: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Team message row (zapp.team_messages)
// ─────────────────────────────────────────────

/** Zod schema for a zapp.team_messages row used by the internal team-chat Realtime channel. */
export const teamMessageRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string(),
  message_type: z.string(),
  reply_to_id: z.string().nullable(),
  is_edited: z.boolean().nullable(),
  media_url: z.string().nullable(),
  media_type: z.string().nullable(),
  status: z.enum(['sent', 'delivered', 'read', 'failed', 'deleted']),
  created_at: z.string(),
  updated_at: z.string(),
});

// ─────────────────────────────────────────────
// WarRoom alert row
// ─────────────────────────────────────────────

/** Zod schema for a WarRoom alert row surfaced in the real-time operations dashboard. */
export const warRoomAlertRowSchema = z.object({
  id: z.string(),
  alert_type: z.enum(['info', 'warning', 'critical', 'sla_breach']),
  title: z.string(),
  message: z.string(),
  source: z.string().nullable(),
  is_read: z.boolean().nullable(),
  created_at: z.string().nullable(),
});

/** TypeScript type inferred from warRoomAlertRowSchema for use in WarRoom alert subscription handlers. */
export type WarRoomAlertRow = z.infer<typeof warRoomAlertRowSchema>;

// ─────────────────────────────────────────────
// Conversation SLA row
// ─────────────────────────────────────────────

/** Zod schema for a zapp.conversation_sla row tracking first-response and resolution SLA breach flags. */
export const conversationSlaRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().nullable(),
  first_response_breached: z.boolean().nullable(),
  resolution_breached: z.boolean().nullable(),
  first_message_at: z.string(),
  first_response_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Evolution message row (evo.evolution_messages)
// ─────────────────────────────────────────────

/** Zod schema for a row in evo.evolution_messages; passthrough tolerates extra columns added in future migrations. */
export const evolutionMessageRowSchema = z
  .object({
    id: z.string(),
    message_id: z.string().nullable().optional(),
    remote_jid: z.string().nullable().optional(),
    instance_name: z.string().nullable().optional(),
    from_me: z.boolean(), // required — always present in full row UPDATE payloads
    message_type: z.string().nullable().optional(),
    content: z.string().nullable(),
    media_url: z.string().nullable(),
    status: z.string().nullable(),
    created_at: z.string().nullable(),
    deleted_at: z.string().nullable().optional(),
    contact_id: z.string().nullable(),
    conversation_id: z.string().nullable().optional(),
    transcription_status: z.string().nullable().optional(),
    transcription: z.string().nullable().optional(),
    instance_id: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

/** TypeScript type inferred from evolutionMessageRowSchema for typed Realtime handlers on evo.evolution_messages. */
export type EvolutionMessageRow = z.infer<typeof evolutionMessageRowSchema>;

// ─────────────────────────────────────────────
// Sentiment alert audit row (zapp.audit_logs)
// ─────────────────────────────────────────────

/** Zod schema for a zapp.audit_logs row with action='sentiment_alert'; used by the sentiment monitoring pipeline. */
export const sentimentAlertAuditRowSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('sentiment_alert'),
  entity_id: z.string().nullable(),
  entity_type: z.string().nullable(),
  user_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

// ─────────────────────────────────────────────
// Team message notification row (for push notifications)
// ─────────────────────────────────────────────

/** Zod schema for a minimal team-message notification row used to fire push notifications to mentioned agents. */
export const teamMessageNotificationRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string(),
  media_type: z
    .enum(['image', 'audio', 'audio_meme', 'video', 'document', 'sticker'])
    .nullable()
    .optional(),
  created_at: z.string(),
});
