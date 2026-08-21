/**
 * Bloco 6 (etapas 57/65 do plano ChatPanel) — gate de regressão do isolamento
 * do keystroke, substituindo o profiling manual por asserção de contagem de
 * renders: escrever no store NÃO re-renderiza o dono (painel), apenas o
 * assinante (área de input).
 */
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  createInputValueStore,
  useInputValue,
  type InputValueStore,
} from '../hooks/useInputValueStore';

describe('useInputValueStore — isolamento do keystroke', () => {
  it('set() re-renderiza APENAS o assinante; o dono do store fica em 0 renders extras', () => {
    const store = createInputValueStore('');
    const renders = { panel: 0, input: 0 };

    function FakeInputArea({ s }: { s: InputValueStore }) {
      renders.input++;
      const value = useInputValue(s);
      return <span data-testid="valor">{value}</span>;
    }

    function FakePanel() {
      renders.panel++;
      // O painel usa o store por referência (setInputValue etc.) mas NÃO assina.
      return <FakeInputArea s={store} />;
    }

    render(<FakePanel />);
    expect(renders.panel).toBe(1);
    const inputRendersAposMount = renders.input;

    act(() => {
      store.set('o');
      store.set('oi');
      store.set('oi t');
      store.set('oi tudo bem');
    });

    // Gate da etapa 65: teclas re-renderizam só o assinante.
    expect(renders.panel).toBe(1);
    expect(renders.input).toBeGreaterThan(inputRendersAposMount);
    expect(screen.getByTestId('valor').textContent).toBe('oi tudo bem');
  });

  it('set() com valor idêntico não notifica assinantes (dedupe)', () => {
    const store = createInputValueStore('fixo');
    let notificacoes = 0;
    const unsubscribe = store.subscribe(() => {
      notificacoes++;
    });

    store.set('fixo');
    store.set('fixo');
    expect(notificacoes).toBe(0);

    store.set('mudou');
    expect(notificacoes).toBe(1);
    unsubscribe();
    store.set('depois do unsubscribe');
    expect(notificacoes).toBe(1);
  });

  it('get() reflete o último valor mesmo sem assinantes (leitura via ref no handleSend)', () => {
    const store = createInputValueStore('inicial');
    store.set('texto digitado');
    expect(store.get()).toBe('texto digitado');
  });
});
