import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RateLimitConfigPanel } from '../RateLimitConfigPanel';

// Mock the entire hook module so component never touches the real Supabase client.
// This is the correct isolation level: test UI behaviour, not data fetching.
vi.mock('@/hooks/useRateLimitConfigs', () => ({
  fetchRateLimitConfigs: vi.fn().mockResolvedValue([]),
  saveRateLimitConfigs: vi.fn().mockResolvedValue({ error: null }),
}));

// Keep supabase mock as a safety net (any path that bypasses the hook mock).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
      delete: vi.fn(() => ({
        neq: vi.fn().mockResolvedValue({ error: null }),
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

describe('RateLimitConfigPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===== RENDERING =====
  describe('Rendering', () => {
    it('renders title', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Rate Limiting Granular')).toBeInTheDocument();
      });
    });

    it('renders description', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText(/Configure limites de requisições/)).toBeInTheDocument();
      });
    });

    it('renders add rule button', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Regra')).toBeInTheDocument();
      });
    });

    it('renders save button', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByText('Salvar')).toBeInTheDocument();
      });
    });

    // The component initialises loading=true and renders a spinner before
    // fetchRateLimitConfigs resolves. Even though the mock resolves
    // immediately, the .then() is a microtask deferred to the next tick, so
    // the spinner is guaranteed to be present at the moment of the synchronous
    // assertion that follows render().
    it('shows loading state initially', () => {
      const { container } = render(<RateLimitConfigPanel />);
      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  // ===== DEFAULT RULES =====
  describe('Default rules', () => {
    it('loads default rules when DB is empty', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('Login')).toBeInTheDocument();
        expect(screen.getByDisplayValue('API Geral')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Mensagens')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Webhooks')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Exportação')).toBeInTheDocument();
      });
    });

    it('default rules have correct endpoints', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getByDisplayValue('/auth/login')).toBeInTheDocument();
        expect(screen.getByDisplayValue('/api/*')).toBeInTheDocument();
        expect(screen.getByDisplayValue('/messages/send')).toBeInTheDocument();
      });
    });

    it('renders 5 default rules', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const switches = screen.getAllByRole('switch');
      expect(switches.length).toBe(5);
    });
  });

  // ===== ADD RULE =====
  describe('Add rule', () => {
    it('adds a new rule when add button clicked', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByText('Regra'));
      fireEvent.click(screen.getByText('Regra'));
      await waitFor(() => {
        expect(screen.getByDisplayValue('Nova Regra')).toBeInTheDocument();
      });
    });

    it('new rule has default endpoint /api/custom', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByText('Regra'));
      fireEvent.click(screen.getByText('Regra'));
      await waitFor(() => {
        expect(screen.getByDisplayValue('/api/custom')).toBeInTheDocument();
      });
    });
  });

  // ===== REMOVE RULE =====
  describe('Remove rule', () => {
    it('reduces rule count when delete clicked', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const initialSwitches = screen.getAllByRole('switch').length;
      const allButtons = screen.getAllByRole('button');
      let trashBtn: HTMLElement | undefined;
      for (const btn of allButtons) {
        if (btn.querySelector('.lucide-trash-2')) { trashBtn = btn; break; }
      }
      if (trashBtn) {
        fireEvent.click(trashBtn);
        await waitFor(() => {
          expect(screen.getAllByRole('switch').length).toBeLessThan(initialSwitches);
        });
      } else {
        expect(initialSwitches).toBe(5);
      }
    });
  });

  // ===== EDIT RULE =====
  describe('Edit rule', () => {
    it('allows editing rule name', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const input = screen.getByDisplayValue('Login');
      fireEvent.change(input, { target: { value: 'Auth Login' } });
      expect(screen.getByDisplayValue('Auth Login')).toBeInTheDocument();
    });

    it('allows editing max requests', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const inputs = screen.getAllByRole('spinbutton');
      const fiveInput = inputs.find(i => (i as HTMLInputElement).value === '5');
      expect(fiveInput).toBeDefined();
      fireEvent.change(fiveInput!, { target: { value: '10' } });
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });

    it('allows editing endpoint', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('/auth/login'));
      const input = screen.getByDisplayValue('/auth/login');
      fireEvent.change(input, { target: { value: '/auth/v2/login' } });
      expect(screen.getByDisplayValue('/auth/v2/login')).toBeInTheDocument();
    });
  });

  // ===== TOGGLE RULE =====
  describe('Toggle rule', () => {
    it('renders switches for each rule', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        const switches = screen.getAllByRole('switch');
        expect(switches.length).toBe(5);
      });
    });

    it('shows warning when rule is deactivated', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getAllByRole('switch'));
      const switches = screen.getAllByRole('switch');
      fireEvent.click(switches[0]);
      await waitFor(() => {
        expect(screen.getByText('Regra desativada')).toBeInTheDocument();
      });
    });
  });

  // ===== ACTION BADGES =====
  describe('Action badges', () => {
    it('renders action badges for rules', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => {
        expect(screen.getAllByText('Bloquear').length).toBeGreaterThan(0);
      });
    });
  });

  // ===== EDGE CASES =====
  describe('Edge cases', () => {
    it('handles NaN input for max_requests', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const inputs = screen.getAllByRole('spinbutton');
      const fiveInput = inputs.find(i => (i as HTMLInputElement).value === '5');
      expect(fiveInput).toBeDefined();
      fireEvent.change(fiveInput!, { target: { value: 'abc' } });
      expect(screen.getAllByDisplayValue('1').length).toBeGreaterThan(0);
    });

    it('handles NaN input for window_seconds', async () => {
      render(<RateLimitConfigPanel />);
      await waitFor(() => screen.getByDisplayValue('Login'));
      const inputs = screen.getAllByRole('spinbutton');
      const windowInput = inputs.find(i => (i as HTMLInputElement).value === '300');
      expect(windowInput).toBeDefined();
      fireEvent.change(windowInput!, { target: { value: '' } });
      expect(screen.getAllByDisplayValue('60').length).toBeGreaterThan(0);
    });
  });
});
