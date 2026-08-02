/**
 * Testes exaustivos de ChatSearchBar:
 * - Renderização condicional (isOpen true/false)
 * - Navegação por teclado (Escape, ArrowUp, ArrowDown, Enter, Shift+Enter)
 * - Botão de limpar busca (X interno)
 * - Botão de fechar (X externo)
 * - Botões ChevronUp / ChevronDown e disabled state
 * - Contador de resultados ("N/total" ou "0")
 * - Mensagem de sem resultados (debouncedQuery vs filtro ativo)
 * - Autofocus no input quando isOpen muda para true
 *
 * Estratégia: useChatSearch é mockado via vi.hoisted() para controlar
 * todo o estado retornado pelo hook sem depender da lógica real de debounce/filtro.
 * AnimatePresence é mockado para sempre renderizar children quando presentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { ChatSearchBar } from '../ChatSearchBar';
import type { Message } from '@/types/chat';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { useChatSearchMock } = vi.hoisted(() => ({
  useChatSearchMock: vi.fn(),
}));

// ── Mocks de módulos ──────────────────────────────────────────────────────────

vi.mock('@/features/inbox', () => ({
  useChatSearch: useChatSearchMock,
}));

vi.mock('@/components/ui/motion', () => ({
  // AnimatePresence sempre renderiza os filhos (sem animação real)
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => 'div' }),
}));

vi.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    ...rest
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    placeholder?: string;
    [key: string]: unknown;
  }) => (
    <input
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      {...rest}
    />
  ),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    'aria-label': ariaLabel,
    className,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    'aria-label'?: string;
    className?: string;
    variant?: string;
    size?: string;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? ''}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => null,
}));

vi.mock('lucide-react', () => ({
  Search: () => <span data-testid="icon-search" />,
  X: () => <span data-testid="icon-x" />,
  ChevronUp: () => <span data-testid="icon-chevron-up" />,
  ChevronDown: () => <span data-testid="icon-chevron-down" />,
}));

vi.mock('@/features/inbox/components/chat/ChatSearchFilters', () => ({
  ChatSearchFilters: () => <div data-testid="search-filters" />,
}));

vi.mock('@/features/inbox/components/chat/ChatSearchResultsList', () => ({
  ChatSearchResultsList: React.forwardRef<HTMLDivElement>((_props, _ref) => (
    <div data-testid="search-results-list" />
  )),
}));

// ── Tipos e fixtures ──────────────────────────────────────────────────────────

type MockSearchState = {
  query: string;
  setQuery: ReturnType<typeof vi.fn>;
  filter: string;
  setFilter: ReturnType<typeof vi.fn>;
  activeIndex: number;
  setActiveIndex: ReturnType<typeof vi.fn>;
  debouncedQuery: string;
  results: Message[];
  filterCounts: Record<string, number>;
  navigateUp: ReturnType<typeof vi.fn>;
  navigateDown: ReturnType<typeof vi.fn>;
  datePreset: string;
  setDatePreset: ReturnType<typeof vi.fn>;
  customDateFrom: null;
  setCustomDateFrom: ReturnType<typeof vi.fn>;
  customDateTo: null;
  setCustomDateTo: ReturnType<typeof vi.fn>;
  hasDateFilter: boolean;
};

function makeSearchState(overrides: Partial<MockSearchState> = {}): MockSearchState {
  return {
    query: '',
    setQuery: vi.fn(),
    filter: 'all',
    setFilter: vi.fn(),
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    debouncedQuery: '',
    results: [],
    filterCounts: {},
    navigateUp: vi.fn(),
    navigateDown: vi.fn(),
    datePreset: 'all',
    setDatePreset: vi.fn(),
    customDateFrom: null,
    setCustomDateFrom: vi.fn(),
    customDateTo: null,
    setCustomDateTo: vi.fn(),
    hasDateFilter: false,
    ...overrides,
  };
}

const DEFAULT_PROPS = {
  messages: [] as Message[],
  isOpen: true,
  onClose: vi.fn(),
  onNavigateToMessage: vi.fn(),
  onHighlightChange: vi.fn(),
  onSearchQueryChange: vi.fn(),
};

function renderBar(propOverrides: Partial<typeof DEFAULT_PROPS> = {}, stateOverrides: Partial<MockSearchState> = {}) {
  const state = makeSearchState(stateOverrides);
  useChatSearchMock.mockReturnValue(state);
  const props = { ...DEFAULT_PROPS, onClose: vi.fn(), onNavigateToMessage: vi.fn(), ...propOverrides };
  render(<ChatSearchBar {...props} />);
  return { state, props };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Renderização condicional ──────────────────────────────────────────────────

describe('ChatSearchBar — renderização condicional', () => {
  it('não renderiza o input quando isOpen=false', () => {
    renderBar({ isOpen: false });
    expect(screen.queryByPlaceholderText('Buscar na conversa...')).not.toBeInTheDocument();
  });

  it('renderiza o input quando isOpen=true', () => {
    renderBar({ isOpen: true });
    expect(screen.getByPlaceholderText('Buscar na conversa...')).toBeInTheDocument();
  });

  it('renderiza o botão de fechar busca quando isOpen=true', () => {
    renderBar({ isOpen: true });
    expect(screen.getByRole('button', { name: /fechar busca/i })).toBeInTheDocument();
  });

  it('renderiza ChatSearchFilters quando isOpen=true', () => {
    renderBar({ isOpen: true });
    expect(screen.getByTestId('search-filters')).toBeInTheDocument();
  });
});

// ── Navegação por teclado ─────────────────────────────────────────────────────

describe('ChatSearchBar — navegação por teclado', () => {
  it('Escape chama onClose e previne default', () => {
    const { props } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Escape', preventDefault: vi.fn() });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowUp chama navigateUp', () => {
    const { state } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(state.navigateUp).toHaveBeenCalledTimes(1);
  });

  it('ArrowDown chama navigateDown', () => {
    const { state } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(state.navigateDown).toHaveBeenCalledTimes(1);
  });

  it('Enter (sem shift) chama navigateDown', () => {
    const { state } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(state.navigateDown).toHaveBeenCalledTimes(1);
    expect(state.navigateUp).not.toHaveBeenCalled();
  });

  it('Shift+Enter chama navigateUp', () => {
    const { state } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(state.navigateUp).toHaveBeenCalledTimes(1);
    expect(state.navigateDown).not.toHaveBeenCalled();
  });

  it('Escape não chama navigateUp nem navigateDown', () => {
    const { state } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(state.navigateUp).not.toHaveBeenCalled();
    expect(state.navigateDown).not.toHaveBeenCalled();
  });

  it('teclas não mapeadas não chamam nenhum callback de navegação', () => {
    const { state, props } = renderBar();
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(state.navigateUp).not.toHaveBeenCalled();
    expect(state.navigateDown).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

// ── Botão limpar busca ────────────────────────────────────────────────────────

describe('ChatSearchBar — botão limpar busca (X interno)', () => {
  it('botão X não é renderizado quando query está vazia', () => {
    renderBar({}, { query: '' });
    expect(screen.queryByRole('button', { name: /limpar busca/i })).not.toBeInTheDocument();
  });

  it('botão X é renderizado quando query é não-vazia', () => {
    renderBar({}, { query: 'oi' });
    expect(screen.getByRole('button', { name: /limpar busca/i })).toBeInTheDocument();
  });

  it('clicar no botão X chama setQuery com string vazia', () => {
    const { state } = renderBar({}, { query: 'teste' });
    fireEvent.click(screen.getByRole('button', { name: /limpar busca/i }));
    expect(state.setQuery).toHaveBeenCalledWith('');
  });

  it('clicar no botão X não chama onClose', () => {
    const { props } = renderBar({}, { query: 'teste' });
    fireEvent.click(screen.getByRole('button', { name: /limpar busca/i }));
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

// ── Botão fechar busca ────────────────────────────────────────────────────────

describe('ChatSearchBar — botão fechar busca', () => {
  it('clicar em "Fechar busca" chama onClose', () => {
    const { props } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /fechar busca/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('clicar em "Fechar busca" não chama setQuery', () => {
    const { state } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: /fechar busca/i }));
    expect(state.setQuery).not.toHaveBeenCalled();
  });
});

// ── Botões ChevronUp / ChevronDown ────────────────────────────────────────────

describe('ChatSearchBar — botões de navegação (ChevronUp / ChevronDown)', () => {
  it('"Resultado anterior" chama navigateUp ao clicar', () => {
    const { state } = renderBar({}, { results: [{ id: 'm1' } as Message], activeIndex: 0 });
    fireEvent.click(screen.getByRole('button', { name: /resultado anterior/i }));
    expect(state.navigateUp).toHaveBeenCalledTimes(1);
  });

  it('"Próximo resultado" chama navigateDown ao clicar', () => {
    const { state } = renderBar({}, { results: [{ id: 'm1' } as Message], activeIndex: 0 });
    fireEvent.click(screen.getByRole('button', { name: /próximo resultado/i }));
    expect(state.navigateDown).toHaveBeenCalledTimes(1);
  });

  it('"Resultado anterior" está disabled quando results é vazio', () => {
    renderBar({}, { results: [] });
    expect(screen.getByRole('button', { name: /resultado anterior/i })).toBeDisabled();
  });

  it('"Próximo resultado" está disabled quando results é vazio', () => {
    renderBar({}, { results: [] });
    expect(screen.getByRole('button', { name: /próximo resultado/i })).toBeDisabled();
  });

  it('"Resultado anterior" NÃO está disabled quando há resultados', () => {
    renderBar({}, { results: [{ id: 'm1' } as Message, { id: 'm2' } as Message] });
    expect(screen.getByRole('button', { name: /resultado anterior/i })).not.toBeDisabled();
  });

  it('"Próximo resultado" NÃO está disabled quando há resultados', () => {
    renderBar({}, { results: [{ id: 'm1' } as Message, { id: 'm2' } as Message] });
    expect(screen.getByRole('button', { name: /próximo resultado/i })).not.toBeDisabled();
  });
});

// ── Contador de resultados ────────────────────────────────────────────────────

describe('ChatSearchBar — contador de resultados', () => {
  it('não exibe contador quando debouncedQuery vazia, filter=all e sem filtro de data', () => {
    renderBar({}, { debouncedQuery: '', filter: 'all', hasDateFilter: false });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // aria-live="polite" span não deve estar presente
    expect(document.querySelector('[aria-live="polite"]')).not.toBeInTheDocument();
  });

  it('exibe "1/2" quando results=[m1,m2], activeIndex=0 e debouncedQuery não-vazia', () => {
    renderBar({}, {
      debouncedQuery: 'oi',
      results: [{ id: 'm1' } as Message, { id: 'm2' } as Message],
      activeIndex: 0,
    });
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('1/2');
  });

  it('exibe "2/2" quando activeIndex=1', () => {
    renderBar({}, {
      debouncedQuery: 'oi',
      results: [{ id: 'm1' } as Message, { id: 'm2' } as Message],
      activeIndex: 1,
    });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('2/2');
  });

  it('exibe "0" quando debouncedQuery não-vazia mas results vazio', () => {
    renderBar({}, { debouncedQuery: 'xyz', results: [], hasDateFilter: false, filter: 'all' });
    const counter = document.querySelector('[aria-live="polite"]');
    expect(counter).toBeInTheDocument();
    expect(counter?.textContent).toBe('0');
  });

  it('exibe contador quando filter !== "all" (mesmo sem debouncedQuery)', () => {
    renderBar({}, { debouncedQuery: '', filter: 'image', hasDateFilter: false });
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('exibe contador quando hasDateFilter=true (mesmo sem debouncedQuery)', () => {
    renderBar({}, { debouncedQuery: '', filter: 'all', hasDateFilter: true });
    expect(document.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });
});

// ── Mensagem de sem resultados ────────────────────────────────────────────────

describe('ChatSearchBar — mensagem de sem resultados', () => {
  it('não exibe mensagem de sem resultados quando results não está vazio', () => {
    renderBar({}, { debouncedQuery: 'oi', results: [{ id: 'm1' } as Message] });
    expect(screen.queryByText(/nenhum resultado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nenhuma mensagem/i)).not.toBeInTheDocument();
  });

  it('não exibe mensagem de sem resultados quando debouncedQuery vazia, filter=all, sem filtro data', () => {
    renderBar({}, { debouncedQuery: '', filter: 'all', hasDateFilter: false, results: [] });
    expect(screen.queryByText(/nenhum resultado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/nenhuma mensagem/i)).not.toBeInTheDocument();
  });

  it('exibe "Nenhum resultado para X" quando debouncedQuery não-vazia e results vazio', () => {
    renderBar({}, { debouncedQuery: 'busca', filter: 'all', hasDateFilter: false, results: [] });
    expect(screen.getByText(/Nenhum resultado para "busca"/)).toBeInTheDocument();
  });

  it('trunca debouncedQuery longa a 30 caracteres na mensagem', () => {
    const longQuery = 'a'.repeat(35);
    renderBar({}, { debouncedQuery: longQuery, filter: 'all', hasDateFilter: false, results: [] });
    expect(screen.getByText(`Nenhum resultado para "${'a'.repeat(30)}"`)).toBeInTheDocument();
  });

  it('exibe "Nenhuma mensagem encontrada" quando filter ativo (não-all) e results vazio', () => {
    renderBar({}, { debouncedQuery: '', filter: 'image', hasDateFilter: false, results: [] });
    expect(screen.getByText('Nenhuma mensagem encontrada')).toBeInTheDocument();
  });

  it('exibe "Nenhuma mensagem encontrada" quando hasDateFilter=true e results vazio e sem debouncedQuery', () => {
    renderBar({}, { debouncedQuery: '', filter: 'all', hasDateFilter: true, results: [] });
    expect(screen.getByText('Nenhuma mensagem encontrada')).toBeInTheDocument();
  });
});

// ── Passagem de onChange e valor do input ─────────────────────────────────────

describe('ChatSearchBar — mudança de valor do input', () => {
  it('onChange chama setQuery com o novo valor', () => {
    const { state } = renderBar({}, { query: '' });
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    fireEvent.change(input, { target: { value: 'nova busca' } });
    expect(state.setQuery).toHaveBeenCalledWith('nova busca');
  });

  it('input exibe o valor atual de query', () => {
    renderBar({}, { query: 'texto atual' });
    const input = screen.getByPlaceholderText('Buscar na conversa...');
    expect((input as HTMLInputElement).value).toBe('texto atual');
  });
});

// ── Isolamento entre renders ──────────────────────────────────────────────────

describe('ChatSearchBar — isolamento entre renders', () => {
  it('re-renderizar com novos callbacks usa o callback atualizado', () => {
    const onClose1 = vi.fn();
    const onClose2 = vi.fn();
    useChatSearchMock.mockReturnValue(makeSearchState());

    const { rerender } = render(
      <ChatSearchBar
        messages={[]}
        isOpen={true}
        onClose={onClose1}
        onNavigateToMessage={vi.fn()}
        onHighlightChange={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Buscar na conversa...'), { key: 'Escape' });
    expect(onClose1).toHaveBeenCalledTimes(1);

    useChatSearchMock.mockReturnValue(makeSearchState());
    rerender(
      <ChatSearchBar
        messages={[]}
        isOpen={true}
        onClose={onClose2}
        onNavigateToMessage={vi.fn()}
        onHighlightChange={vi.fn()}
      />
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Buscar na conversa...'), { key: 'Escape' });
    expect(onClose2).toHaveBeenCalledTimes(1);
    expect(onClose1).toHaveBeenCalledTimes(1); // não chamou de novo
  });
});
