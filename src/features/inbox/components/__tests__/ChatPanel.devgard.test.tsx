import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import type { Conversation, Message } from '@/types/chat';

// ── Logger Spy (hoisted so vi.mock can reference it) ──
const mockLogWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => {
  const makeLogger = () => ({
    warn: mockLogWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });
  return {
    getLogger: () => makeLogger(),
    createLogger: () => makeLogger(),
  };
});

// Mock the entire inbox barrel — use importOriginal to keep real exports plus overrides
vi.mock('@/features/inbox', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as Record<string, unknown>),
    useQuickReplies: () => ({ quickReplies: [], incrementUseCount: vi.fn() }),
    useMessageSignature: () => ({
      signatureEnabled: false,
      agentName: '',
      toggleSignature: vi.fn(),
      applySignature: vi.fn(),
    }),
  };
});

// ── Mock all heavy deps ──
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ profile: { id: 'profile-1' } }),
  useUserRole: () => ({ roles: ['agent'] }),
  useDepartmentAgents: () => ({ agentIds: [] }),
}));

vi.mock('@/hooks/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: {},
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
  }),
}));

vi.mock('@/hooks/useEvolutionApi', () => ({
  useEvolutionApi: () => ({ editMessage: vi.fn(), sendStickerMessage: vi.fn() }),
}));

vi.mock('@/hooks/useTypingPresence', () => ({
  useTypingPresence: () => ({
    typingUsers: [],
    handleTypingStart: vi.fn(),
    handleTypingStop: vi.fn(),
  }),
}));

vi.mock('@/hooks/useContactTyping', () => ({
  useContactTyping: () => false,
}));

vi.mock('@/hooks/useTextToSpeech', () => ({
  useTextToSpeech: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
    isPlaying: false,
    currentMessageId: null,
    voiceId: '',
    setVoiceId: vi.fn(),
    speed: 1,
    setSpeed: vi.fn(),
  }),
}));

vi.mock('@/hooks/useScheduledMessages', () => ({
  useScheduledMessages: () => ({ scheduleMessage: vi.fn() }),
}));

vi.mock('@/hooks/useAutomations', () => ({
  useAutomations: vi.fn(),
}));

// Stateful mock for useChatMediaSending that uses the instanceHint
let _mockInstanceName = '';
const mockUseChatMediaSending = vi.hoisted(() => {
  let latestInstanceName = '';
  return {
    __setInstanceName: (name: string) => {
      latestInstanceName = name;
    },
    impl: (_contactId: string, _phone: string | undefined, instanceHint?: string) => {
      if (instanceHint) latestInstanceName = instanceHint;
      _mockInstanceName = latestInstanceName;
      return {
        instanceName: latestInstanceName,
        whatsappConnectionId: null,
        initResolve: vi.fn(),
        resolveInstance: vi.fn(),
        handleSendSticker: vi.fn(),
        handleSendCustomEmoji: vi.fn(),
        handleSendAudioMeme: vi.fn(),
      };
    },
    __reset: () => {
      latestInstanceName = '';
      _mockInstanceName = '';
    },
  };
});

vi.mock('../../hooks/useChatMediaSending', () => ({
  useChatMediaSending: mockUseChatMediaSending.impl,
}));

vi.mock('../../hooks/useChatAutoScroll', () => ({
  useChatAutoScroll: () => ({ bindScrollListener: vi.fn() }),
}));

vi.mock('../../hooks/useTransferConversation', () => ({
  useTransferConversation: () => ({ transferConversation: vi.fn() }),
}));

vi.mock('../../hooks/useInboxShortcuts', () => ({
  useInboxShortcuts: vi.fn(),
}));

vi.mock('../chat/useChatPanelHandlers', () => ({
  useChatPanelHandlers: () => ({
    inputValue: '',
    setInputValue: vi.fn(),
    inputRef: { current: null },
    handleInputChange: vi.fn(),
    handleKeyDown: vi.fn(),
    handleSendMessage: vi.fn(),
    handleReplyToMessage: vi.fn(),
    handleForwardMessage: vi.fn(),
    handleCopyMessage: vi.fn(),
    handleInteractiveButtonClick: vi.fn(),
    handleEditStart: vi.fn(),
    handleSlashCommand: vi.fn(),
    handleAudioVoiceChange: vi.fn(),
    lastSendError: null,
    lastSendErrorDetail: null,
    isSending: false,
    retryLastSend: vi.fn(),
    dismissSendError: vi.fn(),
  }),
}));

// Stub child components to prevent deep rendering issues (paths relative to __tests__/)
vi.mock('../chat/ChatPanelHeader', () => ({ ChatPanelHeader: () => null }));
vi.mock('../chat/ChatMessagesArea', () => ({ ChatMessagesArea: () => null }));
vi.mock('../chat/ChatInputArea', () => ({ ChatInputArea: () => null }));
vi.mock('../chat/ChatAssignedBar', () => ({ ChatAssignedBar: () => null }));
vi.mock('../chat/ChatTemplatesOverlay', () => ({ ChatTemplatesOverlay: () => null }));
vi.mock('../chat/ChatToolPanels', () => ({ ChatToolPanels: () => null }));
vi.mock('../chat/ChatDialogs', () => ({ ChatDialogs: () => null }));
vi.mock('../chat/FailureFilterBar', () => ({ FailureFilterBar: () => null }));
vi.mock('../chat/ChatPanelOverlays', () => ({ ChatPanelOverlays: () => null }));
vi.mock('../chat/ChatQuickRepliesPopover', () => ({ ChatQuickRepliesPopover: () => null }));
vi.mock('../chat/SendErrorBanner', () => ({ SendErrorBanner: () => null }));
vi.mock('../chat/AutomationSuggestionsBar', () => ({ AutomationSuggestionsBar: () => null }));
vi.mock('../chat/ChatDragOverlay', () => ({ ChatDragOverlay: () => null }));
vi.mock('../CRMAutoSync', () => ({ CRMAutoSync: () => null }));
vi.mock('../ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('../TicketActionsBar', () => ({ TicketActionsBar: () => null }));
vi.mock('../TicketHistorySheet', () => ({ TicketHistorySheet: () => null }));

import { ChatPanel } from '../ChatPanel';

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
    </MemoryRouter>
  );
};

const makeConversation = (contactId: string, phone?: string): Conversation => ({
  id: contactId,
  contact: {
    id: contactId,
    name: 'Test Contact',
    phone: phone || '5511999999999',
    tags: [],
    createdAt: new Date(),
  },
  status: 'open',
  lastMessage: undefined,
  unreadCount: 0,
  priority: 'medium',
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeMessages = (): Message[] => [];

describe('ChatPanel DEV guard (E03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogWarn.mockClear();
    mockUseChatMediaSending.__reset();
    vi.stubEnv('NODE_ENV', 'development');
  });

  it('should log.warn when instanceName is empty and contactId is a JID phone number', () => {
    const jidContactId = '5511999999999';
    renderWithClient(
      <ChatPanel
        conversation={makeConversation(jidContactId)}
        messages={makeMessages()}
        onSendMessage={vi.fn()}
      />
    );

    expect(mockLogWarn).toHaveBeenCalledWith(
      '[ChatPanel] instanceName vazio — edição e envio de mídia podem falhar',
      expect.objectContaining({ contactId: jidContactId })
    );
  });

  it('should NOT log.warn when instanceName is provided via prop', () => {
    const jidContactId = '5511888888888';
    // Verify mock state is clean before render
    expect(_mockInstanceName).toBe('');
    renderWithClient(
      <ChatPanel
        conversation={makeConversation(jidContactId)}
        messages={makeMessages()}
        onSendMessage={vi.fn()}
        instanceName="my-instance"
      />
    );
    // Verify mock received and used the hint
    expect(_mockInstanceName).toBe('my-instance');
    expect(mockLogWarn).not.toHaveBeenCalled();
  });
});
