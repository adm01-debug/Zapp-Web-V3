/**
 * BURST TEST — Contrato de hot path do painel de chat.
 *
 * Invariante sob teste: `useChatPanelHandlers` NÃO dispara nenhuma query
 * REST (dbFrom / supabase) por conta própria ao:
 *   1. montar com um contato selecionado (UUID ou JID);
 *   2. trocar de contato (rerender em rajada — o "burst");
 *   3. executar handlers de UI puros (reply, copy, forward, botão interativo);
 *   4. enviar mensagem de texto (o REST do envio vive em `onSendMessage`,
 *      fora deste hook — aqui NADA deve ir ao banco).
 *
 * Contexto (bug de produção 2026-08): ao abrir um contato, o painel disparava
 * queries REST paralelas além do rpc_list_messages_lite canônico, saturando o
 * semáforo de 8 slots do client.ts (429 + latências 4-16s). Este arquivo
 * cobre a fatia de responsabilidade de useChatPanelHandlers: provar que a
 * seleção/troca de contato neste hook custa ZERO queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatPanelHandlers } from '../useChatPanelHandlers';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ toast: (p: unknown) => mockToast(p) }));

/** Registra TODA chamada a dbFrom (tabela) — o coração do teste. */
const mockDbFromCalls: string[] = [];
const resolveOk = () => Promise.resolve({ data: null, error: null });
const makeBuilder = (): unknown => {
  // Builder encadeável e seguro: qualquer método retorna o próprio builder e
  // await resolve para { data: null, error: null } (nunca lança).
  const b = (() => resolveOk()) as unknown as Record<string, unknown> & (() => unknown);
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'ilike',
    'like',
    'limit',
    'maybeSingle',
    'single',
    'order',
    'in',
    'match',
    'returns',
    'range',
  ]) {
    b[m] = () => b;
  }
  return b;
};
const mockDbFrom = vi.fn((...args: unknown[]) => {
  mockDbFromCalls.push(String(args[0]));
  return makeBuilder();
});
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (...args: unknown[]) => mockDbFrom(...args),
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ profile: { id: 'user-1' } }),
}));
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/undoToast', () => ({ undoToast: vi.fn() }));
vi.mock('@/features/inbox/hooks/useWhisperMessagesMutation', () => ({
  insertWhisperMessage: vi.fn(() => Promise.resolve({ error: null })),
}));
vi.mock('../useInputHandlers', () => ({
  useInputHandlers: () => ({
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSlashCommand: vi.fn(),
  }),
}));
vi.mock('../useProductHandlers', () => ({
  useProductHandlers: () => ({
    handleSendProduct: vi.fn(),
    handleSendInteractiveMessage: vi.fn(),
    handleInteractiveButtonClick: vi.fn(),
    handleSendLocation: vi.fn(),
  }),
}));
vi.mock('../useAudioVoiceChange', () => ({
  useAudioVoiceChange: () => ({ handleAudioVoiceChange: vi.fn() }),
}));
vi.mock('../useMessageReactionHandlers', () => ({
  useMessageReactionHandlers: () => ({
    handleReplyToMessage: vi.fn(),
    handleCopyMessage: vi.fn(),
    handleForwardMessage: vi.fn(),
    handleForwardToTargets: vi.fn(),
  }),
}));

const mockWriteText = vi.fn();
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: mockWriteText },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const UUID_A = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const UUID_B = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b22';
const JID = '5511999887766@s.whatsapp.net';

type Handlers = ReturnType<typeof useChatPanelHandlers>;

function makeProps(contactId: string, onSendMessage = vi.fn()) {
  return {
    conversationId: 'conv-1',
    contactId,
    contactPhone: '5511999887766',
    instanceName: 'wpp2',
    onSendMessage,
    editMessageApi: vi.fn(),
    applySignature: (t: string) => t,
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
    openDialog: vi.fn(),
    closeDialog: vi.fn(),
    handleSetActiveTool: vi.fn(),
  } as Parameters<typeof useChatPanelHandlers>[0];
}

function renderWith(contactId: string) {
  const onSendMessage = vi.fn();
  const utils = renderHook(
    (props: Parameters<typeof useChatPanelHandlers>[0]) => useChatPanelHandlers(props),
    { initialProps: makeProps(contactId, onSendMessage) }
  );
  return { ...utils, onSendMessage };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbFromCalls.length = 0;
  mockWriteText.mockResolvedValue(undefined);
});

// ── Testes ────────────────────────────────────────────────────────────────────

describe('hot path do contato selecionado — ZERO queries dbFrom', () => {
  it('montar com contato UUID não dispara nenhuma query', () => {
    renderWith(UUID_A);
    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockDbFromCalls).toEqual([]);
  });

  it('montar com contato JID (modo externo) não dispara nenhuma query', () => {
    renderWith(JID);
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it('burst de 5 trocas de contato (rerender) não dispara nenhuma query', () => {
    const { rerender } = renderWith(UUID_A);
    for (const id of [UUID_B, JID, UUID_A, UUID_B, JID]) {
      act(() => {
        rerender(makeProps(id));
      });
    }
    expect(mockDbFrom).not.toHaveBeenCalled();
    expect(mockDbFromCalls).toEqual([]);
  });

  it('handlers de UI puros (reply/copy/forward/botão interativo) não disparam queries', async () => {
    const { result } = renderWith(UUID_A);
    const msg = {
      id: 'msg-1',
      content: 'oi',
      type: 'text',
      timestamp: new Date().toISOString(),
    } as unknown as Parameters<Handlers['handleReplyToMessage']>[0];

    await act(async () => {
      result.current.handleReplyToMessage(msg);
      await result.current.handleCopyMessage('oi');
      result.current.handleForwardMessage(msg);
      result.current.handleInteractiveButtonClick({ id: 'b1', title: 'Sim' } as never);
    });

    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it('enviar mensagem de texto usa onSendMessage e NÃO toca no banco via dbFrom', async () => {
    const { result, onSendMessage } = renderWith(UUID_A);

    act(() => {
      result.current.setInputValue('mensagem de teste');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(onSendMessage).toHaveBeenCalledWith('mensagem de teste', undefined, expect.any(Function));
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it('enviar sussurro (UUID) usa insertWhisperMessage, não dbFrom', async () => {
    const { result } = renderWith(UUID_A);
    const { insertWhisperMessage } = await import(
      '@/features/inbox/hooks/useWhisperMessagesMutation'
    );

    act(() => {
      result.current.setIsWhisper(true);
      result.current.setInputValue('nota interna');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(insertWhisperMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: UUID_A, content: 'nota interna' })
    );
    expect(mockDbFrom).not.toHaveBeenCalled();
  });

  it('enviar sussurro com JID falha com guard visível e sem query', async () => {
    const { result } = renderWith(JID);

    act(() => {
      result.current.setIsWhisper(true);
      result.current.setInputValue('nota');
    });
    await act(async () => {
      await result.current.handleSend();
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive' })
    );
    expect(mockDbFrom).not.toHaveBeenCalled();
  });
});
