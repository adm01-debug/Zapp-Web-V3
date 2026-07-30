import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import type { ConversationWithMessages } from '../realtime/types';

// ── Hoisted shared mocks (stable across imports) ───────────────────────────

const mockWarn = vi.hoisted(() => vi.fn());
const mockGetLogger = vi.hoisted(() =>
  vi.fn(() => ({ warn: mockWarn, debug: vi.fn(), info: vi.fn(), error: vi.fn() }))
);

vi.mock('@/lib/logger', () => ({
  getLogger: mockGetLogger,
}));

const mockFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import { useFallbackContact } from '../useFallbackContact';

const UUID_VALID = '550e8400-e29b-41d4-a716-446655440000';
const JID_VALID = '5511999999999@s.whatsapp.net';
const PHONE_BARE = '5511999999999';

function mockSupabaseChain(result: unknown) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function mockUuidOk(data: unknown) {
  const chain = mockSupabaseChain({ data, error: null });
  mockFrom.mockReturnValue(chain);
  return chain;
}

function mockJidOk(data: unknown) {
  const chain = mockSupabaseChain({ data, error: null });
  mockFrom.mockReturnValue(chain);
  return chain;
}

function mockError(errorMsg: string) {
  const chain = mockSupabaseChain({ data: null, error: new Error(errorMsg) });
  mockFrom.mockReturnValue(chain);
  return chain;
}

/** Sample contacts row for a UUID-based lookup. */
const mockContactRow = {
  id: UUID_VALID,
  name: 'Maria Silva',
  surname: 'Silva',
  phone: '5511999999999',
  email: 'maria@example.com',
  avatar_url: 'https://example.com/avatar.jpg',
  tags: ['vip'],
  company: 'Acme Inc',
  job_title: 'Manager',
  assigned_to: 'agent-1',
  queue_id: 'queue-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T00:00:00Z',
  whatsapp_connection_id: null,
  contact_type: 'cliente',
  group_category: null,
  ai_sentiment: 'positive',
  channel_type: 'whatsapp',
  channel_connection_id: null,
};

/** Sample evolution_contacts row for a JID-based lookup. */
const mockEvoContactRow = {
  id: 'evo-uuid-123',
  remote_jid: JID_VALID,
  full_name: 'Maria Silva',
  push_name: 'Maria',
  first_name: 'Maria',
  last_name: 'Silva',
  phone_number: '5511999999999',
  profile_picture_url: 'https://example.com/evo_avatar.jpg',
  email: 'maria@evo.com',
  company: 'Acme Inc',
  role_title: 'Manager',
  assigned_to: 'agent-1',
  queue_id: 'queue-1',
  tags: ['vip'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T00:00:00Z',
  instance_name: 'wpp2',
  message_count: 42,
  nickname: 'Mary',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useFallbackContact', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── UUID branch ───────────────────────────────────────────────────────

  it('UUID: queries contacts.id and returns ConversationWithMessages', async () => {
    const chain = mockUuidOk(mockContactRow);

    const { result } = renderHook(() =>
      useFallbackContact(UUID_VALID, null as ConversationWithMessages | null)
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // Verify the correct supabase chain
    expect(mockFrom).toHaveBeenCalledWith('contacts');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('id', UUID_VALID);
    expect(chain.order).not.toHaveBeenCalled(); // order not used for UUID branch
    expect(chain.maybeSingle).toHaveBeenCalled();

    expect(result.current?.contact.id).toBe(UUID_VALID);
    expect(result.current?.contact.name).toBe('Maria Silva');
    expect(result.current?.messages).toEqual([]);
    expect(result.current?.unreadCount).toBe(0);
  });

  it('UUID: returns null when contacts query returns no data', async () => {
    mockUuidOk(null);

    const { result } = renderHook(() =>
      useFallbackContact(UUID_VALID, null as ConversationWithMessages | null)
    );

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('contacts');
    });

    // Give a tick for the effect to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBeNull();
  });

  it('UUID: logs warn on query error and returns null', async () => {
    mockError('database timeout');

    const { result } = renderHook(() =>
      useFallbackContact(UUID_VALID, null as ConversationWithMessages | null)
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(result.current).toBeNull();

    // warn must have been called (not silenced)
    expect(mockWarn).toHaveBeenCalled();
  });

  // ── JID branch ─────────────────────────────────────────────────────────

  it('JID: queries evolution_contacts.remote_jid with order by updated_at DESC', async () => {
    const chain = mockJidOk(mockEvoContactRow);

    const { result } = renderHook(() =>
      useFallbackContact(JID_VALID, null as ConversationWithMessages | null)
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // Verify the correct supabase chain
    expect(mockFrom).toHaveBeenCalledWith('evolution_contacts');
    expect(chain.select).toHaveBeenCalledWith('*');
    expect(chain.eq).toHaveBeenCalledWith('remote_jid', JID_VALID);
    expect(chain.order).toHaveBeenCalledWith('updated_at', { ascending: false });
    expect(chain.maybeSingle).toHaveBeenCalled();

    // Verify the mapping
    expect(result.current?.contact.id).toBe(JID_VALID);
    expect(result.current?.contact.name).toBe('Maria Silva');
    expect(result.current?.contact.phone).toBe('5511999999999');
    expect(result.current?.contact.avatar_url).toBe('https://example.com/evo_avatar.jpg');
    expect(result.current?.contact.contact_type).toBe('whatsapp');
    expect(result.current?.contact.channel_type).toBe('whatsapp');
  });

  it('JID: maps evolution_contacts with minimal fields', async () => {
    const minimalRow = {
      id: 'evo-uuid-456',
      remote_jid: JID_VALID,
      full_name: null,
      push_name: 'PushUser',
      phone_number: null,
    };

    mockJidOk(minimalRow);

    const { result } = renderHook(() =>
      useFallbackContact(JID_VALID, null as ConversationWithMessages | null)
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // Should fall back to push_name for name
    expect(result.current?.contact.name).toBe('PushUser');
    // Should extract phone from JID
    expect(result.current?.contact.phone).toBe('5511999999999');
    expect(result.current?.contact.avatar_url).toBeNull();
  });

  it('JID: logs warn on query error and returns null', async () => {
    mockError('relation not found');

    const { result } = renderHook(() =>
      useFallbackContact(JID_VALID, null as ConversationWithMessages | null)
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(result.current).toBeNull();

    // warn must have been called (not silenced)
    expect(mockWarn).toHaveBeenCalled();
  });

  // ── Selected conversation exists ──────────────────────────────────────

  it('returns selectedConversation when it is already provided (no DB call)', () => {
    const existing: ConversationWithMessages = {
      contact: {
        id: UUID_VALID,
        name: 'From List',
        surname: null,
        nickname: null,
        phone: '5511999999999',
        email: null,
        avatar_url: null,
        tags: null,
        company: null,
        job_title: null,
        assigned_to: null,
        queue_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-06-15T00:00:00Z',
        whatsapp_connection_id: null,
        contact_type: 'cliente',
        group_category: null,
        ai_sentiment: null,
        channel_type: 'whatsapp',
        channel_connection_id: null,
      },
      messages: [],
      unreadCount: 3,
      lastMessage: null,
    };

    const { result } = renderHook(() => useFallbackContact(UUID_VALID, existing));

    expect(result.current).toBe(existing);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns null when selectedContactId is null', () => {
    const { result } = renderHook(() =>
      useFallbackContact(null, null as ConversationWithMessages | null)
    );

    expect(result.current).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  // ── Phone fallback ────────────────────────────────────────────────────

  it('bare phone: queries contacts.phone and returns data', async () => {
    const chain = mockUuidOk(mockContactRow);

    const { result } = renderHook(() =>
      useFallbackContact(PHONE_BARE, null as ConversationWithMessages | null)
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(mockFrom).toHaveBeenCalledWith('contacts');
    expect(chain.eq).toHaveBeenCalledWith('phone', PHONE_BARE);
    expect(result.current?.contact.name).toBe('Maria Silva');
  });
});
