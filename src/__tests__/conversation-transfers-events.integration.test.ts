/**
 * Integration test — valida o fluxo `safeParseEvent` para as tabelas
 * `conversation_transfers` e `conversation_events`, garantindo:
 *   1. Payloads válidos disparam a callback de notificação.
 *   2. Payloads com enums inválidos (status/transfer_type/event_type fora
 *      do vocabulário permitido) são descartados silenciosamente.
 *   3. Payloads com campos obrigatórios ausentes ou null são descartados
 *      sem lançar exceções — o hook segue vivo para o próximo evento.
 *
 * O padrão simula exatamente o que um handler Realtime faria em produção,
 * amarrando o schema Zod ao envelope `postgres_changes`.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  conversationTransferRowSchema,
  conversationEventRowSchema,
  safeParseEvent,
} from '@/shared/webhookEventSchemas';

type RealtimePayload = { new: unknown };

/** Handler mínimo — mesmo formato usado por useWarRoomAlerts / useZappMessages. */
function makeHandler<T>(
  schema: Parameters<typeof safeParseEvent>[0],
  onValid: (row: T) => void,
) {
  return (payload: RealtimePayload) => {
    const parsed = safeParseEvent(schema, payload.new);
    if (!parsed.ok) return; // silent drop
    onValid(parsed.data as T);
  };
}

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('conversation_transfers — pipeline safeParseEvent → notificação', () => {
  const validTransfer = {
    id: UUID_A,
    source_conversation_id: UUID_B,
    from_agent_id: null,
    to_agent_id: null,
    from_queue_id: null,
    to_queue_id: null,
    status: 'pending',
    transfer_type: 'queue',
    priority: 2,
    ticket_number: 'T-100',
    contact_id: null,
    remote_jid: null,
    contact_name: null,
    metadata: null,
    created_at: '2026-07-08T10:00:00Z',
  };

  it('entrega notificação para transferência válida (status=pending, type=queue)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    handler({ new: validTransfer });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ status: 'pending', priority: 2 });
  });

  it('descarta status fora do enum ("expired") sem notificar nem lançar', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    expect(() =>
      handler({ new: { ...validTransfer, status: 'expired' } }),
    ).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta transfer_type fora do enum ("broadcast")', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    handler({ new: { ...validTransfer, transfer_type: 'broadcast' } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta priority como string (DB é integer)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    handler({ new: { ...validTransfer, priority: 'high' } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta payload sem source_conversation_id (missing)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    const { source_conversation_id, ...bad } = validTransfer;
    handler({ new: bad });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta payload com ticket_number null', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    handler({ new: { ...validTransfer, ticket_number: null } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta payload.new = null sem lançar (evento DELETE mal formado)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    expect(() => handler({ new: null })).not.toThrow();
    expect(notify).not.toHaveBeenCalled();
  });

  it('processa vários eventos em sequência — falhas não afetam sucessos', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationTransferRowSchema, notify);
    handler({ new: { ...validTransfer, status: 'nope' } }); // inválido
    handler({ new: validTransfer });                        // válido
    handler({ new: null });                                 // inválido
    handler({ new: { ...validTransfer, id: UUID_B } });     // válido
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe('conversation_events — pipeline safeParseEvent → notificação', () => {
  const validEvent = {
    id: UUID_A,
    contact_id: UUID_B,
    event_type: 'transfer',
    from_agent_id: null,
    to_agent_id: null,
    from_queue_id: null,
    to_queue_id: null,
    metadata: null,
    performed_by: null,
    created_at: '2026-07-08T10:00:00Z',
  };

  it('entrega notificação para evento válido do vocabulário (transfer)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: validEvent });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('entrega para event_type customizado (fallback string) — tolerância a rollout', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: { ...validEvent, event_type: 'ai_summary_generated' } });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('descarta event_type = "" (string vazia)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: { ...validEvent, event_type: '' } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta contact_id null (coluna NOT NULL no banco)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: { ...validEvent, contact_id: null } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta from_agent_id inválido (string não-UUID)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: { ...validEvent, from_agent_id: 'not-a-uuid' } });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta payload sem id (missing)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    const { id, ...bad } = validEvent;
    handler({ new: bad });
    expect(notify).not.toHaveBeenCalled();
  });

  it('descarta payload sem event_type (missing)', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    const { event_type, ...bad } = validEvent;
    handler({ new: bad });
    expect(notify).not.toHaveBeenCalled();
  });

  it('processa lote misto — invalidos não bloqueiam válidos', () => {
    const notify = vi.fn();
    const handler = makeHandler(conversationEventRowSchema, notify);
    handler({ new: { ...validEvent, contact_id: null } });          // inválido
    handler({ new: validEvent });                                    // válido
    handler({ new: { ...validEvent, event_type: '' } });             // inválido
    handler({ new: { ...validEvent, id: UUID_B, event_type: 'close' } }); // válido
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
