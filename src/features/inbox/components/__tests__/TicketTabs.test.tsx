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
const mockHasPermission = vi.hoisted(() => vi.fn());
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

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}));

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
