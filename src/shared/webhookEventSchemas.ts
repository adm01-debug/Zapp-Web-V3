import { z } from 'zod';

// ─────────────────────────────────────────────
// Contract error types
// ─────────────────────────────────────────────

export enum ContractErrorCode {
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_EVENT_SHAPE = 'INVALID_EVENT_SHAPE',
}

// ─────────────────────────────────────────────
// safeParseEvent — structured error with code + details
// ─────────────────────────────────────────────

type ParseErrorDetail = { path: string; message: string };
type ParseOk<T> = { ok: true; data: T; error?: never };
type ParseFail = { ok: false; data?: never; error: { code: ContractErrorCode; details: ParseErrorDetail[] } };
type ParseResult<T> = ParseOk<T> | ParseFail;

export function safeParseEvent<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  code: ContractErrorCode = ContractErrorCode.INVALID_PAYLOAD,
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

export const realtimeEnvelopeSchema = z.object({
  schema: z.string().optional(),
  table: z.string(),
  eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  new: z.record(z.unknown()).nullable().optional(),
  old: z.record(z.unknown()).nullable().optional(),
});

export function realtimeEnvelopeFor<T extends z.ZodTypeAny>(rowSchema: T) {
  return z.object({
    schema: z.string().optional(),
    table: z.string(),
    eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    new: rowSchema.nullable().optional(),
    old: z.record(z.unknown()).nullable().optional(),
  });
}

// ─────────────────────────────────────────────
// Generic row schemas
// ─────────────────────────────────────────────

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
                    }),
                  )
                  .optional(),
              })
              .passthrough(),
          }),
        ),
      }),
    )
    .min(1),
});

// ─────────────────────────────────────────────
// Gmail push
// ─────────────────────────────────────────────

export const gmailPushSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]),
});

// ─────────────────────────────────────────────
// Notification row
// ─────────────────────────────────────────────

export const notificationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  is_read: z.boolean().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Conversation event row
// ─────────────────────────────────────────────

export const conversationEventRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(), // non-nullable per DB constraint
  event_type: z.string().min(1), // any non-empty string (tolerates future event types)
  from_agent_id: z.string().nullable(),
  to_agent_id: z.string().nullable(),
  from_queue_id: z.string().nullable(),
  to_queue_id: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  performed_by: z.string().nullable(),
  created_at: z.string(),
});

export type ConversationEventRow = z.infer<typeof conversationEventRowSchema>;

// ─────────────────────────────────────────────
// Conversation transfer row
// ─────────────────────────────────────────────

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
  metadata: z.record(z.unknown()).nullable(),
  created_at: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Team message row (zapp.team_messages)
// ─────────────────────────────────────────────

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

export const warRoomAlertRowSchema = z.object({
  id: z.string(),
  alert_type: z.enum(['info', 'warning', 'critical', 'sla_breach']),
  title: z.string(),
  message: z.string(),
  source: z.string().nullable(),
  is_read: z.boolean().nullable(),
  created_at: z.string().nullable(),
});

export type WarRoomAlertRow = z.infer<typeof warRoomAlertRowSchema>;

// ─────────────────────────────────────────────
// Conversation SLA row
// ─────────────────────────────────────────────

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

export const evolutionMessageRowSchema = z.object({
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
}).passthrough();

export type EvolutionMessageRow = z.infer<typeof evolutionMessageRowSchema>;

// ─────────────────────────────────────────────
// Sentiment alert audit row (public.audit_logs)
// ─────────────────────────────────────────────

export const sentimentAlertAuditRowSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('sentiment_alert'),
  entity_id: z.string().nullable(),
  entity_type: z.string().nullable(),
  user_id: z.string().nullable(),
  details: z.record(z.unknown()).nullable(),
  created_at: z.string(),
});

// ─────────────────────────────────────────────
// Team message notification row (for push notifications)
// ─────────────────────────────────────────────

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
