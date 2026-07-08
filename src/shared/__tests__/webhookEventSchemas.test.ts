import { describe, expect, it } from 'vitest';
import {
  ContractErrorCode,
  contactRowSchema,
  evolutionMessageUpsertSchema,
  failedMessageRowSchema,
  gmailPushSchema,
  messageRowSchema,
  realtimeEnvelopeFor,
  realtimeEnvelopeSchema,
  safeParseEvent,
  whatsappCloudWebhookSchema,
} from '@/shared/webhookEventSchemas';

// ---------------------- Realtime envelope ----------------------

describe('realtimeEnvelopeSchema', () => {
  it('aceita INSERT com row completa', () => {
    const r = realtimeEnvelopeSchema.safeParse({
      schema: 'public',
      table: 'messages',
      eventType: 'INSERT',
      new: { id: 'x', content: 'oi' },
      old: null,
    });
    expect(r.success).toBe(true);
  });

  it('aceita DELETE com new=null', () => {
    const r = realtimeEnvelopeSchema.safeParse({
      schema: 'public',
      table: 'messages',
      eventType: 'DELETE',
      new: null,
      old: { id: 'x' },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita eventType desconhecido', () => {
    const r = realtimeEnvelopeSchema.safeParse({
      schema: 'public',
      table: 'messages',
      eventType: 'MERGE',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita quando table está ausente', () => {
    const r = realtimeEnvelopeSchema.safeParse({
      schema: 'public',
      eventType: 'INSERT',
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------- Row schemas tolerantes a null ----------------------

describe('row schemas — tolerância a null', () => {
  it('messageRowSchema aceita todos os campos anuláveis como null', () => {
    const r = messageRowSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      contact_id: null,
      content: null,
      sender: null,
      status: null,
      channel_type: null,
      external_id: null,
      media_url: null,
      media_type: null,
      created_at: null,
      agent_id: null,
    });
    expect(r.success).toBe(true);
  });

  it('messageRowSchema rejeita id ausente', () => {
    const r = messageRowSchema.safeParse({ contact_id: null });
    expect(r.success).toBe(false);
  });

  it('messageRowSchema preserva campos extras (passthrough)', () => {
    const r = messageRowSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      contact_id: null,
      content: 'x',
      sender: 'agent',
      status: null,
      channel_type: null,
      external_id: null,
      media_url: null,
      media_type: null,
      created_at: null,
      agent_id: null,
      _custom: 'preservado',
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>)._custom).toBe('preservado');
  });

  it('contactRowSchema aceita phone null e queue_id null', () => {
    const r = contactRowSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      remote_jid: null,
      phone: null,
      push_name: null,
      assigned_to: null,
      queue_id: null,
      contact_type: null,
      updated_at: null,
    });
    expect(r.success).toBe(true);
  });

  it('failedMessageRowSchema aceita retry_count null', () => {
    const r = failedMessageRowSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      instance_name: null,
      message_id: null,
      error_message: null,
      retry_count: null,
      status: null,
      created_at: null,
    });
    expect(r.success).toBe(true);
  });
});

// ---------------------- Evolution webhook ----------------------

describe('evolutionMessageUpsertSchema', () => {
  const base = {
    event: 'messages.upsert' as const,
    instance: 'inst-1',
    data: {
      key: {
        id: 'ABC',
        remoteJid: '5511999999999@s.whatsapp.net',
        fromMe: false,
      },
      pushName: null,
      message: null,
      messageType: null,
      messageTimestamp: null,
    },
  };

  it('aceita payload mínimo', () => {
    expect(evolutionMessageUpsertSchema.safeParse(base).success).toBe(true);
  });

  it('aceita fromMe ausente (default false)', () => {
    const { fromMe: _fromMe, ...key } = base.data.key;
    void _fromMe;
    const r = evolutionMessageUpsertSchema.safeParse({
      ...base,
      data: { ...base.data, key },
    });
    expect(r.success).toBe(true);
  });

  it('rejeita remoteJid mal-formado', () => {
    const r = evolutionMessageUpsertSchema.safeParse({
      ...base,
      data: { ...base.data, key: { ...base.data.key, remoteJid: 'not-a-jid' } },
    });
    expect(r.success).toBe(false);
  });

  it('rejeita quando event é outro', () => {
    const r = evolutionMessageUpsertSchema.safeParse({
      ...base,
      event: 'contacts.upsert',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita quando data.key.id está vazio', () => {
    const r = evolutionMessageUpsertSchema.safeParse({
      ...base,
      data: { ...base.data, key: { ...base.data.key, id: '' } },
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------- WhatsApp Cloud ----------------------

describe('whatsappCloudWebhookSchema', () => {
  it('aceita status update', () => {
    const r = whatsappCloudWebhookSchema.safeParse({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'x',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [
                  { id: 'wamid.abc', status: 'delivered', timestamp: '123' },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejeita status fora do enum', () => {
    const r = whatsappCloudWebhookSchema.safeParse({
      object: 'x',
      entry: [
        {
          id: 'x',
          changes: [
            {
              field: 'messages',
              value: {
                statuses: [{ id: 'a', status: 'queued', timestamp: '1' }],
              },
            },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it('rejeita entry vazio', () => {
    const r = whatsappCloudWebhookSchema.safeParse({
      object: 'x',
      entry: [],
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------- Gmail push ----------------------

describe('gmailPushSchema', () => {
  it('aceita historyId numérico e string', () => {
    expect(
      gmailPushSchema.safeParse({ emailAddress: 'a@b.com', historyId: 12 }).success,
    ).toBe(true);
    expect(
      gmailPushSchema.safeParse({ emailAddress: 'a@b.com', historyId: '12' }).success,
    ).toBe(true);
  });

  it('rejeita email inválido', () => {
    expect(
      gmailPushSchema.safeParse({ emailAddress: 'nao-email', historyId: '1' }).success,
    ).toBe(false);
  });
});

// ---------------------- safeParseEvent envelope ----------------------

describe('safeParseEvent', () => {
  it('devolve ok:true com data em sucesso', () => {
    const r = safeParseEvent(gmailPushSchema, {
      emailAddress: 'a@b.com',
      historyId: '1',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.historyId).toBe('1');
  });

  it('devolve ok:false com code padrão INVALID_PAYLOAD e path detalhado', () => {
    const r = safeParseEvent(gmailPushSchema, { emailAddress: 'x', historyId: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
      expect(r.error.details.length).toBeGreaterThan(0);
      expect(r.error.details[0]?.path).toBe('emailAddress');
    }
  });

  it('permite sobrescrever code', () => {
    const r = safeParseEvent(
      realtimeEnvelopeSchema,
      { table: 'x' },
      ContractErrorCode.INVALID_EVENT_SHAPE,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(ContractErrorCode.INVALID_EVENT_SHAPE);
  });
});

// ---------------------- realtimeEnvelopeFor (integração) ----------------------

describe('realtimeEnvelopeFor(messageRowSchema)', () => {
  const envelope = realtimeEnvelopeFor(messageRowSchema);

  it('valida envelope + row juntos', () => {
    const r = envelope.safeParse({
      schema: 'public',
      table: 'messages',
      eventType: 'INSERT',
      new: {
        id: '11111111-1111-4111-8111-111111111111',
        contact_id: null,
        content: 'oi',
        sender: 'client',
        status: null,
        channel_type: null,
        external_id: null,
        media_url: null,
        media_type: null,
        created_at: null,
        agent_id: null,
      },
      old: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita quando new.id não é uuid', () => {
    const r = envelope.safeParse({
      schema: 'public',
      table: 'messages',
      eventType: 'INSERT',
      new: { id: 'nope' },
      old: null,
    });
    expect(r.success).toBe(false);
  });
});

// ---------- Novos row schemas (2026-07-08) ----------

import {
  notificationRowSchema,
  conversationEventRowSchema,
  conversationTransferRowSchema,
  teamMessageRowSchema,
} from '../webhookEventSchemas';

describe('notificationRowSchema', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    title: 'Nova mensagem',
    message: 'Cliente aguardando',
    type: 'inbox',
    is_read: false,
    metadata: null,
    created_at: '2026-07-08T10:00:00Z',
    read_at: null,
  };

  it('aceita payload completo', () => {
    expect(notificationRowSchema.safeParse(base).success).toBe(true);
  });

  it('aceita is_read null e read_at null', () => {
    expect(
      notificationRowSchema.safeParse({ ...base, is_read: null, read_at: null }).success,
    ).toBe(true);
  });

  it('rejeita quando campo obrigatório title está ausente', () => {
    const { title, ...withoutTitle } = base;
    expect(notificationRowSchema.safeParse(withoutTitle).success).toBe(false);
  });
});

describe('conversationEventRowSchema', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    contact_id: '22222222-2222-4222-8222-222222222222',
    event_type: 'transfer',
    from_agent_id: null,
    to_agent_id: null,
    from_queue_id: null,
    to_queue_id: null,
    metadata: null,
    performed_by: null,
    created_at: '2026-07-08T10:00:00Z',
  };

  it('aceita todos os campos opcionais como null', () => {
    expect(conversationEventRowSchema.safeParse(base).success).toBe(true);
  });

  it('rejeita event_type ausente', () => {
    const { event_type, ...bad } = base;
    expect(conversationEventRowSchema.safeParse(bad).success).toBe(false);
  });
});

describe('conversationTransferRowSchema', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    source_conversation_id: '22222222-2222-4222-8222-222222222222',
    from_agent_id: null,
    to_agent_id: null,
    from_queue_id: null,
    to_queue_id: null,
    status: 'pending',
    transfer_type: 'queue',
    priority: null,
    ticket_number: 'T-001',
    contact_id: null,
    remote_jid: null,
    contact_name: null,
    metadata: null,
    created_at: null,
  };

  it('aceita created_at null (coluna nullable no banco)', () => {
    expect(conversationTransferRowSchema.safeParse(base).success).toBe(true);
  });

  it('rejeita ticket_number ausente', () => {
    const { ticket_number, ...bad } = base;
    expect(conversationTransferRowSchema.safeParse(bad).success).toBe(false);
  });
});

describe('teamMessageRowSchema', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    conversation_id: '22222222-2222-4222-8222-222222222222',
    sender_id: '33333333-3333-4333-8333-333333333333',
    content: 'oi',
    message_type: 'text',
    reply_to_id: null,
    is_edited: null,
    media_url: null,
    media_type: null,
    status: 'sent' as const,
    created_at: '2026-07-08T10:00:00Z',
    updated_at: '2026-07-08T10:00:00Z',
  };

  it('aceita status sent (default)', () => {
    expect(teamMessageRowSchema.safeParse(base).success).toBe(true);
  });

  it('rejeita status fora do enum', () => {
    expect(
      teamMessageRowSchema.safeParse({ ...base, status: 'processing' }).success,
    ).toBe(false);
  });

  it('safeParseEvent envelopa e devolve error estruturado', () => {
    const envelope = realtimeEnvelopeFor(teamMessageRowSchema);
    const result = safeParseEvent(envelope, {
      schema: 'public',
      table: 'team_messages',
      eventType: 'INSERT',
      new: { ...base, status: 'lolwut' },
      old: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
      expect(result.error.details.length).toBeGreaterThan(0);
    }
  });
});


// ---------------------- WarRoom / SLA / Evolution rows ----------------------

import {
  warRoomAlertRowSchema,
  conversationSlaRowSchema,
  evolutionMessageRowSchema,
} from '@/shared/webhookEventSchemas';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('warRoomAlertRowSchema', () => {
  it('aceita linha completa', () => {
    const r = warRoomAlertRowSchema.safeParse({
      id: UUID,
      alert_type: 'critical',
      title: 'Down',
      message: 'x',
      source: null,
      is_read: false,
      created_at: null,
    });
    expect(r.success).toBe(true);
  });

  it('tolera source/is_read/created_at nulos (P0)', () => {
    const r = warRoomAlertRowSchema.safeParse({
      id: UUID, alert_type: 'info', title: 't', message: 'm',
      source: null, is_read: null, created_at: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita quando faltam campos obrigatórios (missing)', () => {
    const r = warRoomAlertRowSchema.safeParse({ id: UUID, alert_type: 'critical' });
    expect(r.success).toBe(false);
  });

  it('rejeita alert_type fora do enum (info/warning/critical/sla_breach)', () => {
    const r = warRoomAlertRowSchema.safeParse({
      id: UUID, alert_type: 'error', title: 't', message: 'm',
      source: null, is_read: null, created_at: null,
    });
    expect(r.success).toBe(false);
  });

  it('aceita sla_breach como alert_type válido', () => {
    const r = warRoomAlertRowSchema.safeParse({
      id: UUID, alert_type: 'sla_breach', title: 't', message: 'm',
      source: 'sla-monitor', is_read: false, created_at: null,
    });
    expect(r.success).toBe(true);
  });
});

describe('conversationSlaRowSchema', () => {
  it('aceita linha com contact_id null', () => {
    const r = conversationSlaRowSchema.safeParse({
      id: UUID,
      contact_id: null,
      first_message_at: new Date().toISOString(),
      first_response_at: null,
      resolved_at: null,
      first_response_breached: null,
      resolution_breached: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita quando id não é UUID', () => {
    const r = conversationSlaRowSchema.safeParse({
      id: 'not-uuid', contact_id: null,
      first_message_at: '2026-01-01', first_response_at: null,
      resolved_at: null, first_response_breached: null, resolution_breached: null,
    });
    expect(r.success).toBe(false);
  });

  it('safeParseEvent devolve erro estruturado para SLA missing', () => {
    const result = safeParseEvent(conversationSlaRowSchema, { id: UUID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.length).toBeGreaterThan(0);
  });
});

describe('evolutionMessageRowSchema', () => {
  it('aceita mensagem com media_url/content nulos', () => {
    const r = evolutionMessageRowSchema.safeParse({
      id: 'row-1', message_id: 'm-1', remote_jid: '5511@s.whatsapp.net',
      instance_name: 'inst', from_me: false, message_type: 'text',
      content: null, media_url: null, status: null,
      created_at: '2026-01-01T00:00:00Z', deleted_at: null,
      contact_id: null, conversation_id: null,
    });
    expect(r.success).toBe(true);
  });

  it('rejeita from_me ausente', () => {
    const r = evolutionMessageRowSchema.safeParse({
      id: 'x', message_id: 'y', remote_jid: 'z', instance_name: 'i',
      message_type: 't', content: null, media_url: null, status: null,
      created_at: 'now', deleted_at: null, contact_id: null, conversation_id: null,
    });
    expect(r.success).toBe(false);
  });
});

// ---------------------- sentimentAlertAuditRowSchema ----------------------

import {
  sentimentAlertAuditRowSchema,
  teamMessageNotificationRowSchema,
} from '@/shared/webhookEventSchemas';

const SENTIMENT_UUID = '11111111-1111-1111-1111-111111111111';

describe('sentimentAlertAuditRowSchema', () => {
  it('aceita payload completo', () => {
    const r = sentimentAlertAuditRowSchema.safeParse({
      id: SENTIMENT_UUID,
      action: 'sentiment_alert',
      entity_id: SENTIMENT_UUID,
      entity_type: 'contact',
      user_id: SENTIMENT_UUID,
      details: { contact_id: 'c1', contact_name: 'João', sentiment_score: 10, consecutive_low: 3 },
      created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('aceita entity_id/user_id/details=null', () => {
    const r = sentimentAlertAuditRowSchema.safeParse({
      id: SENTIMENT_UUID,
      action: 'sentiment_alert',
      entity_id: null,
      entity_type: null,
      user_id: null,
      details: null,
      created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita action divergente', () => {
    const r = sentimentAlertAuditRowSchema.safeParse({
      id: SENTIMENT_UUID,
      action: 'other',
      entity_id: null, entity_type: null, user_id: null, details: null,
      created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita id ausente (missing)', () => {
    const r = sentimentAlertAuditRowSchema.safeParse({
      action: 'sentiment_alert',
      entity_id: null, entity_type: null, user_id: null, details: null,
      created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('safeParseEvent devolve detalhes de erro estruturados', () => {
    const out = safeParseEvent(sentimentAlertAuditRowSchema, { action: 'sentiment_alert' });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe(ContractErrorCode.INVALID_PAYLOAD);
      expect(out.error.details.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------- teamMessageNotificationRowSchema ----------------------

describe('teamMessageNotificationRowSchema', () => {
  it('aceita mensagem de texto sem media_type', () => {
    const r = teamMessageNotificationRowSchema.safeParse({
      id: SENTIMENT_UUID, conversation_id: SENTIMENT_UUID, sender_id: SENTIMENT_UUID,
      content: 'olá', created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('aceita media_type=null explicitamente', () => {
    const r = teamMessageNotificationRowSchema.safeParse({
      id: SENTIMENT_UUID, conversation_id: SENTIMENT_UUID, sender_id: SENTIMENT_UUID,
      content: '', media_type: null, created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(true);
  });

  it('aceita media_type conhecido (image/audio/video/document)', () => {
    for (const media_type of ['image', 'audio', 'video', 'document', 'sticker']) {
      const r = teamMessageNotificationRowSchema.safeParse({
        id: SENTIMENT_UUID, conversation_id: SENTIMENT_UUID, sender_id: SENTIMENT_UUID,
        content: '', media_type, created_at: '2026-07-08T12:00:00Z',
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejeita conversation_id não-SENTIMENT_UUID', () => {
    const r = teamMessageNotificationRowSchema.safeParse({
      id: SENTIMENT_UUID, conversation_id: 'not-uuid', sender_id: SENTIMENT_UUID,
      content: '', created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(false);
  });

  it('rejeita content ausente (missing)', () => {
    const r = teamMessageNotificationRowSchema.safeParse({
      id: SENTIMENT_UUID, conversation_id: SENTIMENT_UUID, sender_id: SENTIMENT_UUID,
      created_at: '2026-07-08T12:00:00Z',
    });
    expect(r.success).toBe(false);
  });
});
