import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TicketTabs } from '../TicketTabs';

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

// Mock hooks
const mockHasPermission = vi.fn();
const mockUserRole = vi.fn(() => ({
  isSupervisor: false,
  isManager: false,
  isAdmin: false,
  roles: ['agent'],
  loading: false
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: {} }),
  useUserRole: () => mockUserRole(),
  usePermissions: () => ({
    hasPermission: mockHasPermission,
    loading: false
  })
}));

vi.mock('@/hooks/useQueues', () => ({
  useQueues: () => ({ queues: [] })
}));

vi.mock('@/features/inbox', () => ({
  useAllTicketStates: () => ({}),
}));

vi.mock('@/hooks/useDensity', () => ({
  useDensity: () => ({ density: 'default' })
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false
}));

// Chainable Supabase stub — proxy forwards every chained call back to itself
// and terminates as an empty result, silencing downstream repo fetches.
vi.mock('@/integrations/supabase/client', () => {
  const makeStub = () => {
    const terminal = { data: [] as unknown[], error: null };
    const proxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') return (r: (v: typeof terminal) => void) => r(terminal);
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => Promise.resolve({ data: null, error: null });
        }
        return () => proxy;
      },
    });
    return {
      from: () => proxy,
      rpc: () => Promise.resolve({ data: null, error: null }),
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    };
  };
  return { supabase: makeStub() };
});

vi.mock('@/integrations/datasource/db', () => {
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') return (r: (v: { data: unknown[]; error: null }) => void) =>
        r({ data: [], error: null });
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve({ data: null, error: null });
      }
      return () => proxy;
    },
  });
  return { dbFrom: () => proxy };
});

describe('TicketTabs - Visibilidade de Escopo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('oculta o seletor de escopo para Agente sem permissões extras', () => {
    // Por design (ver TicketTabs.tsx), o seletor Meus/Depto/Todos só aparece para
    // quem pode ver departamento ou todos os departamentos. Um agente com apenas
    // inbox.view_mine não enxerga o seletor (mostrar só "Meus" não agrega valor).
    mockHasPermission.mockImplementation((perm) => perm === 'inbox.view_mine');

    renderWithClient(
      <TicketTabs
        conversations={[]}
        mainTab="open"
        subTab="attending"
        onMainTabChange={() => {}}
        onSubTabChange={() => {}}
        showAll={false}
        onShowAllChange={() => {}}
        selectedQueueId={null}
        onQueueChange={() => {}}
      />
    );

    expect(screen.queryByText('Meus')).toBeNull();
    expect(screen.queryByText('Departamento')).toBeNull();
    expect(screen.queryByText('Todos depts.')).toBeNull();
  });

  it('renderiza "Departamento" quando tem permissão inbox.view_department', () => {
    mockHasPermission.mockImplementation((perm) => 
      perm === 'inbox.view_mine' || perm === 'inbox.view_department'
    );
    
    renderWithClient(
      <TicketTabs 
        conversations={[]}
        mainTab="open"
        subTab="attending"
        onMainTabChange={() => {}}
        onSubTabChange={() => {}}
        showAll={false}
        onShowAllChange={() => {}}
        selectedQueueId={null}
        onQueueChange={() => {}}
      />
    );

    expect(screen.getByText('Meus')).toBeDefined();
    expect(screen.getByText('Departamento')).toBeDefined();
    expect(screen.queryByText('Todos depts.')).toBeNull();
  });

  it('renderiza todos os escopos quando tem permissão inbox.view_all', () => {
    mockHasPermission.mockReturnValue(true);
    
    renderWithClient(
      <TicketTabs 
        conversations={[]}
        mainTab="open"
        subTab="attending"
        onMainTabChange={() => {}}
        onSubTabChange={() => {}}
        showAll={false}
        onShowAllChange={() => {}}
        selectedQueueId={null}
        onQueueChange={() => {}}
      />
    );

    expect(screen.getByText('Meus')).toBeDefined();
    expect(screen.getByText('Departamento')).toBeDefined();
    expect(screen.getByText('Todos depts.')).toBeDefined();
  });
});
