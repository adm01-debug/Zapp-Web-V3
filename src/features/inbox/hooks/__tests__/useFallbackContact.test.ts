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

// ── Mock supabase client ──────────────────────────────────────────────────────

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
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
});

describe('useFallbackContact — bare phone input', () => {
  it('routes to phone column when contactId is a bare phone number', async () => {
    renderHook(() => useFallbackContact(MOCK_PHONE, null));

    await waitFor(() => {
      expect(mockEq).toHaveBeenCalledWith('phone', MOCK_PHONE);
    });
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
