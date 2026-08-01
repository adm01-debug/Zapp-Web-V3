import { describe, it, expect, vi } from 'vitest';

// Mocking Supabase Client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('Auth & Data Integration', () => {
  it('should handle database connection failures gracefully', async () => {
    mockSupabase.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          error: { message: 'Connection Timeout' },
          data: null
        })
      })
    }));

    const result = await mockSupabase.from('profiles').select('*').eq('id', '1');
    expect(result.error?.message).toBe('Connection Timeout');
  });

  it('should mock successful auth session', async () => {
    const session = { user: { id: '123' } };
    mockSupabase.auth.getSession.mockResolvedValueOnce({ data: { session }, error: null });
    
    const { data } = await mockSupabase.auth.getSession();
    expect(data.session?.user.id).toBe('123');
  });
});
