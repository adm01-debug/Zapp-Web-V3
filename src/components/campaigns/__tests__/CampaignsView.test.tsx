import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { HTMLAttributes, ReactNode, ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderWithQC(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    })),
    functions: { invoke: vi.fn() },
    auth: {
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: {}, profile: null, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => children,
}));

// Mock the useCampaigns hook
const mockCreateCampaign = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const mockUpdateCampaign = { mutate: vi.fn() };
const mockDeleteCampaign = { mutate: vi.fn() };
const mockAddContactsToCampaign = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/useCampaigns', () => ({
  useCampaigns: () => ({
    campaigns: [],
    isLoading: false,
    createCampaign: mockCreateCampaign,
    updateCampaign: mockUpdateCampaign,
    deleteCampaign: mockDeleteCampaign,
    addContactsToCampaign: mockAddContactsToCampaign,
  }),
}));

import { CampaignsView } from '@/components/campaigns/CampaignsView';

describe('CampaignsView', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('Target Type Options', () => {
    it('renders the campaigns view', async () => {
      renderWithQC(<CampaignsView />);
      await waitFor(() => {
        expect(screen.getByText('Campanhas')).toBeInTheDocument();
      });
    });
  });
});
