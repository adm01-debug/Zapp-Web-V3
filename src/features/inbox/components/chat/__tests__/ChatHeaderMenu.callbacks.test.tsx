/**
 * Testes exaustivos de ChatHeaderMenu:
 * - Todos os callbacks do dropdown (onOpenTransfer, onOpenSchedule, onGenerateSummary,
 *   onToggleFailuresOnly, onCloseConversation)
 * - Label condicional "Ver Falhas (N)" / "Ocultar Falhas"
 * - Classe destructive no item de falhas quando failuresOnly=true
 * - Itens desabilitados (Adicionar tag, Marcar como resolvido, Arquivar)
 * - Resiliência a props opcionais undefined
 *
 * Estratégia: o DropdownMenu é mockado para renderizar itens diretamente no DOM
 * (sem portal / open-close real do Radix), permitindo testar só os callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatHeaderMenu } from '../ChatHeaderMenu';

// ── Mocks de UI ───────────────────────────────────────────────────────────────

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className ?? ''}
      data-testid="dropdown-item"
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    'aria-label': ariaLabel,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    'aria-label'?: string;
    onClick?: () => void;
    className?: string;
    variant?: string;
    size?: string;
  }) => (
    <button aria-label={ariaLabel} onClick={onClick} className={className ?? ''}>
      {children}
    </button>
  ),
}));

// motion.div vira uma div nativa; warnings de props desconhecidos são irrelevantes em testes
vi.mock('@/components/ui/motion', () => ({
  motion: new Proxy({}, { get: () => 'div' }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args: (string | false | null | undefined)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  MoreVertical: () => null,
  Tag: () => null,
  Archive: () => null,
  CheckCircle: () => null,
  Clock: () => null,
  ArrowRight: () => null,
  Brain: () => null,
  XCircle: () => null,
  Share2: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MenuProps {
  onOpenTransfer?: () => void;
  onOpenSchedule?: () => void;
  onGenerateSummary?: (tool?: string) => void;
  onToggleFailuresOnly?: () => void;
  failuresOnly?: boolean;
  failuresCount?: number;
  onCloseConversation?: () => void;
}

function renderMenu(overrides: MenuProps = {}) {
  const props: Required<MenuProps> & { onGenerateSummary?: (tool?: string) => void; onCloseConversation?: () => void; onToggleFailuresOnly?: () => void } = {
    onOpenTransfer: vi.fn(),
    onOpenSchedule: vi.fn(),
    onGenerateSummary: vi.fn(),
    onToggleFailuresOnly: vi.fn(),
    failuresOnly: false,
    failuresCount: 0,
    onCloseConversation: vi.fn(),
    ...overrides,
  };
  render(<ChatHeaderMenu {...props} />);
  return props;
}

/** Encontra o botão de menu que contém o texto especificado */
function getItem(text: string | RegExp) {
  return screen.getByText(text).closest('[data-testid="dropdown-item"]') as HTMLElement;
}

// ── Callbacks dos itens ───────────────────────────────────────────────────────

describe('ChatHeaderMenu — callbacks dos itens', () => {
  beforeEach(() => {
    cleanup();
  });

  it('chama onOpenTransfer ao clicar em "Transferir"', () => {
    const { onOpenTransfer } = renderMenu();
    fireEvent.click(screen.getByText('Transferir'));
    expect(onOpenTransfer).toHaveBeenCalledTimes(1);
  });

  it('chama onOpenSchedule ao clicar em "Agendar mensagem"', () => {
    const { onOpenSchedule } = renderMenu();
    fireEvent.click(screen.getByText('Agendar mensagem'));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });

  it('chama onGenerateSummary() sem argumentos ao clicar em "Gerar Resumo"', () => {
    const { onGenerateSummary } = renderMenu();
    fireEvent.click(screen.getByText('Gerar Resumo'));
    expect(onGenerateSummary).toHaveBeenCalledTimes(1);
    // called with undefined (optional arg), not with any string
    expect(onGenerateSummary).not.toHaveBeenCalledWith(expect.any(String));
  });

  it('chama onGenerateSummary("teamFiles") ao clicar em "Arquivos da Equipe"', () => {
    const { onGenerateSummary } = renderMenu();
    fireEvent.click(screen.getByText('Arquivos da Equipe'));
    expect(onGenerateSummary).toHaveBeenCalledTimes(1);
    expect(onGenerateSummary).toHaveBeenCalledWith('teamFiles');
  });

  it('chama onToggleFailuresOnly ao clicar em "Ver Falhas"', () => {
    const { onToggleFailuresOnly } = renderMenu({ failuresOnly: false });
    fireEvent.click(screen.getByText('Ver Falhas (0)'));
    expect(onToggleFailuresOnly).toHaveBeenCalledTimes(1);
  });

  it('chama onToggleFailuresOnly ao clicar em "Ocultar Falhas"', () => {
    const { onToggleFailuresOnly } = renderMenu({ failuresOnly: true });
    fireEvent.click(screen.getByText('Ocultar Falhas'));
    expect(onToggleFailuresOnly).toHaveBeenCalledTimes(1);
  });

  it('chama onCloseConversation ao clicar em "Encerrar Conversa"', () => {
    const { onCloseConversation } = renderMenu();
    fireEvent.click(screen.getByText('Encerrar Conversa'));
    expect(onCloseConversation).toHaveBeenCalledTimes(1);
  });

  it('clicar em um item não chama callbacks de outro item', () => {
    const { onOpenTransfer, onOpenSchedule, onCloseConversation } = renderMenu();
    fireEvent.click(screen.getByText('Agendar mensagem'));
    expect(onOpenTransfer).not.toHaveBeenCalled();
    expect(onCloseConversation).not.toHaveBeenCalled();
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });
});

// ── Label condicional de falhas ───────────────────────────────────────────────

describe('ChatHeaderMenu — label condicional "Ver Falhas / Ocultar Falhas"', () => {
  beforeEach(() => {
    cleanup();
  });

  it('exibe "Ver Falhas (0)" quando failuresOnly=false e failuresCount não fornecido', () => {
    renderMenu({ failuresOnly: false, failuresCount: undefined });
    expect(screen.getByText('Ver Falhas (0)')).toBeInTheDocument();
    expect(screen.queryByText('Ocultar Falhas')).not.toBeInTheDocument();
  });

  it('exibe "Ver Falhas (0)" quando failuresOnly=false e failuresCount=0', () => {
    renderMenu({ failuresOnly: false, failuresCount: 0 });
    expect(screen.getByText('Ver Falhas (0)')).toBeInTheDocument();
  });

  it('exibe "Ver Falhas (3)" quando failuresOnly=false e failuresCount=3', () => {
    renderMenu({ failuresOnly: false, failuresCount: 3 });
    expect(screen.getByText('Ver Falhas (3)')).toBeInTheDocument();
  });

  it('exibe "Ver Falhas (99)" quando failuresCount=99', () => {
    renderMenu({ failuresOnly: false, failuresCount: 99 });
    expect(screen.getByText('Ver Falhas (99)')).toBeInTheDocument();
  });

  it('exibe "Ocultar Falhas" quando failuresOnly=true', () => {
    renderMenu({ failuresOnly: true });
    expect(screen.getByText('Ocultar Falhas')).toBeInTheDocument();
    expect(screen.queryByText(/ver falhas/i)).not.toBeInTheDocument();
  });

  it('item "Ocultar Falhas" tem classe text-destructive quando failuresOnly=true', () => {
    renderMenu({ failuresOnly: true });
    const item = getItem('Ocultar Falhas');
    expect(item.className).toContain('text-destructive');
  });

  it('item "Ocultar Falhas" tem classe font-medium quando failuresOnly=true', () => {
    renderMenu({ failuresOnly: true });
    const item = getItem('Ocultar Falhas');
    expect(item.className).toContain('font-medium');
  });

  it('item "Ver Falhas" NÃO tem classe text-destructive quando failuresOnly=false', () => {
    renderMenu({ failuresOnly: false });
    const item = getItem('Ver Falhas (0)');
    expect(item.className).not.toContain('text-destructive');
  });
});

// ── Itens desabilitados ───────────────────────────────────────────────────────

describe('ChatHeaderMenu — itens desabilitados', () => {
  beforeEach(() => {
    cleanup();
  });

  it('"Adicionar tag" está desabilitado', () => {
    renderMenu();
    expect(getItem('Adicionar tag')).toBeDisabled();
  });

  it('"Marcar como resolvido" está desabilitado', () => {
    renderMenu();
    expect(getItem('Marcar como resolvido')).toBeDisabled();
  });

  it('"Arquivar" está desabilitado', () => {
    renderMenu();
    expect(getItem('Arquivar')).toBeDisabled();
  });

  it('itens ativos não estão desabilitados', () => {
    renderMenu({ failuresOnly: false });
    expect(getItem('Transferir')).not.toBeDisabled();
    expect(getItem('Agendar mensagem')).not.toBeDisabled();
    expect(getItem('Gerar Resumo')).not.toBeDisabled();
    expect(getItem('Ver Falhas (0)')).not.toBeDisabled();
    expect(getItem('Arquivos da Equipe')).not.toBeDisabled();
    expect(getItem('Encerrar Conversa')).not.toBeDisabled();
  });
});

// ── Props opcionais: resiliência a undefined ──────────────────────────────────

describe('ChatHeaderMenu — resiliência a props opcionais undefined', () => {
  beforeEach(() => {
    cleanup();
  });

  it('não lança ao clicar em "Gerar Resumo" quando onGenerateSummary é undefined', () => {
    renderMenu({ onGenerateSummary: undefined });
    expect(() => fireEvent.click(screen.getByText('Gerar Resumo'))).not.toThrow();
  });

  it('não lança ao clicar em "Arquivos da Equipe" quando onGenerateSummary é undefined', () => {
    renderMenu({ onGenerateSummary: undefined });
    expect(() => fireEvent.click(screen.getByText('Arquivos da Equipe'))).not.toThrow();
  });

  it('não lança ao clicar em "Encerrar Conversa" quando onCloseConversation é undefined', () => {
    renderMenu({ onCloseConversation: undefined });
    expect(() => fireEvent.click(screen.getByText('Encerrar Conversa'))).not.toThrow();
  });

  it('não lança ao clicar em "Ver Falhas" quando onToggleFailuresOnly é undefined', () => {
    renderMenu({ onToggleFailuresOnly: undefined });
    expect(() => fireEvent.click(screen.getByText('Ver Falhas (0)'))).not.toThrow();
  });
});

// ── Trigger (botão "Mais opções") ─────────────────────────────────────────────

describe('ChatHeaderMenu — botão trigger', () => {
  beforeEach(() => {
    cleanup();
  });

  it('renderiza um botão com aria-label="Mais opções"', () => {
    renderMenu();
    expect(screen.getByRole('button', { name: /mais opções/i })).toBeInTheDocument();
  });

  it('todos os itens do menu estão presentes no DOM', () => {
    renderMenu({ failuresOnly: false, failuresCount: 2 });
    const expectedLabels = [
      'Adicionar tag',
      'Transferir',
      'Agendar mensagem',
      'Gerar Resumo',
      'Ver Falhas (2)',
      'Marcar como resolvido',
      'Arquivar',
      'Arquivos da Equipe',
      'Encerrar Conversa',
    ];
    for (const label of expectedLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

// ── Isolamento: callbacks não se contaminam entre renders ─────────────────────

describe('ChatHeaderMenu — isolamento entre renders', () => {
  it('re-renderizar com novos callbacks usa o callback atualizado', () => {
    const onTransfer1 = vi.fn();
    const onTransfer2 = vi.fn();

    const { rerender } = render(
      <ChatHeaderMenu
        onOpenTransfer={onTransfer1}
        onOpenSchedule={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Transferir'));
    expect(onTransfer1).toHaveBeenCalledTimes(1);

    rerender(
      <ChatHeaderMenu
        onOpenTransfer={onTransfer2}
        onOpenSchedule={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Transferir'));
    expect(onTransfer2).toHaveBeenCalledTimes(1);
    // callback antigo não foi chamado de novo
    expect(onTransfer1).toHaveBeenCalledTimes(1);
  });
});
