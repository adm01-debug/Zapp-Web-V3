/**
 * Tests for useFallbackContact — verifies JID vs UUID routing to correct DB column.
 *
 * Critical regression guard: passing a JID into the `id` (UUID) column causes
 * PostgREST 400 "invalid input syntax for type uuid". This hook must detect
 * the format and route to the correct filter column.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useFallbackContact } from '../useFallbackContact';

// ── Mock supabase client (direct pattern — no externalProxy) ────────────────

const mockMaybeSingle = vi.fn();
const mockLimit = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockOrder = vi.fn(() => ({ limit: mockLimit }));
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle, order: mockOrder }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn((..._args: unknown[]): unknown => ({ select: mockSelect }));
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_JID = '5511999887766@s.whatsapp.net';
const MOCK_PHONE = '5511999887766';

const mockContact = { id: MOCK_UUID, phone: MOCK_PHONE, name: 'Test Contact' };

beforeEach(() => {
  vi.clearAllMocks();
  mockMaybeSingle.mockResolvedValue({ data: mockContact, error: null });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useFallbackContact — UUID input', () => {
  it('routes to id column when contactId is a UUID', async () => {
    renderHook(() => useFallbackContact(MOCK_UUID, null));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('contacts');
      expect(mockEq).toHaveBeenCalledWith('id', MOCK_UUID);
    });
  });

  it('does NOT use phone column for UUID input', async () => {
    renderHook(() => useFallbackContact(MOCK_UUID, null));

    await waitFor(() => {
      expect(mockEq).not.toHaveBeenCalledWith('phone', expect.anything());
    });
  });
});

describe('useFallbackContact — JID input', () => {
  it('routes to phone column when contactId is a JID', async () => {
    renderHook(() => useFallbackContact(MOCK_JID, null));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('contacts');
      expect(mockEq).toHaveBeenCalledWith('phone', MOCK_PHONE);
    });
  });

  it('does NOT route JID to id column (would cause PostgREST 400)', async () => {
    renderHook(() => useFallbackContact(MOCK_JID, null));

    await waitFor(() => {
      expect(mockEq).not.toHaveBeenCalledWith('id', MOCK_JID);
    });
  });

  it('falls back to evolution_contacts by remote_jid when phone lookup finds nothing', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // contacts por phone
      .mockResolvedValueOnce({ data: mockContact, error: null }); // evolution_contacts

    renderHook(() => useFallbackContact(MOCK_JID, null));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('evolution_contacts');
      expect(mockEq).toHaveBeenCalledWith('remote_jid', MOCK_JID);
      expect(mockOrder).toHaveBeenCalledWith('updated_at', expect.anything());
      expect(mockLimit).toHaveBeenCalledWith(1);
    });
  });
});

describe('useFallbackContact — bare phone input', () => {
  it('routes to phone column when contactId is a bare phone number', async () => {
    renderHook(() => useFallbackContact(MOCK_PHONE, null));

    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('phone', MOCK_PHONE);
    });
  });
});

describe('useFallbackContact — external mode synthetic fallback', () => {
  it('builds a synthetic contact when local lookups and the Evolution DB RPC fail (JID)', async () => {
    mockRpc.mockRejectedValue(new Error('rpc down'));
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // contacts por phone
      .mockResolvedValueOnce({ data: null, error: null }); // evolution_contacts

    const { result } = renderHook(() => useFallbackContact(MOCK_JID, null));

    await waitFor(() => {
      expect(result.current?.contact.id).toBe(MOCK_JID);
      expect(result.current?.contact.remote_jid).toBe(MOCK_JID);
    });
    expect(mockRpc).toHaveBeenCalledWith(
      'rpc_get_contact',
      expect.objectContaining({ p_remote_jid: MOCK_JID })
    );
  });
});

describe('useFallbackContact — early returns', () => {
  it('skips DB call when selectedConversation is already available', () => {
    const existing = {
      contact: mockContact as never,
      messages: [],
      unreadCount: 0,
      lastMessage: null,
    };
    renderHook(() => useFallbackContact(MOCK_UUID, existing));

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips DB call when contactId is null', () => {
    renderHook(() => useFallbackContact(null, null));

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns selectedConversation directly when provided', () => {
    const existing = {
      contact: mockContact as never,
      messages: [],
      unreadCount: 0,
      lastMessage: null,
    };
    const { result } = renderHook(() => useFallbackContact(MOCK_UUID, existing));

    expect(result.current).toBe(existing);
  });
});
