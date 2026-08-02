/**
 * Testes exaustivos de useChatQuickReplyControl — lógica de quick-reply via
 * prefixo "/", navegação por teclado e seleção de item.
 *
 * O hook é pura lógica (sem DOM), então renderHook é suficiente — não precisa
 * de jsdom nem de mocks pesados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatQuickReplyControl } from '../hooks/useChatQuickReplyControl';
import type { QuickReply } from '@/types/chat';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const REPLIES: QuickReply[] = [
  { id: 'r1', shortcut: 'oi',    title: 'Boas-vindas', content: 'Olá, como posso ajudar?', use_count: 0, category: null, workspace_id: 'w1', created_at: '', is_active: true },
  { id: 'r2', shortcut: 'ag',    title: 'Agradecimento', content: 'Obrigado pelo contato!', use_count: 0, category: null, workspace_id: 'w1', created_at: '', is_active: true },
  { id: 'r3', shortcut: 'prec',  title: 'Preciso verificar', content: 'Vou verificar e retorno.', use_count: 0, category: null, workspace_id: 'w1', created_at: '', is_active: true },
];

function makeParams(overrides: Partial<Parameters<typeof useChatQuickReplyControl>[0]> = {}) {
  const defaults: Parameters<typeof useChatQuickReplyControl>[0] = {
    inputValue: '',
    dbQuickReplies: REPLIES,
    quickRepliesOpen: false,
    openQuickReplies: vi.fn(),
    closeQuickReplies: vi.fn(),
    slashCommandsOpen: false,
    setInputValue: vi.fn(),
    focusInput: vi.fn(),
    incrementUseCount: vi.fn(),
    baseHandleInputChange: vi.fn(),
    baseHandleKeyDown: vi.fn(),
    ...overrides,
  };
  return defaults;
}

function makeKeyEvent(key: string, extra: Partial<React.KeyboardEvent> = {}): React.KeyboardEvent {
  return { key, preventDefault: vi.fn(), shiftKey: false, ...extra } as unknown as React.KeyboardEvent;
}

// ── filtered ──────────────────────────────────────────────────────────────────

describe('useChatQuickReplyControl — filtered', () => {
  it('retorna array vazio quando inputValue não começa com "/"', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: 'oi' }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });

  it('retorna todos os itens quando apenas "/" é digitado (sem filtro)', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/', dbQuickReplies: REPLIES }))
    );
    expect(result.current.filtered).toHaveLength(REPLIES.length);
  });

  it('filtra por shortcut (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/OI', dbQuickReplies: REPLIES }))
    );
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('r1');
  });

  it('filtra por title (case-insensitive)', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/agradec', dbQuickReplies: REPLIES }))
    );
    expect(result.current.filtered).toHaveLength(1);
    expect(result.current.filtered[0].id).toBe('r2');
  });

  it('retorna vazio quando nenhum shortcut ou title bate', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/xyz_inexistente', dbQuickReplies: REPLIES }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });

  it('não altera filtered quando dbQuickReplies é vazio', () => {
    const { result } = renderHook(() =>
      useChatQuickReplyControl(makeParams({ inputValue: '/oi', dbQuickReplies: [] }))
    );
    expect(result.current.filtered).toHaveLength(0);
  });
});

// ── handleInputChange ─────────────────────────────────────────────────────────

describe('useChatQuickReplyControl — handleInputChange', () => {
  let params: ReturnType<typeof makeParams>;

  beforeEach(() => {
    params = makeParams({ quickRepliesOpen: false });
  });

  function makeChangeEvent(value: string): React.ChangeEvent<HTMLTextAreaElement> {
    return { target: { value } } as React.ChangeEvent<HTMLTextAreaElement>;
  }

  it('abre quick replies quando value começa com "/"', () => {
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    act(() => { result.current.handleInputChange(makeChangeEvent('/oi')); });
    expect(params.openQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('não reabre quick replies se já estava aberto', () => {
    const p = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleInputChange(makeChangeEvent('/oi')); });
    expect(p.openQuickReplies).not.toHaveBeenCalled();
  });

  it('fecha quick replies quando value não começa com "/"', () => {
    const p = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleInputChange(makeChangeEvent('oi')); });
    expect(p.closeQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('sempre chama baseHandleInputChange com o evento original', () => {
    const { result } = renderHook(() => useChatQuickReplyControl(params));
    const evt = makeChangeEvent('/oi');
    act(() => { result.current.handleInputChange(evt); });
    expect(params.baseHandleInputChange).toHaveBeenCalledWith(evt);
  });

  it('reseta selectedIndex para 0 quando "/" é digitado', () => {
    // Seta índice para 2 via ArrowDown e depois muda input para resetar
    // inputValue: '/' retorna todos os 3 REPLIES → selectedIndex pode chegar a 2
    const p = makeParams({
      inputValue: '/',
      dbQuickReplies: REPLIES,
      quickRepliesOpen: true,
    });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    // Desce 2 posições
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(result.current.selectedIndex).toBe(2);
    // Re-digitar "/" deve resetar
    act(() => { result.current.handleInputChange(makeChangeEvent('/a')); });
    expect(result.current.selectedIndex).toBe(0);
  });
});

// ── handleKeyDown — Escape ────────────────────────────────────────────────────

describe('useChatQuickReplyControl — handleKeyDown Escape', () => {
  it('fecha quick replies quando quickRepliesOpen=true e Escape pressionado', () => {
    const p = makeParams({ quickRepliesOpen: true });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    const evt = makeKeyEvent('Escape');
    act(() => { result.current.handleKeyDown(evt); });
    expect(p.closeQuickReplies).toHaveBeenCalledTimes(1);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it('delega para baseHandleKeyDown quando quickRepliesOpen=false', () => {
    const p = makeParams({ quickRepliesOpen: false });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Escape')); });
    expect(p.baseHandleKeyDown).toHaveBeenCalledTimes(1);
    expect(p.closeQuickReplies).not.toHaveBeenCalled();
  });
});

// ── handleKeyDown — ArrowDown / ArrowUp ───────────────────────────────────────

describe('useChatQuickReplyControl — handleKeyDown navegação', () => {
  it('ArrowDown avança selectedIndex', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(result.current.selectedIndex).toBe(1);
  });

  it('ArrowDown wraps do último para o primeiro', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    // REPLIES tem 3 itens; descer 3x volta ao início
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp sobe selectedIndex', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    // Desce uma vez e sobe de volta
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')); });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('ArrowUp wraps do primeiro para o último', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowUp')); });
    // 0 - 1 + 3 = 2
    expect(result.current.selectedIndex).toBe(REPLIES.length - 1);
  });

  it('ArrowDown não chama baseHandleKeyDown quando quickRepliesOpen=true e há itens', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(p.baseHandleKeyDown).not.toHaveBeenCalled();
  });

  it('delega ArrowDown para baseHandleKeyDown quando filtered está vazio', () => {
    const p = makeParams({ inputValue: '/xyz', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    // /xyz não bate em nenhum REPLY → filtered.length === 0
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); });
    expect(p.baseHandleKeyDown).toHaveBeenCalledTimes(1);
  });
});

// ── handleKeyDown — Enter ─────────────────────────────────────────────────────

describe('useChatQuickReplyControl — handleKeyDown Enter', () => {
  it('Enter seleciona o item em selectedIndex e fecha o overlay', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    // selectedIndex = 0 → r1
    const evt = makeKeyEvent('Enter');
    act(() => { result.current.handleKeyDown(evt); });
    expect(p.setInputValue).toHaveBeenCalledWith(REPLIES[0].content);
    expect(p.closeQuickReplies).toHaveBeenCalledTimes(1);
    expect(p.incrementUseCount).toHaveBeenCalledWith(REPLIES[0].id);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it('Enter no segundo item seleciona-o corretamente', () => {
    const p = makeParams({ inputValue: '/', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('ArrowDown')); }); // selectedIndex → 1
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    expect(p.setInputValue).toHaveBeenCalledWith(REPLIES[1].content);
    expect(p.incrementUseCount).toHaveBeenCalledWith(REPLIES[1].id);
  });

  it('Enter não faz nada quando filtered está vazio', () => {
    const p = makeParams({ inputValue: '/xyz', quickRepliesOpen: true, dbQuickReplies: REPLIES });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    // filtered vazio → delega para base
    expect(p.baseHandleKeyDown).toHaveBeenCalledTimes(1);
    expect(p.setInputValue).not.toHaveBeenCalled();
  });

  it('Enter delega para baseHandleKeyDown quando quickRepliesOpen=false', () => {
    const p = makeParams({ quickRepliesOpen: false });
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleKeyDown(makeKeyEvent('Enter')); });
    expect(p.baseHandleKeyDown).toHaveBeenCalledTimes(1);
  });
});

// ── handleQuickReply ──────────────────────────────────────────────────────────

describe('useChatQuickReplyControl — handleQuickReply', () => {
  it('define o conteúdo no input', () => {
    const p = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleQuickReply(REPLIES[2]); });
    expect(p.setInputValue).toHaveBeenCalledWith(REPLIES[2].content);
  });

  it('fecha o overlay', () => {
    const p = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleQuickReply(REPLIES[0]); });
    expect(p.closeQuickReplies).toHaveBeenCalledTimes(1);
  });

  it('incrementa o contador de uso', () => {
    const p = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleQuickReply(REPLIES[1]); });
    expect(p.incrementUseCount).toHaveBeenCalledWith(REPLIES[1].id);
  });

  it('chama focusInput (async via setTimeout) — não explode', () => {
    vi.useFakeTimers();
    const p = makeParams();
    const { result } = renderHook(() => useChatQuickReplyControl(p));
    act(() => { result.current.handleQuickReply(REPLIES[0]); });
    act(() => { vi.runAllTimers(); });
    expect(p.focusInput).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
