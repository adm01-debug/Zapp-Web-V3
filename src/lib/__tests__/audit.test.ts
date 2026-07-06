import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: Parameters<typeof mockRpc>) => mockRpc(...args),
  },
}));

vi.mock('@/lib/logger');

import { logAudit } from '@/lib/audit';

describe('audit logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ error: null });
  });

  const UUID_A = '11111111-2222-3333-4444-555555555555';

  it('calls log_audit_event RPC preserving UUID entity_id', async () => {
    await logAudit({
      action: 'login',
      entityType: 'auth',
      entityId: UUID_A,
      details: { method: 'password' },
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'login',
        p_entity_type: 'auth',
        p_entity_id: UUID_A,
      })
    );
  });

  it('handles RPC error without throwing', async () => {
    mockRpc.mockResolvedValue({ error: new Error('DB error') });

    await expect(logAudit({ action: 'login' })).resolves.not.toThrow();
  });

  it('normaliza entity_id não-UUID movendo para details.entity_id_text', async () => {
    await logAudit({
      action: 'contact_created',
      entityType: 'contact',
      entityId: 'c1',
      details: { contactName: 'John' },
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'contact_created',
        p_entity_type: 'contact',
        p_entity_id: null,
        p_details: { contactName: 'John', entity_id_text: 'c1' },
        p_user_agent: expect.any(String),
      })
    );
  });

  it('sends null for optional fields when not provided', async () => {
    await logAudit({ action: 'logout' });

    expect(mockRpc).toHaveBeenCalledWith(
      'log_audit_event',
      expect.objectContaining({
        p_action: 'logout',
        p_entity_type: null,
        p_entity_id: null,
        p_details: null,
      })
    );
  });
});
