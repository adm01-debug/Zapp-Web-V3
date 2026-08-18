/**
 * E40.2/E40.3 — Contrato de autoscroll inteligente (useChatAutoScroll).
 *
 * Contrato (docs/audit-2026-08-16/PLANO-100-ETAPAS.md, etapa 40):
 *  - "near bottom" = distância RELATIVA ao fim do container
 *    (scrollHeight - scrollTop - clientHeight < 150px), nunca scrollTop absoluto;
 *  - usuário longe do fim → NOVO scroll automático NÃO ocorre (preserva leitura);
 *  - usuário no fim → scroll segue novas mensagens;
 *  - indicador de digitação só rola quando o usuário está no fim;
 *  - a posição inicial deve ser computada no bind do listener (sem depender de
 *    um evento de scroll posterior) — guard de estado stale entre conversas;
 *  - scrollToBottom() imperativo re-arma o "estou no fim" (usuário enviou msg).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatAutoScroll } from '../useChatAutoScroll';
import type { ChatMessagesAreaRef } from '../../components/chat/ChatMessagesArea';

const THRESHOLD = 150;

interface ScrollState {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

/** Container de scroll fake com métricas mutáveis (happy-dom não computa layout). */
function createScrollContainer(initial: ScrollState) {
  const state = { ...initial };
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', {
    get: () => state.scrollHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'clientHeight', {
    get: () => state.clientHeight,
    configurable: true,
  });
  Object.defineProperty(el, 'scrollTop', {
    get: () => state.scrollTop,
    set: (v: number) => {
      state.scrollTop = v;
    },
    configurable: true,
  });
  return {
    el,
    /** Posiciona o scroll; devolve a distância até o fim resultante. */
    setPosition: (scrollTop: number): number => {
      state.scrollTop = scrollTop;
      return state.scrollHeight - state.scrollTop - state.clientHeight;
    },
    distance: () => state.scrollHeight - state.scrollTop - state.clientHeight,
  };
}

/** Mensagens de 1..N para simular append de nova mensagem. */
function messagesUpTo(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `m${i + 1}` }));
}

describe('useChatAutoScroll', () => {
  let scrollToBottom: ReturnType<typeof vi.fn>;
  let messagesAreaRef: React.RefObject<ChatMessagesAreaRef>;

  beforeEach(() => {
    scrollToBottom = vi.fn();
    const container = document.createElement('div');
    messagesAreaRef = {
      current: {
        scrollToBottom,
        registerMessageRef: vi.fn(),
        scrollToMessage: vi.fn(() => true),
        getScrollContainer: vi.fn(() => container),
      },
    } as unknown as React.RefObject<ChatMessagesAreaRef>;
  });

  it('não autoscrolla quando o usuário NÃO está perto do fim (distância relativa > 150px)', () => {
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useChatAutoScroll({ messages, isContactTyping: false, messagesAreaRef }),
      { initialProps: { messages: messagesUpTo(1) } }
    );
    const container = createScrollContainer({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    });
    // bind + usuário rola para longe do fim (distância 800px)
    act(() => {
      result.current.bindScrollListener(container.el);
    });
    act(() => {
      container.setPosition(0);
      container.el.dispatchEvent(new Event('scroll'));
    });
    expect(container.distance()).toBeGreaterThanOrEqual(THRESHOLD);
    scrollToBottom.mockClear();

    // nova mensagem chega → NÃO deve rolar
    act(() => {
      rerender({ messages: messagesUpTo(2) });
    });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('autoscrolla quando o usuário está no fim (distância < 150px)', () => {
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useChatAutoScroll({ messages, isContactTyping: false, messagesAreaRef }),
      { initialProps: { messages: messagesUpTo(1) } }
    );
    const container = createScrollContainer({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    });
    act(() => {
      result.current.bindScrollListener(container.el);
    });
    // usuário no fim: distância 20px < 150
    act(() => {
      container.setPosition(780);
      container.el.dispatchEvent(new Event('scroll'));
    });
    expect(container.distance()).toBeLessThan(THRESHOLD);
    scrollToBottom.mockClear();

    act(() => {
      rerender({ messages: messagesUpTo(2) });
    });
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('digitação (isContactTyping) só rola quando o usuário está no fim', () => {
    const container = createScrollContainer({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    });
    const { result, rerender } = renderHook(
      ({ typing }) =>
        useChatAutoScroll({ messages: messagesUpTo(1), isContactTyping: typing, messagesAreaRef }),
      { initialProps: { typing: false } }
    );
    act(() => {
      result.current.bindScrollListener(container.el);
    });

    // CASO A: longe do fim + digitando → NÃO rola
    act(() => {
      container.setPosition(0);
      container.el.dispatchEvent(new Event('scroll'));
    });
    scrollToBottom.mockClear();
    act(() => {
      rerender({ typing: true });
    });
    expect(scrollToBottom).not.toHaveBeenCalled();

    // CASO B: no fim + digitando → rola
    act(() => {
      container.setPosition(780);
      container.el.dispatchEvent(new Event('scroll'));
    });
    scrollToBottom.mockClear();
    act(() => {
      rerender({ typing: false });
      rerender({ typing: true });
    });
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });

  it('computa a posição inicial no bind (sem depender de evento de scroll posterior)', () => {
    // Conversa aberta já em posição intermediária (ex.: deep link / histórico):
    // o primeiro scroll automático NÃO pode acontecer sem um scroll do usuário.
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useChatAutoScroll({ messages, isContactTyping: false, messagesAreaRef }),
      { initialProps: { messages: messagesUpTo(1) } }
    );
    const container = createScrollContainer({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    });
    scrollToBottom.mockClear();

    // bind SEM nenhum evento de scroll; container já está longe do fim
    act(() => {
      result.current.bindScrollListener(container.el);
    });
    expect(container.distance()).toBeGreaterThanOrEqual(THRESHOLD);

    act(() => {
      rerender({ messages: messagesUpTo(2) });
    });
    expect(scrollToBottom).not.toHaveBeenCalled();
  });

  it('scrollToBottom() imperativo re-arma o "estou no fim" (envio de mensagem)', () => {
    const container = createScrollContainer({
      scrollHeight: 1200,
      clientHeight: 400,
      scrollTop: 0,
    });
    const { result, rerender } = renderHook(
      ({ messages }) =>
        useChatAutoScroll({ messages, isContactTyping: false, messagesAreaRef }),
      { initialProps: { messages: messagesUpTo(1) } }
    );
    act(() => {
      result.current.bindScrollListener(container.el);
    });
    act(() => {
      container.setPosition(0);
      container.el.dispatchEvent(new Event('scroll'));
    });
    scrollToBottom.mockClear();

    // usuário envia: scroll imperativo re-arma o estado (a chamada imperativa
    // em si já invoca scrollToBottom; limpamos para medir só o efeito do append)
    act(() => {
      result.current.scrollToBottom();
    });
    scrollToBottom.mockClear();
    act(() => {
      rerender({ messages: messagesUpTo(3) });
    });
    expect(scrollToBottom).toHaveBeenCalledTimes(1);
  });
});
