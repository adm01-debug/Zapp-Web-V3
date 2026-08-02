/**
 * Tests for <ConnectionsStats /> — F6-26 / Etapa 2.
 *
 * O achado registrava "0 tests em componentes" no módulo connections. Este é o
 * primeiro. ConnectionsStats foi escolhido porque concentra a regra de contagem
 * que a Ação do F6-26 pede exercitar em 0 / 1 / N (empty state, singular,
 * plural) sem arrastar diálogos, portais e estado global para o teste.
 *
 * `framer-motion` é substituído por um passthrough: a animação não é contrato,
 * e o mock evita timers de layout no happy-dom.
 *
 * Coberto:
 *   - renderiza exatamente 3 cartões (Total, Online, Ações necessárias)
 *   - 0 conexões: total 0, texto no plural ("0 instâncias configuradas")
 *   - 0 conexões: Online mostra "Nenhuma ativa"
 *   - 0 conexões: Ações necessárias mostra "Tudo funcionando ✔"
 *   - 1 conexão: texto no SINGULAR ("1 instância configurada")
 *   - N conexões: texto volta ao plural
 *   - conta como Online apenas status === 'connected'
 *   - status 'connecting'/'disconnected'/'qr' contam como ação necessária
 *   - total = online + ações necessárias, sem sobreposição
 *   - cor de alerta só aparece quando há pendência
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { WhatsAppConnection } from '@/features/connections';
import { ConnectionsStats } from '../ConnectionsStats';

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => {
          const passthrough = { ...rest } as Record<string, unknown>;
          delete passthrough.initial;
          delete passthrough.animate;
          delete passthrough.transition;
          return <div {...passthrough}>{children}</div>;
        },
    }
  ),
}));

function makeConnection(over: Partial<WhatsAppConnection> = {}): WhatsAppConnection {
  return {
    id: crypto.randomUUID(),
    name: 'Conexão',
    phone_number: '5511999999999',
    instance_name: 'inst',
    instance_id: null,
    status: 'connected',
    qr_code: null,
    is_default: false,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

/** Devolve o cartão cujo rótulo bate, para consultar valor e subtítulo juntos. */
function card(label: string) {
  return screen.getByText(label).closest('div')!.parentElement!;
}

describe('<ConnectionsStats /> — estrutura', () => {
  it('renderiza os três cartões', () => {
    render(<ConnectionsStats connections={[]} />);
    expect(screen.getByText('Total de Conexões')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Ações necessárias')).toBeInTheDocument();
  });
});

describe('<ConnectionsStats /> — zero conexões (empty state)', () => {
  it('total é 0 e o texto fica no plural', () => {
    render(<ConnectionsStats connections={[]} />);
    expect(within(card('Total de Conexões')).getByText('0')).toBeInTheDocument();
    expect(screen.getByText('0 instâncias configuradas')).toBeInTheDocument();
  });

  it('Online informa que não há nenhuma ativa', () => {
    render(<ConnectionsStats connections={[]} />);
    expect(screen.getByText('Nenhuma ativa')).toBeInTheDocument();
  });

  it('Ações necessárias informa que está tudo funcionando', () => {
    render(<ConnectionsStats connections={[]} />);
    expect(screen.getByText('Tudo funcionando ✔')).toBeInTheDocument();
  });
});

describe('<ConnectionsStats /> — uma conexão (singular)', () => {
  it('usa o SINGULAR no subtítulo do total', () => {
    render(<ConnectionsStats connections={[makeConnection()]} />);
    expect(screen.getByText('1 instância configurada')).toBeInTheDocument();
  });

  it('conexão conectada aparece em Online com "Recebendo mensagens"', () => {
    render(<ConnectionsStats connections={[makeConnection({ status: 'connected' })]} />);
    expect(within(card('Online')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Recebendo mensagens')).toBeInTheDocument();
  });

  it('conexão desconectada cai em Ações necessárias com "Precisam reconectar"', () => {
    render(<ConnectionsStats connections={[makeConnection({ status: 'disconnected' })]} />);
    expect(within(card('Ações necessárias')).getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Precisam reconectar')).toBeInTheDocument();
  });
});

describe('<ConnectionsStats /> — N conexões (plural)', () => {
  it('volta ao plural a partir de 2', () => {
    render(<ConnectionsStats connections={[makeConnection(), makeConnection()]} />);
    expect(screen.getByText('2 instâncias configuradas')).toBeInTheDocument();
  });

  it('conta como Online apenas status "connected"', () => {
    render(
      <ConnectionsStats
        connections={[
          makeConnection({ status: 'connected' }),
          makeConnection({ status: 'connected' }),
          makeConnection({ status: 'connecting' }),
          makeConnection({ status: 'disconnected' }),
          makeConnection({ status: 'qr' }),
        ]}
      />
    );
    expect(within(card('Online')).getByText('2')).toBeInTheDocument();
    expect(within(card('Ações necessárias')).getByText('3')).toBeInTheDocument();
  });

  it('total é sempre online + ações necessárias', () => {
    const connections = [
      makeConnection({ status: 'connected' }),
      makeConnection({ status: 'disconnected' }),
      makeConnection({ status: 'connecting' }),
    ];
    render(<ConnectionsStats connections={connections} />);
    expect(within(card('Total de Conexões')).getByText('3')).toBeInTheDocument();
  });
});

describe('<ConnectionsStats /> — sinalização visual de pendência', () => {
  it('usa a cor de alerta quando há conexão precisando de ação', () => {
    render(<ConnectionsStats connections={[makeConnection({ status: 'disconnected' })]} />);
    const value = within(card('Ações necessárias')).getByText('1');
    expect(value.className).toContain('text-destructive-foreground');
  });

  it('não usa a cor de alerta quando está tudo conectado', () => {
    render(<ConnectionsStats connections={[makeConnection({ status: 'connected' })]} />);
    const value = within(card('Ações necessárias')).getByText('0');
    expect(value.className).not.toContain('text-destructive-foreground');
  });
});
