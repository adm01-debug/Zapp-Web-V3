/**
 * E37 — Mark-as-read com flush (MARK_READ_FLUSH_MS=250) + scoping por conversa visível.
 *
 * Contrato verificado (implementação em realtime/useConversationActions.ts):
 *   - Rajada de markAsRead/markManyAsRead → ZERO PATCH antes do flush; exatamente
 *     UM PATCH `.in('contact_id', ids).eq('sender','contact').eq('is_read',false)`
 *     após 250ms de inatividade. NUNCA 1 PATCH por mensagem.
 *   - IDs duplicados coalescem (Set): marcar a mesma conversa 2x → 1 id no .in().
 *   - Update otimista (commitConversations) é IMEDIATO por chamada (UX), mas o
 *     PATCH é agrupado.
 *   - Flush no unmount (fire-and-forget): navegar antes dos 250ms não perde writes
 *     (fix do finding A9 — docs/estado/06-features-inbox-hooks.md).
 *   - Guarda UUID: JID/telefone (deep-link) é descartado sem PATCH e sem otimista.
 *   - Conversa NÃO visível (não selecionada) nunca é marcada: nem no estado
 *     otimista, nem no PATCH (.in() contém apenas as conversas abertas).
 *   - Erro do PATCH → log.error, sem crash (estado otimista permanece).
 *
 * TDD: RED se o flush disparar por mensagem / sem scoping; GREEN com a
 * implementação batch atual.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useConversationActions } from '../useConversationActions';
import type { ConversationWithMessages } from '../types';

// ===== Mocks =====
type EqResult = { data: null; error: null };
type EqResultWithError = { data: null; error: { message: string } | null };
type EqFn = (column: string, value: unknown) => { eq: EqFn } | Promise<EqResult | EqResultWithError>;
type InFn = (column: string, values: string[]) => { eq: EqFn };
type UpdateFn = (payload: Record<string, unknown>) => { in: InFn };
type FromFn = (table: string) => { update: UpdateFn };

const { mockDbFrom, mockUpdate, mockIn, mockEq, mockEqLast, mockLogError, mockTouchLastSeen, mockSend } =
  vi.hoisted(() => {
    // Chain real: .update(...).in(...).eq('sender','contact').eq('is_read',false)
    // — DOIS .eq() encadeados; o segundo resolve a Promise.
    const mockEqLast = vi.fn<EqFn>().mockResolvedValue({ data: null, error: null });
    const mockEq = vi.fn<EqFn>(() => ({ eq: mockEqLast }));
    const mockIn = vi.fn<InFn>(() => ({ eq: mockEq }));
    const mockUpdate = vi.fn<UpdateFn>(() => ({ in: mockIn }));
    const mockDbFrom = vi.fn<FromFn>(() => ({ update: mockUpdate }));
    const mockLogError = vi.fn<(message: string, ...args: unknown[]) => void>();
    const mockTouchLastSeen = vi.fn<() => void>();
    const mockSend = vi.fn();
    return { mockDbFrom, mockUpdate, mockIn, mockEq, mockEqLast, mockLogError, mockTouchLastSeen, mockSend };
  });

vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: mockDbFrom,
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mockLogError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/features/inbox/services/touchLastSeen', () => ({
  touchLastSeen: mockTouchLastSeen,
}));

vi.mock('@/features/inbox/hooks/realtime/messageSender', () => ({
  sendMessageToContact: mockSend,
}));

// ===== Fixtures =====
const UUID_A = '550e8400-e29b-41d4-a716-446655440001';
const UUID_B = '550e8400-e29b-41d4-a716-446655440002';
const UUID_C = '550e8400-e29b-41d4-a716-446655440003';
const JID = '5511999887766@s.whatsapp.net';

function makeConversation(id: string, unread: number): ConversationWithMessages {
  return {
    contact: { id } as ConversationWithMessages['contact'],
    messages: Array.from({ length: unread }, (_, i) => ({
      id: `${id}-msg-${i}`,
      is_read: false,
      sender: 'contact',
    })) as ConversationWithMessages['messages'],
    unreadCount: unread,
    lastMessage: null,
    isArchived: false,
  };
}

// Estado local real: o commitConversations aplica o updater de verdade, então
// dá para verificar o efeito do update otimista (e o não-efeito nas conversas
// invisíveis) exatamente como no componente.
type CommitFn = (
  updater:
    | ConversationWithMessages[]
    | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
) => void;

let conversations: ConversationWithMessages[];
let commitConversations: ReturnType<typeof vi.fn<CommitFn>>;

beforeEach(() => {
  vi.useFakeTimers();
  mockDbFrom.mockClear();
  mockUpdate.mockClear();
  mockIn.mockClear();
  mockEq.mockClear();
  mockEqLast.mockClear();
  mockLogError.mockClear();
  mockTouchLastSeen.mockClear();
  conversations = [makeConversation(UUID_A, 2), makeConversation(UUID_B, 1)];
  commitConversations = vi.fn<CommitFn>((updater) => {
    conversations = typeof updater === 'function' ? updater(conversations) : updater;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function setup() {
  return renderHook(() => useConversationActions({ commitConversations }));
}

/** Avança o relógio e drena microtasks (o flush é async). */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('E37 — markAsRead batch flush (MARK_READ_FLUSH_MS=250)', () => {
  it('1. rajada de 5 markAsRead → zero PATCH antes do flush; 1 único PATCH .in() com os 5 ids após 250ms', async () => {
    const { result } = setup();
    const ids = [UUID_A, UUID_B, UUID_C, '550e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440005'];

    act(() => {
      for (const id of ids) void result.current.markAsRead(id);
    });

    // Ainda dentro do debounce de 250ms: NENHUM PATCH (nem por mensagem, nem batch).
    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();

    await advance(250);

    expect(mockDbFrom).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({ is_read: true });
    expect(mockIn).toHaveBeenCalledTimes(1);
    expect(mockIn.mock.calls[0]).toEqual(['contact_id', ids]);
    // Filtros do contrato: só mensagens do contato e ainda não lidas.
    expect(mockEq).toHaveBeenCalledWith('sender', 'contact');
    expect(mockEqLast).toHaveBeenCalledWith('is_read', false);
    // Touch last_seen global throttled acompanha o flush.
    expect(mockTouchLastSeen).toHaveBeenCalledTimes(1);
  });

  it('2. markManyAsRead + markAsRead na mesma rajada → 1 PATCH com a união (coalesce)', async () => {
    const { result } = setup();

    act(() => {
      result.current.markManyAsRead([UUID_A, UUID_B]);
      void result.current.markAsRead(UUID_C);
    });

    await advance(250);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockIn.mock.calls[0][1]).toEqual([UUID_A, UUID_B, UUID_C]);
  });

  it('3. mesma conversa marcada 2x → id único no PATCH (Set dedupe)', async () => {
    const { result } = setup();

    act(() => {
      void result.current.markAsRead(UUID_A);
      void result.current.markAsRead(UUID_A);
    });

    await advance(250);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockIn.mock.calls[0][1]).toEqual([UUID_A]);
  });

  it('4. chamadas espaçadas >250ms → PATCH separados (não acumula entre flushes)', async () => {
    const { result } = setup();

    act(() => void result.current.markAsRead(UUID_A));
    await advance(250);
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    act(() => void result.current.markAsRead(UUID_B));
    await advance(250);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockIn.mock.calls[1][1]).toEqual([UUID_B]);
  });

  it('5. markManyAsRead([]) → no-op: zero PATCH e zero timer', async () => {
    const { result } = setup();

    act(() => {
      result.current.markManyAsRead([]);
    });
    await advance(500);

    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(commitConversations).not.toHaveBeenCalled();
  });

  it('6. guarda UUID: markAsRead(JID) descartado sem otimista e sem PATCH; markMany filtra JIDs', async () => {
    const { result } = setup();

    act(() => {
      void result.current.markAsRead(JID);
      result.current.markManyAsRead([JID, UUID_A]);
    });

    await advance(250);

    // Só o UUID_A foi para o batch (JID filtrado).
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockIn.mock.calls[0][1]).toEqual([UUID_A]);
    // Otimista só rodou para UUID_A (markMany válido) — conversa A zera, B intacta.
    expect(conversations.find((c) => c.contact.id === UUID_A)?.unreadCount).toBe(0);
    expect(conversations.find((c) => c.contact.id === UUID_B)?.unreadCount).toBe(1);
  });

  it('7. flush no unmount antes dos 250ms → PATCH fire-and-forget com os ids pendentes (A9)', async () => {
    const { result, unmount } = setup();

    act(() => void result.current.markAsRead(UUID_A));
    expect(mockDbFrom).not.toHaveBeenCalled(); // ainda pendente

    act(() => unmount());
    await act(async () => {}); // drena a promise do flush

    expect(mockDbFrom).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockIn.mock.calls[0][1]).toEqual([UUID_A]);
  });

  it('8. otimista é IMEDIATO por chamada: commitConversations roda antes do flush, zera unread e is_read', async () => {
    const { result } = setup();

    act(() => void result.current.markAsRead(UUID_A));

    // Antes do flush: otimista aplicado.
    expect(commitConversations).toHaveBeenCalledTimes(1);
    expect(conversations.find((c) => c.contact.id === UUID_A)?.unreadCount).toBe(0);
    expect(
      conversations.find((c) => c.contact.id === UUID_A)?.messages.every((m) => m.is_read)
    ).toBe(true);
    expect(mockDbFrom).not.toHaveBeenCalled();

    await advance(250);
    expect(conversations.find((c) => c.contact.id === UUID_A)?.unreadCount).toBe(0);
  });

  it('9. conversa NÃO visível (não selecionada) nunca é marcada: estado e PATCH escopados na visível', async () => {
    const { result } = setup();

    act(() => void result.current.markAsRead(UUID_A));
    await advance(250);

    // Conversa B (background, invisível): intocada no estado otimista.
    const convB = conversations.find((c) => c.contact.id === UUID_B);
    expect(convB?.unreadCount).toBe(1);
    expect(convB?.messages.every((m) => m.is_read)).toBe(false);

    // PATCH escopado: .in() contém APENAS a conversa visível.
    expect(mockIn.mock.calls[0][1]).toEqual([UUID_A]);
    // E a conversa visível foi marcada.
    const convA = conversations.find((c) => c.contact.id === UUID_A);
    expect(convA?.unreadCount).toBe(0);
    expect(convA?.messages.every((m) => m.is_read)).toBe(true);
  });

  it('10. erro do PATCH → log.error sem crash; estado otimista permanece', async () => {
    mockEqLast.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { result } = setup();

    act(() => void result.current.markAsRead(UUID_A));
    await advance(250);

    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(String(mockLogError.mock.calls[0][0])).toContain('Error marking messages as read');
    // Otimista não é revertido.
    expect(conversations.find((c) => c.contact.id === UUID_A)?.unreadCount).toBe(0);
  });
});
