import { z } from 'zod';

// ─── Error codes ───────────────────────────────────────────────────────────────

export enum ContractErrorCode {
  INVALID_PAYLOAD = 'INVALID_PAYLOAD',
  INVALID_EVENT_SHAPE = 'INVALID_EVENT_SHAPE',
}

// ─── safeParseEvent ────────────────────────────────────────────────────────────

interface ParseError {
  code: ContractErrorCode;
  details: Array<{ path: string; message: string }>;
}
type ParseOk<T> = { ok: true; data: T };
type ParseFail = { ok: false; error: ParseError };
type ParseResult<T> = ParseOk<T> | ParseFail;

export function safeParseEvent<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  code: ContractErrorCode = ContractErrorCode.INVALID_PAYLOAD
): ParseResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
  return { ok: false, error: { code, details } };
}

// ─── Realtime envelope ─────────────────────────────────────────────────────────

export const realtimeEnvelopeSchema = z.object({
  schema: z.string(),
  table: z.string(),
  eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  new: z.record(z.string(), z.unknown()).nullable().optional(),
  old: z.record(z.string(), z.unknown()).nullable().optional(),
});

export function realtimeEnvelopeFor<T>(rowSchema: z.ZodType<T>) {
  return realtimeEnvelopeSchema.extend({
    new: rowSchema.nullable(),
  });
}

// ─── Row schemas ───────────────────────────────────────────────────────────────

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

export const contactRowSchema = z.object({
  id: z.string().uuid(),
  remote_jid: z.string().nullable(),
  phone: z.string().nullable(),
  push_name: z.string().nullable(),
  assigned_to: z.string().nullable(),
  queue_id: z.string().nullable(),
  contact_type: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const failedMessageRowSchema = z.object({
  id: z.string().uuid(),
  instance_name: z.string().nullable(),
  message_id: z.string().nullable(),
  error_message: z.string().nullable(),
  retry_count: z.number().int().nullable(),
  status: z.string().nullable(),
  created_at: z.string().nullable(),
});

export const notificationRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.string(),
  is_read: z.boolean().nullable(),
  metadata: z.unknown().nullable(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

export const conversationEventRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid(),
  event_type: z.string().min(1),
  from_agent_id: z.string().uuid().nullable(),
  to_agent_id: z.string().uuid().nullable(),
  from_queue_id: z.string().uuid().nullable(),
  to_queue_id: z.string().uuid().nullable(),
  metadata: z.unknown().nullable(),
  performed_by: z.string().uuid().nullable(),
  created_at: z.string(),
});

export const conversationSlaRowSchema = z.object({
  id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  first_message_at: z.string(),
  first_response_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  first_response_breached: z.boolean().nullable(),
  resolution_breached: z.boolean().nullable(),
});

export const conversationTransferRowSchema = z.object({
  id: z.string().uuid(),
  source_conversation_id: z.string().uuid(),
  from_agent_id: z.string().nullable(),
  to_agent_id: z.string().nullable(),
  from_queue_id: z.string().nullable(),
  to_queue_id: z.string().nullable(),
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']),
  transfer_type: z.enum(['queue', 'agent', 'auto']),
  priority: z.number().int().nullable(),
  ticket_number: z.string(),
  contact_id: z.string().nullable(),
  remote_jid: z.string().nullable(),
  contact_name: z.string().nullable(),
  metadata: z.unknown().nullable(),
  created_at: z.string().nullable(),
});

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
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  created_at: z.string(),
  updated_at: z.string(),
});

export const warRoomAlertRowSchema = z.object({
  id: z.string().uuid(),
  alert_type: z.enum(['info', 'warning', 'critical', 'sla_breach']),
  title: z.string(),
  message: z.string(),
  source: z.string().nullable(),
  is_read: z.boolean().nullable(),
  created_at: z.string().nullable(),
});

export const evolutionMessageRowSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  remote_jid: z.string(),
  instance_name: z.string(),
  from_me: z.boolean(),
  message_type: z.string(),
  content: z.string().nullable(),
  media_url: z.string().nullable(),
  status: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
  contact_id: z.string().nullable(),
  conversation_id: z.string().nullable(),
});

export const sentimentAlertAuditRowSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('sentiment_alert'),
  entity_id: z.string().nullable(),
  entity_type: z.string().nullable(),
  user_id: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});

export const teamMessageNotificationRowSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  content: z.string(),
  media_type: z.enum(['image', 'audio', 'video', 'document', 'sticker']).nullable().optional(),
  created_at: z.string(),
});

// ─── Evolution webhook ─────────────────────────────────────────────────────────

export const evolutionMessageUpsertSchema = z.object({
  event: z.literal('messages.upsert'),
  instance: z.string(),
  data: z.object({
    key: z.object({
      id: z.string().min(1),
      remoteJid: z.string().regex(/^[^@]+@[^@]+$/, 'invalid JID'),
      fromMe: z.boolean().default(false),
    }),
    pushName: z.string().nullable().optional(),
    message: z.unknown().nullable().optional(),
    messageType: z.string().nullable().optional(),
    messageTimestamp: z.number().nullable().optional(),
  }),
});

// ─── WhatsApp Cloud webhook ────────────────────────────────────────────────────

const waStatusSchema = z
  .object({
    id: z.string(),
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    timestamp: z.string(),
  })
  .passthrough();

const waChangeValueSchema = z
  .object({
    statuses: z.array(waStatusSchema).optional(),
  })
  .passthrough();

const waChangeSchema = z.object({
  field: z.string(),
  value: waChangeValueSchema,
});

const waEntrySchema = z.object({
  id: z.string(),
  changes: z.array(waChangeSchema),
});

export const whatsappCloudWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(waEntrySchema).min(1),
});

// ─── Gmail push ────────────────────────────────────────────────────────────────

export const gmailPushSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.number(), z.string()]),
});
