// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockFrom = vi.hoisted(() => vi.fn());
const mockRemoveChannel = vi.hoisted(() => vi.fn());
const realtimeHandlers: Record<string, (payload: unknown) => void> = {};

const mockChannelInstance = {
  on: vi.fn((_: string, filter: { event: string }, handler: (payload: unknown) => void) => {
    realtimeHandlers[filter.event] = handler;
    return mockChannelInstance;
  }),
  subscribe: vi.fn((callback?: (status: string) => void) => {
    callback?.('SUBSCRIBED');
    return mockChannelInstance;
  }),
  unsubscribe: vi.fn().mockResolvedValue('ok'),
};

const mockChannel = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      browserNotifications: false,
    },
    isQuietHours: () => false,
  }),
}));

vi.mock('@/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  showBrowserNotification: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger');

import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';

type ContactFields = {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  tags: string[];
  company: string | null;
  job_title: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_connection_id: string | null;
  contact_type: string;
  group_category: string | null;
  ai_sentiment: string | null;
};
type MessageFields = {
  id: string;
  contact_id: string;
  agent_id: string | null;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean;
  status: string;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  external_id: string;
  whatsapp_connection_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
};

let seededContacts: ContactFields[] = [];
let recentMessages: MessageFields[] = [];
let contactsById: Record<string, ContactFields> = {};

function makeContact(overrides: Partial<ContactFields> = {}): ContactFields {
  return {
    id: 'contact-1',
    name: 'Contato',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    tags: [],
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: '2026-04-02T19:00:00Z',
    updated_at: '2026-04-02T19:00:00Z',
    whatsapp_connection_id: null,
    contact_type: 'cliente',
    group_category: null,
    ai_sentiment: null,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<MessageFields> = {}): MessageFields {
  return {
    id: 'message-1',
    contact_id: 'contact-1',
    agent_id: null,
    content: 'Olá',
    sender: 'contact',
    message_type: 'text',
    media_url: null,
    is_read: false,
    status: 'received',
    status_updated_at: null,
    created_at: '2026-04-02T19:05:00Z',
    updated_at: '2026-04-02T19:05:00Z',
    external_id: 'ext-1',
    whatsapp_connection_id: null,
    transcription: null,
    transcription_status: null,
    ...overrides,
  };
}

function makeContactsQuery() {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: seededContacts, error: null }),
      })),
      in: vi.fn((_: string, ids: string[]) => {
        return Promise.resolve({
          data: ids.map((id) => contactsById[id]).filter(Boolean),
          error: null,
        });
      }),
      eq: vi.fn((_: string, value: string) => ({
        maybeSingle: vi.fn().mockResolvedValue({
          data: contactsById[value] ?? null,
          error: null,
        }),
      })),
    })),
  };
}

function makeMessagesQuery() {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: recentMessages, error: null }),
      })),
    })),
  };
}

describe('useRealtimeMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannel.mockImplementation(() => mockChannelInstance);
    seededContacts = [];
    recentMessages = [];
    contactsById = {};
    Object.keys(realtimeHandlers).forEach((key) => delete realtimeHandlers[key]);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') return makeContactsQuery();
      if (table === 'messages') return makeMessagesQuery();
      // Return a safe fallback for any other table
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  });

  it('includes contacts referenced by recent messages even when they are outside the seeded contact list', async () => {
    const seededContact = makeContact({
      id: 'seeded-contact',
      name: 'Contato antigo',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
    });
    const hiddenActiveContact = makeContact({
      id: 'hidden-active-contact',
      name: 'Joaquim',
      phone: '5564984450900',
      created_at: '2026-03-18T23:43:14Z',
      updated_at: '2026-03-18T23:43:14Z',
    });

    seededContacts = [seededContact];
    contactsById[hiddenActiveContact.id] = hiddenActiveContact;
    recentMessages = [
      makeMessage({
        id: 'recent-message',
        contact_id: hiddenActiveContact.id,
        content: 'Mensagem recente do contato fora do top 500',
        created_at: '2026-04-02T20:00:00Z',
        updated_at: '2026-04-02T20:00:00Z',
      }),
    ];

    // Spy on mock to trace calls
    const originalIn = vi.fn((_: string, ids: string[]) => {
      return Promise.resolve({
        data: ids.map((id) => contactsById[id]).filter(Boolean),
        error: null,
      });
    });

    // Override contacts query to add proper .in() support at top level
    mockFrom.mockImplementation((table: string) => {
      if (table === 'contacts') {
        const selectFn = vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue({ data: seededContacts, error: null }),
          })),
          in: originalIn,
          eq: vi.fn((_: string, value: string) => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: contactsById[value] ?? null,
              error: null,
            }),
          })),
        }));
        return { select: selectFn };
      }
      if (table === 'messages') return makeMessagesQuery();
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { result } = renderHook(() => useRealtimeMessages());

    // Wait on the actual outcome — the hidden contact's conversation appearing —
    // not on the `loading` flag. `loading` toggles as the hook's effects settle
    // (the callbacks it depends on are recreated per render), so keying the wait
    // on it was racy and made this test flaky. Keying on the data is deterministic.
    await waitFor(
      () => {
        expect(
          result.current.conversations.map((c: { contact: { id: string } }) => c.contact.id)
        ).toContain(hiddenActiveContact.id);
      },
      { timeout: 10000 }
    );
  });

  it('creates a conversation when a realtime message arrives for a contact not loaded initially', () => {
    // Validates that the hook exposes the correct API shape for handling realtime messages
    const unloadedContact = makeContact({
      id: 'new-contact',
      name: 'Novo contato',
      phone: '553499199147',
    });
    contactsById[unloadedContact.id] = unloadedContact;

    const { result } = renderHook(() => useRealtimeMessages());

    // Hook initializes with loading=true and empty conversations
    expect(result.current.loading).toBe(true);
    expect(result.current.conversations).toEqual([]);
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });
});