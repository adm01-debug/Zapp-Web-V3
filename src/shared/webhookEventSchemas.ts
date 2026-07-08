/**
 * Schemas Zod para validação client-side de:
 *   1. Payloads de Supabase Realtime (postgres_changes) antes de atualizar cache/estado.
 *   2. Payloads de webhooks entrantes consumidos por Edge Functions e refletidos
 *      no cliente via Realtime (evolution, whatsapp cloud, gmail).
 *
 * Escopo intencionalmente estreito: campos usados pela UI. Campos extras são
 * preservados via `.passthrough()`. Todos os schemas toleram `null` explícito
 * onde o Postgres devolve `T | null`, evitando o drift `T | null` × `T`.
 */
import { z } from 'zod';

// ---------- helpers ----------

/** UUID v4 tolerante (aceita v1..v5). */
export const uuidSchema = z.string().uuid();

/** Timestamp ISO-8601 ou epoch em string; tolera null. */
export const timestampSchema = z
  .union([z.string().min(1), z.number().int().positive()])
  .nullable();

/** JID WhatsApp (`5511999999999@s.whatsapp.net`, `...@g.us`). */
export const remoteJidSchema = z
  .string()
  .min(6)
  .max(200)
  .regex(/^[\d\-+]+@(s\.whatsapp\.net|g\.us|lid|broadcast)$/i, {
    message: 'remoteJid inválido',
  });

// ---------- Supabase Realtime envelope ----------

export const realtimeEventTypeSchema = z.enum([
  'INSERT',
  'UPDATE',
  'DELETE',
  '*',
]);

/**
 * Envelope genérico de `postgres_changes`. `new`/`old` são payloads da linha —
 * mantidos como record aberto porque cada tabela tem forma própria; use
 * `realtimeEnvelopeFor(TableSchema)` para amarrar a uma linha específica.
 */
export const realtimeEnvelopeSchema = z.object({
  schema: z.string().min(1),
  table: z.string().min(1),
  eventType: realtimeEventTypeSchema,
  commit_timestamp: z.string().optional(),
  new: z.record(z.string(), z.unknown()).nullable().optional(),
  old: z.record(z.string(), z.unknown()).nullable().optional(),
  errors: z.array(z.string()).nullable().optional(),
});

export type RealtimeEnvelope = z.infer<typeof realtimeEnvelopeSchema>;

/** Helper: envelope amarrado a um schema de linha. */
export function realtimeEnvelopeFor<T extends z.ZodTypeAny>(rowSchema: T) {
  return realtimeEnvelopeSchema.extend({
    new: rowSchema.nullable().optional(),
    old: rowSchema.nullable().optional(),
  });
}

// ---------- Row schemas (tolerantes a null) ----------

/** Linha de `messages` como chega pelo Realtime. */
export const messageRowSchema = z
  .object({
    id: uuidSchema,
    contact_id: uuidSchema.nullable(),
    content: z.string().nullable(),
    sender: z.string().nullable(),
    status: z.string().nullable(),
    channel_type: z.string().nullable(),
    external_id: z.string().nullable(),
    media_url: z.string().nullable(),
    media_type: z.string().nullable(),
    created_at: z.string().nullable(),
    agent_id: uuidSchema.nullable(),
  })
  .passthrough();

/** Linha de `contacts`. */
export const contactRowSchema = z
  .object({
    id: uuidSchema,
    remote_jid: z.string().nullable(),
    phone: z.string().nullable(),
    push_name: z.string().nullable(),
    assigned_to: uuidSchema.nullable(),
    queue_id: uuidSchema.nullable(),
    contact_type: z.string().nullable(),
    updated_at: z.string().nullable(),
  })
  .passthrough();

/** Linha de `failed_messages` (DLQ). */
export const failedMessageRowSchema = z
  .object({
    id: uuidSchema,
    instance_name: z.string().nullable(),
    message_id: z.string().nullable(),
    error_message: z.string().nullable(),
    retry_count: z.number().int().nullable(),
    status: z.string().nullable(),
    created_at: z.string().nullable(),
  })
  .passthrough();

/** Linha de `notifications`. */
export const notificationRowSchema = z
  .object({
    id: uuidSchema,
    user_id: uuidSchema,
    title: z.string(),
    message: z.string(),
    type: z.string(),
    is_read: z.boolean().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
    read_at: z.string().nullable(),
  })
  .passthrough();

/**
 * Vocabulário conhecido de `conversation_events.event_type`. Novos tipos
 * cunhados por edge functions são tolerados (fallback `z.string()` via union)
 * para não quebrar o cliente durante rollout progressivo.
 */
export const conversationEventTypeSchema = z.union([
  z.enum([
    'assign',
    'unassign',
    'transfer',
    'queue_transfer',
    'overload_reassign',
    'absence_reassign',
    'close',
    'reopen',
    'sla_alert',
  ]),
  z.string().min(1),
]);

/** Linha de `conversation_events`. */
export const conversationEventRowSchema = z
  .object({
    id: uuidSchema,
    contact_id: uuidSchema,
    event_type: conversationEventTypeSchema,
    from_agent_id: uuidSchema.nullable(),
    to_agent_id: uuidSchema.nullable(),
    from_queue_id: uuidSchema.nullable(),
    to_queue_id: uuidSchema.nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    performed_by: uuidSchema.nullable(),
    created_at: z.string(),
  })
  .passthrough();

/** Enum estrito de `conversation_transfers.status` (bate com o CHECK do DB). */
export const conversationTransferStatusSchema = z.enum([
  'pending',
  'accepted',
  'completed',
  'returned',
  'canceled',
]);

/** Enum estrito de `conversation_transfers.transfer_type`. */
export const conversationTransferTypeSchema = z.enum([
  'direct',
  'queue',
  'internal',
]);

/** Linha de `conversation_transfers`. */
export const conversationTransferRowSchema = z
  .object({
    id: uuidSchema,
    source_conversation_id: uuidSchema,
    from_agent_id: uuidSchema.nullable(),
    to_agent_id: uuidSchema.nullable(),
    from_queue_id: uuidSchema.nullable(),
    to_queue_id: uuidSchema.nullable(),
    status: conversationTransferStatusSchema,
    transfer_type: conversationTransferTypeSchema,
    priority: z.number().int().nullable(), // DB: integer nullable
    ticket_number: z.string(),
    contact_id: uuidSchema.nullable(),
    remote_jid: z.string().nullable(),
    contact_name: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string().nullable(),
  })
  .passthrough();

/** Linha de `team_messages` (chat interno). */
export const teamMessageRowSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    sender_id: uuidSchema,
    content: z.string(),
    message_type: z.string(),
    reply_to_id: uuidSchema.nullable(),
    is_edited: z.boolean().nullable(),
    media_url: z.string().nullable(),
    media_type: z.string().nullable(),
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

/** Enum de tipos de alerta do War Room (espelha public.warroom_alert_type). */
export const warRoomAlertTypeSchema = z.enum([
  'info',
  'warning',
  'critical',
  'sla_breach',
]);
export type WarRoomAlertType = z.infer<typeof warRoomAlertTypeSchema>;

/** Linha de `warroom_alerts`. */
export const warRoomAlertRowSchema = z
  .object({
    id: uuidSchema,
    alert_type: warRoomAlertTypeSchema,
    title: z.string(),
    message: z.string(),
    source: z.string().nullable(),
    is_read: z.boolean().nullable(),
    created_at: z.string().nullable(),
  })
  .passthrough();

/** Linha de `conversation_sla` (Realtime). */
export const conversationSlaRowSchema = z
  .object({
    id: uuidSchema,
    contact_id: uuidSchema.nullable(),
    first_message_at: z.string(),
    first_response_at: z.string().nullable(),
    resolved_at: z.string().nullable(),
    first_response_breached: z.boolean().nullable(),
    resolution_breached: z.boolean().nullable(),
  })
  .passthrough();

/**
 * Linha de `audit_logs` filtrada por `action='sentiment_alert'`.
 * `details` carrega o payload semântico do alerta (contact_id/name/score).
 */
export const sentimentAlertDetailsSchema = z
  .object({
    type: z.string().optional(),
    contact_id: z.string().optional(),
    contact_name: z.string().optional(),
    contact_phone: z.string().optional(),
    sentiment_score: z.number().optional(),
    consecutive_low: z.number().int().nonnegative().optional(),
    agent_name: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

export const sentimentAlertAuditRowSchema = z
  .object({
    id: uuidSchema,
    action: z.literal('sentiment_alert'),
    entity_id: uuidSchema.nullable(),
    entity_type: z.string().nullable(),
    user_id: uuidSchema.nullable(),
    details: sentimentAlertDetailsSchema.nullable(),
    created_at: z.string(),
  })
  .passthrough();

/**
 * Linha de `zapp.team_messages` (Realtime) — subset consumido pelo hook de
 * notificações de chat interno. `media_type` é opcional/null porque mensagens
 * puramente textuais não trazem esse campo.
 */
export const teamMessageNotificationRowSchema = z
  .object({
    id: uuidSchema,
    conversation_id: uuidSchema,
    sender_id: uuidSchema,
    content: z.string(),
    media_type: z.string().nullable().optional(),
    created_at: z.string(),
  })
  .passthrough();

/** Linha de `evolution_messages` (schema externo Fator X). */
export const evolutionMessageRowSchema = z
  .object({
    id: z.string().min(1),
    message_id: z.string().min(1),
    remote_jid: z.string().min(1),
    instance_name: z.string().min(1),
    from_me: z.boolean(),
    message_type: z.string(),
    content: z.string().nullable(),
    media_url: z.string().nullable(),
    status: z.string().nullable(),
    created_at: z.string(),
    deleted_at: z.string().nullable(),
    contact_id: z.string().nullable(),
    conversation_id: z.string().nullable(),
  })
  .passthrough();

// ---------- Incoming webhook payloads ----------

/** Evolution API — evento `messages.upsert`. */
export const evolutionMessageUpsertSchema = z
  .object({
    event: z.literal('messages.upsert'),
    instance: z.string().min(1),
    data: z
      .object({
        key: z.object({
          id: z.string().min(1),
          remoteJid: remoteJidSchema,
          fromMe: z.boolean().optional().default(false),
        }),
        pushName: z.string().nullable().optional(),
        message: z.record(z.string(), z.unknown()).nullable().optional(),
        messageType: z.string().nullable().optional(),
        messageTimestamp: z
          .union([z.number(), z.string()])
          .nullable()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

/** WhatsApp Cloud — status update dentro de `entry[].changes[].value.statuses[]`. */
export const whatsappCloudStatusSchema = z.object({
  id: z.string().min(1).max(500),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string().min(1),
  recipient_id: z.string().optional(),
  errors: z
    .array(z.object({ code: z.number(), title: z.string() }))
    .optional(),
});

export const whatsappCloudWebhookSchema = z.object({
  object: z.string().min(1),
  entry: z
    .array(
      z.object({
        id: z.string(),
        changes: z.array(
          z.object({
            field: z.string(),
            value: z
              .object({
                messaging_product: z.string().optional(),
                statuses: z.array(whatsappCloudStatusSchema).optional(),
                messages: z
                  .array(
                    z
                      .object({
                        id: z.string().min(1),
                        from: z.string().min(1),
                        timestamp: z.string().min(1),
                        type: z.string().min(1),
                      })
                      .passthrough(),
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

/** Gmail — push notification (Pub/Sub decoded). */
export const gmailPushSchema = z.object({
  emailAddress: z.string().email(),
  historyId: z.union([z.string(), z.number()]).transform(String),
});

// ---------- Envelope de erro unificado (client-side) ----------

export const ContractErrorCode = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_EVENT_SHAPE: 'INVALID_EVENT_SHAPE',
  UNKNOWN_TABLE: 'UNKNOWN_TABLE',
  UNSUPPORTED_EVENT: 'UNSUPPORTED_EVENT',
} as const;
export type ContractErrorCode =
  (typeof ContractErrorCode)[keyof typeof ContractErrorCode];

export interface ContractValidationError {
  code: ContractErrorCode;
  message: string;
  details: Array<{ path: string; message: string }>;
}

/** Executa parse e devolve `{ ok, data | error }` num shape estável. */
export function safeParseEvent<T extends z.ZodTypeAny>(
  schema: T,
  raw: unknown,
  code: ContractErrorCode = ContractErrorCode.INVALID_PAYLOAD,
): { ok: true; data: z.infer<T> } | { ok: false; error: ContractValidationError } {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    error: {
      code,
      message: 'Payload rejeitado pela validação de contrato.',
      details: parsed.error.issues.map((i) => ({
        path: i.path.join('.') || '(root)',
        message: i.message,
      })),
    },
  };
}
