import { z } from 'zod';

// ─── Contract error codes ─────────────────────────────────────────────────────

export enum ContractErrorCode {
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_EVENT_SHAPE = 'INVALID_EVENT_SHAPE',
}

// ─── Realtime envelope ────────────────────────────────────────────────────────

export const realtimeEnvelopeSchema = z.object({
  schema: z.string().optional(),
  table: z.string(),
  eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  new: z.record(z.unknown()).nullable().optional(),
  old: z.record(z.unknown()).nullable().optional(),
});

export function realtimeEnvelopeFor<T>(rowSchema: z.ZodType<T>) {
  return z.object({
    schema: z.string().optional(),
    table: z.string(),
    eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
    new: rowSchema.nullable().optional(),
    old: z.record(z.unknown()).nullable().optional(),
  });
}

// ─── safeParseEvent ───────────────────────────────────────────────────────────

type ParseError = { code: ContractErrorCode; details: { path: string; message: string }[] };
type ParseOk<T> = { ok: true; data: T; error?: never };
type ParseFail = { ok: false; data?: never; error: ParseError };
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
        path: e.path.join('.'),
        message: e.message,
      })),
    },
  };
}

// ─── Core message/contact row schemas ────────────────────────────────────────

export const messageRowSchema = z
  .object({
    id: z.string().uuid(),
    contact_id: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    sender: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    channel_type: z.string().nullable().optional(),
    external_id: z.string().nullable().optional(),
    media_url: z.string().nullable().optional(),
    media_type: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
    agent_id: z.string().nullable().optional(),
  })
  .passthrough();

export const contactRowSchema = z.object({
  id: z.string().uuid(),
  remote_jid: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  push_name: z.string().nullable().optional(),
  assigned_to: z.string().nullable().optional(),
  queue_id: z.string().nullable().optional(),
  contact_type: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional(),
});

export const failedMessageRowSchema = z.object({
  id: z.string().uuid(),
  instance_name: z.string().nullable().optional(),
  message_id: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
  retry_count: z.number().nullable().optional(),
  status: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const notificationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  is_read: z.boolean().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
  read_at: z.string().nullable().optional(),
});

// ─── Conversation row schemas ─────────────────────────────────────────────────

export const conversationEventRowSchema = z.object({
  id: z.string(),
  event_type: z.string().min(1),
  contact_id: z.string().optional(),
  from_agent_id: z.string().uuid().nullable().optional(),
  to_agent_id: z.string().uuid().nullable().optional(),
  from_queue_id: z.string().uuid().nullable().optional(),
  to_queue_id: z.string().uuid().nullable().optional(),
  performed_by: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  created_at: z.string(),
  status: z.string().optional(),
  error_message: z.string().optional(),
});

export const conversationTransferRowSchema = z.object({
  id: z.string().uuid(),
  source_conversation_id: z.string().uuid(),
  from_agent_id: z.string().nullable().optional(),
  to_agent_id: z.string().nullable().optional(),
  from_queue_id: z.string().nullable().optional(),
  to_queue_id: z.string().nullable().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled', 'accepted', 'rejected']),
  transfer_type: z.enum(['agent', 'queue', 'department', 'direct']),
  priority: z.number().int().nullable().optional(),
  ticket_number: z.string(),
  contact_id: z.string().nullable().optional(),
  remote_jid: z.string().nullable().optional(),
  contact_name: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const conversationSlaRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().nullable(),
  first_response_breached: z.boolean().nullable(),
  resolution_breached: z.boolean().nullable(),
  first_message_at: z.string(),
  first_response_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
});

export const teamMessageRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string(),
  message_type: z.string(),
  reply_to_id: z.string().nullable().optional(),
  is_edited: z.boolean().nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  created_at: z.string(),
  updated_at: z.string().nullable().optional(),
});

// ─── WarRoom / SLA / Evolution rows ──────────────────────────────────────────

export const warRoomAlertRowSchema = z.object({
  id: z.string(),
  alert_type: z.enum(['info', 'warning', 'critical', 'sla_breach']),
  title: z.string(),
  message: z.string(),
  source: z.string().nullable().optional(),
  is_read: z.boolean().nullable().optional(),
  created_at: z.string().nullable().optional(),
});

export const evolutionMessageRowSchema = z.object({
  id: z.string(),
  message_id: z.string().nullable().optional(),
  remote_jid: z.string(),
  from_me: z.boolean(),
  message_type: z.string(),
  content: z.string().nullable().optional(),
  media_url: z.string().nullable().optional(),
  media_mimetype: z.string().nullable().optional(),
  media_type: z.string().nullable().optional(),
  media_filename: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  quoted_message_id: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  push_name: z.string().nullable().optional(),
  contact_id: z.string().nullable().optional(),
  conversation_id: z.string().nullable().optional(),
  created_at: z.string(),
  deleted_at: z.string().nullable().optional(),
  edited_at: z.string().nullable().optional(),
  instance_name: z.string(),
  transcription_status: z.string().nullable().optional(),
  transcription: z.string().nullable().optional(),
});

export const sentimentAlertAuditRowSchema = z.object({
  id: z.string(),
  action: z.literal('sentiment_alert'),
  entity_id: z.string().nullable().optional(),
  entity_type: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  details: z
    .object({
      type: z.string().optional(),
      contact_id: z.string().optional(),
      contact_name: z.string().optional(),
      contact_phone: z.string().nullable().optional(),
      sentiment_score: z.number().optional(),
      consecutive_low: z.number().optional(),
      agent_name: z.string().optional(),
      message: z.string().optional(),
    })
    .nullable()
    .optional(),
  created_at: z.string(),
});

export const teamMessageNotificationRowSchema = z.object({
  id: z.string(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string(),
  media_type: z.string().nullable().optional(),
  created_at: z.string(),
});

// ─── Webhook payload schemas ──────────────────────────────────────────────────

const jidRegex = /^[^@]+@(s\.whatsapp\.net|g\.us|newsletter|lid)$/;

export const evolutionMessageUpsertSchema = z.object({
  event: z.literal('messages.upsert'),
  instance: z.string(),
  data: z.object({
    key: z.object({
      id: z.string().min(1),
      remoteJid: z.string().regex(jidRegex),
      fromMe: z.boolean().default(false),
    }),
    pushName: z.string().nullable().optional(),
    message: z.unknown().nullable().optional(),
    messageType: z.string().nullable().optional(),
    messageTimestamp: z.number().nullable().optional(),
  }),
});

export const whatsappCloudWebhookSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z
          .array(
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
                .optional(),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
});

export const gmailPushSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]),
});
