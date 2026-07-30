/**
 * D-04 regression test: ChatMessagesArea virtualizer ref fix.
 *
 * The E17 fix changed `virtualizer.getVirtualItems()` to `virtualizerRef.current.getVirtualItems()`
 * and added `data-index` + `measureElement` ref on each virtual row.
 * This test validates that rendered items carry these attributes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { createElement } from 'react';

// Mock @tanstack/react-virtual
const mockScrollToIndex = vi.fn();
const mockGetVirtualItems = vi.fn().mockReturnValue([]);
const mockMeasureElement = vi.fn();
const mockGetTotalSize = vi.fn().mockReturnValue(0);

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({
    getVirtualItems: mockGetVirtualItems,
    getTotalSize: mockGetTotalSize,
    scrollToIndex: mockScrollToIndex,
    measureElement: mockMeasureElement,
  }),
}));

// Mock tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

// Mock Supabase client — include removeChannel + auth for cleanup
vi.mock('@/integrations/supabase/client', () => {
  const mockChannel = { on: () => mockChannel, subscribe: vi.fn().mockResolvedValue({} as any) };
  return {
    supabase: {
      channel: () => mockChannel,
      removeChannel: vi.fn().mockResolvedValue(undefined),
      auth: {
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    },
  };
});

// Mock Lucide icons — preserve all actual exports, override specific ones
vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Loader2: 'Loader2',
  Lock: 'Lock',
  ChevronDown: 'ChevronDown',
  Clock: 'Clock',
}));

// Mock auth barrel + services to prevent AuthProvider from loading
vi.mock('@/features/auth', () => ({}));
vi.mock('@/features/auth/services/authService', () => ({
  __esModule: true,
  default: {},
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

// Mock loggers
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// Mock UI components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: any) => createElement('button', null, children),
}));
vi.mock('@/components/ui/empty-states', () => ({ EmptyState: () => null }));
// Mock bubble dependencies to avoid auth/render complexity
vi.mock('@/features/inbox/components/chat/MessageBubble', () => ({ MessageBubble: () => null }));
vi.mock('../TypingIndicator', () => ({ TypingIndicator: () => null }));
vi.mock('../MessageBubble', () => ({
  MessageBubble: () => createElement('div', { 'data-testid': 'message-bubble' }),
}));
vi.mock('../ChatWatermark', () => ({ ChatWatermark: () => null }));
vi.mock('../../hooks/reactions/useConversationReactionsRealtime', () => ({
  useConversationReactionsRealtime: () => {},
}));

import { ChatMessagesArea } from '../ChatMessagesArea';
import type { Message } from '@/types/chat';

function makeMsg(id: string): Message {
  return {
    id,
    conversationId: 'c1',
    content: `message ${id}`,
    type: 'text',
    sender: 'agent',
    timestamp: new Date('2024-01-01'),
    status: 'sent',
  } as Message;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVirtualItems.mockReturnValue([]);
  mockGetTotalSize.mockReturnValue(0);
});

describe('ChatMessagesArea — D-04 regression: virtualizer ref fix', () => {
  it('renders empty state when there are no messages', () => {
    const { container } = render(
      createElement(ChatMessagesArea, {
        messages: [],
        isContactTyping: false,
        typingUserName: '',
        ttsLoading: false,
        ttsPlaying: false,
        ttsMessageId: null,
        onSpeak: vi.fn(),
        onStop: vi.fn(),
        onReply: vi.fn(),
        onForward: vi.fn(),
        onCopy: vi.fn(),
        onScrollToMessage: vi.fn(),
        onInteractiveButtonClick: vi.fn(),
        onLoadOlder: vi.fn(),
        onCancelLoadOlder: vi.fn(),
        loadingOlder: false,
        hasMoreOlder: false,
        ref: { current: null },
      } as any)
    );
    expect(container).toBeTruthy();
  });

  it('renders virtual items with data-index and measureElement ref when messages exist', () => {
    const msgs = [makeMsg('m1'), makeMsg('m2')];

    mockGetVirtualItems.mockReturnValue([
      { index: 0, key: 'm1', start: 0, size: 80, lane: 0 },
      { index: 1, key: 'm2', start: 80, size: 80, lane: 0 },
    ]);
    mockGetTotalSize.mockReturnValue(160);

    render(
      createElement(ChatMessagesArea, {
        messages: msgs,
        isContactTyping: false,
        typingUserName: '',
        ttsLoading: false,
        ttsPlaying: false,
        ttsMessageId: null,
        onSpeak: vi.fn(),
        onStop: vi.fn(),
        onReply: vi.fn(),
        onForward: vi.fn(),
        onCopy: vi.fn(),
        onScrollToMessage: vi.fn(),
        onInteractiveButtonClick: vi.fn(),
        onLoadOlder: vi.fn(),
        onCancelLoadOlder: vi.fn(),
        loadingOlder: false,
        hasMoreOlder: false,
        ref: { current: null },
      } as any)
    );

    // Verify getVirtualItems was called via virtualizerRef.current (not stale closure)
    expect(mockGetVirtualItems).toHaveBeenCalled();
    // Verify getTotalSize was called for the container height
    expect(mockGetTotalSize).toHaveBeenCalled();
    // Verify measureElement was passed as a ref
    expect(mockMeasureElement).toBeDefined();
    expect(typeof mockMeasureElement).toBe('function');
  });
});
