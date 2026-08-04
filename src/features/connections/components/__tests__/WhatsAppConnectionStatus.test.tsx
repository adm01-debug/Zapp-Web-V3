/**
 * Tests for <WhatsAppConnectionStatus /> — F6-26 / Etapa 2.
 *
 * Badge do header que resume o estado das conexões. Pequeno, mas com três
 * saídas mutuamente exclusivas (loading / nada / badge) e duas variantes de
 * badge. É também o único componente de `src/features/connections/` — cobri-lo
 * fecha o diretório.
 *
 * `useConnectionsManager` é mockado: o componente é só a projeção visual do
 * estado, e montar o manager de verdade traria Evolution API e realtime junto.
 *
 * Coberto:
 *   - loading: mostra o placeholder "WhatsApp..."
 *   - zero conexões (já carregado): não renderiza nada
 *   - todas conectadas: badge com título de "todas online" e contador n/n
 *   - com problemas: badge de alerta com o total de conexões com problema
 *   - contador reflete connected/total, não connected/connected
 *   - uma única conexão com problema usa o título no formato do componente
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WhatsAppConnection } from '../../hooks/types';

const { useConnectionsManagerMock } = vi.hoisted(() => ({
  useConnectionsManagerMock: vi.fn(),
}));

vi.mock('@/features/connections', () => ({
  useConnectionsManager: useConnectionsManagerMock,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, className }: { children?: React.ReactNode; className?: string }) => (
          <div className={className}>{children}</div>
        ),
    }
  ),
}));

import { WhatsAppConnectionStatus } from '../WhatsAppConnectionStatus';

function conn(status: string, id = crypto.randomUUID()): WhatsAppConnection {
  return {
    id,
    name: 'C',
    phone_number: '55',
    instance_id: null,
    status,
    qr_code: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
  };
}

function setState(connections: WhatsAppConnection[], loading = false) {
  useConnectionsManagerMock.mockReturnValue({ connections, loading });
}

beforeEach(() => vi.clearAllMocks());

describe('<WhatsAppConnectionStatus />', () => {
  it('em loading mostra o placeholder', () => {
    setState([], true);
    render(<WhatsAppConnectionStatus />);
    expect(screen.getByText('WhatsApp...')).toBeInTheDocument();
  });

  it('sem conexões e já carregado, não renderiza nada', () => {
    setState([]);
    const { container } = render(<WhatsAppConnectionStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('todas conectadas: badge de "todas online"', () => {
    setState([conn('connected'), conn('connected')]);
    const { container } = render(<WhatsAppConnectionStatus />);
    expect(screen.getByTitle('Todas as conexões WhatsApp online')).toBeInTheDocument();
    // O contador vem em nós de texto separados ({connected}/{total}).
    expect(container.textContent).toContain('2/2');
  });

  it('com problema: badge de alerta com a contagem de problemas', () => {
    setState([conn('connected'), conn('disconnected'), conn('connecting')]);
    render(<WhatsAppConnectionStatus />);
    expect(screen.getByTitle('2 conexão(ões) com problema')).toBeInTheDocument();
  });

  it('o contador mostra connected/total', () => {
    setState([conn('connected'), conn('disconnected'), conn('connecting')]);
    const { container } = render(<WhatsAppConnectionStatus />);
    expect(container.textContent).toContain('1/3');
  });

  it('uma única conexão com problema', () => {
    setState([conn('disconnected')]);
    render(<WhatsAppConnectionStatus />);
    expect(screen.getByTitle('1 conexão(ões) com problema')).toBeInTheDocument();
  });
});
