import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatScheduleMessage } from './hooks/useChatScheduleMessage';
import { useChatQuickReplyControl } from './hooks/useChatQuickReplyControl';
import { Conversation, Message } from '@/types/chat';
import { FileUploaderRef } from '../FileUploader';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useQuickReplies } from '@/features/inbox';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useMessageSignature } from '@/features/inbox';
import type { MessageQueueController } from '../../hooks/useMessageQueue';
import { useChatMediaSending } from '../../hooks/useChatMediaSending';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { ChatMessagesAreaRef } from './ChatMessagesArea';
import type { LoadOlderProps } from './loadOlderTypes';
import { useAutomations } from '@/hooks/useAutomationManagement';
import { useChatPanelHandlers } from './useChatPanelHandlers';
import type { ActiveTool } from './ChatHeaderToolbar';
import { useChatFilters } from './hooks/useChatFilters';
import { useSLADelivery } from './hooks/useSLADelivery';
import { useChatSearchState } from './hooks/useChatSearchState';
import { useChatDialogs } from './hooks/useChatDialogs';
import { useInitialHighlight } from './hooks/useInitialHighlight';
import { useChatDragAndDrop } from './hooks/useChatDragAndDrop';
import { useChatAutoScroll } from '../../hooks/useChatAutoScroll';
import { useTransferConversation } from '../../hooks/useTransferConversation';
import { useInboxShortcuts } from '../../hooks/useInboxShortcuts';
import { dbFrom } from '@/integrations/datasource/db';
import { useUserRole } from '@/features/auth';

/** Chat Panel Props component for the chat section. */
export interface ChatPanelProps extends LoadOlderProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onSendAudio?: (blob: Blob) => Promise<void>;
  showDetails?: boolean;
  onToggleDetails?: () => void;
  onBack?: () => void;
  hideHeader?: boolean;
  initialHighlightMessageId?: string | null;
  onHighlightConsumed?: () => void;
  whisperCount?: number;
  isLoading?: boolean;
  messageQueue?: MessageQueueController;
}

/** use Chat Panel component for the chat section. */
export function useChatPanel({
  conversation,
  messages,
  onSendMessage,
  onSendAudio,
  showDetails = false,
  onToggleDetails,
  onBack,
  hideHeader = false,
  initialHighlightMessageId,
  onHighlightConsumed,
  isLoading = false,
  messageQueue: messageQueueController,
  onLoadOlder,
  onCancelLoadOlder,
  loadingOlder = false,
  hasMoreOlder = false,
}: ChatPanelProps) {
  const { roles: userRoles } = useUserRole();
  const isDevExact = userRoles.includes('dev');

  const { dialogs, openDialog, closeDialog } = useChatDialogs();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound');

  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  useEffect(() => {
    if ((activeTool as string) === 'chatSearch') openDialog('chatSearch');
    else closeDialog('chatSearch');
    if ((activeTool as string) === 'aiAssistant') openDialog('aiAssistant');
    else closeDialog('aiAssistant');
  }, [activeTool, openDialog, closeDialog]);

  const chatSearch = useChatSearchState();
  const {
    highlightedMessageIds,
    activeHighlightId,
    searchQuery,
    setSearchQuery,
    resetSearch,
    handleHighlightChange,
    setHighlightedMessageIds,
    setActiveHighlightId,
  } = chatSearch;

  const filters = useChatFilters(messages);
  const {
    failuresOnly,
    failureCategory,
    setFailuresOnly,
    setFailureCategory,
    failedMessages,
    categoryCounts,
    categoryFilteredMessages,
    visibleMessages,
  } = filters;

  const fileUploaderRef = useRef<FileUploaderRef>(null);
  const messagesAreaRef = useRef<ChatMessagesAreaRef>(null);
  const { isDraggingOver, dragHandlers } = useChatDragAndDrop(fileUploaderRef);

  const { typingUsers, handleTypingStart, handleTypingStop } = useTypingPresence({
    conversationId: conversation.id,
    remoteJid: conversation.contact.id,
    currentUserId: conversation.assignedTo?.id || 'agent',
    currentUserName: conversation.assignedTo?.name || 'Agente',
  });
  const isContactTyping = useContactTyping(conversation.contact.id, {
    allowGroups: conversation.contact.id?.endsWith('@g.us') === true,
  });

  const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();
  const { settings, updateSettings, saveSettings } = useUserSettings();
  const { editMessage } = useEvolutionApi();
  const { scheduleMessage } = useScheduledMessages(conversation.contact.id);
  const { signatureEnabled, agentName, toggleSignature, applySignature } = useMessageSignature();
  const {
    instanceName,
    whatsappConnectionId,
    initResolve,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
  } = useChatMediaSending(conversation.contact.id, conversation.contact.phone);

  const handleVoiceChange = useCallback(
    (v: string) => {
      updateSettings({ tts_voice_id: v });
      setTimeout(() => saveSettings(), 100);
    },
    [updateSettings, saveSettings]
  );
  const handleSpeedChange = useCallback(
    (s: number) => {
      updateSettings({ tts_speed: s });
      setTimeout(() => saveSettings(), 100);
    },
    [updateSettings, saveSettings]
  );

  const {
    speak,
    stop,
    isLoading: ttsLoading,
    isPlaying: ttsPlaying,
    currentMessageId: ttsMessageId,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
  } = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id,
    initialSpeed: settings.tts_speed,
    onVoiceChange: handleVoiceChange,
    onSpeedChange: handleSpeedChange,
  });

  const handlers = useChatPanelHandlers({
    conversationId: conversation.id,
    contactId: conversation.contact.id,
    contactPhone: conversation.contact.phone,
    instanceName,
    onSendMessage,
    editMessageApi: editMessage,
    applySignature,
    handleTypingStart,
    handleTypingStop,
    openDialog,
    closeDialog,
    handleSetActiveTool,
  });

  useEffect(() => {
    initResolve();
  }, [conversation.contact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useAutomations({
    remoteJid: conversation.contact.id,
    instanceName,
    assignedTo: conversation.assignedTo?.id ?? null,
  });

  useSLADelivery({ contactId: conversation.contact.id, messages });

  const { bindScrollListener } = useChatAutoScroll({ messages, isContactTyping, messagesAreaRef });
  useEffect(() => {
    const el = messagesAreaRef.current?.getScrollContainer();
    return el ? bindScrollListener(el) : undefined;
  }, [bindScrollListener, conversation.id]);

  useInboxShortcuts({
    onSearchFocus: () => {
      if (activeTool !== 'chatSearch') handleSetActiveTool('chatSearch');
    },
    onNextConversation: () => {},
    onPrevConversation: () => {},
    onArchive: () => {},
    onTransfer: () => handlers.handleSlashCommand({ id: 'transfer' }),
    onRefresh: () => {},
    onSearchFocusChat: () => handleSetActiveTool('chatSearch'),
  });

  useEffect(() => {
    setActiveTool(null);
    resetSearch();
    setFailuresOnly(false);
  }, [conversation.id, resetSearch, setFailuresOnly]);

  useInitialHighlight({
    initialHighlightMessageId,
    messages,
    messagesAreaRef,
    setHighlightedMessageIds,
    setActiveHighlightId,
    onHighlightConsumed,
  });

  const _ambient = useAmbientColor(conversation.sentiment);

  const {
    filtered: filteredQuickReplies,
    selectedIndex: selectedQuickReplyIndex,
    handleQuickReply,
    handleKeyDown,
    handleInputChange,
  } = useChatQuickReplyControl({
    inputValue: handlers.inputValue,
    dbQuickReplies,
    quickRepliesOpen: dialogs.quickReplies,
    openQuickReplies: () => openDialog('quickReplies'),
    closeQuickReplies: () => closeDialog('quickReplies'),
    slashCommandsOpen: dialogs.slashCommands,
    setInputValue: handlers.setInputValue,
    focusInput: () => handlers.inputRef.current?.focus(),
    incrementUseCount,
    baseHandleInputChange: handlers.handleInputChange,
    baseHandleKeyDown: handlers.handleKeyDown,
  });

  const contactJid = useMemo(
    () => (conversation.contact.phone ? `${conversation.contact.phone}@s.whatsapp.net` : ''),
    [conversation.contact.phone]
  );
  const contactAvatar = conversation.contact.avatar || undefined;
  const handleScrollToMessage = useCallback(
    (id: string) => messagesAreaRef.current?.scrollToMessage(id),
    []
  );

  const { transferConversation: handleTransfer } = useTransferConversation({
    contactId: conversation.contact.id,
    whatsappConnectionId: whatsappConnectionId ?? undefined,
  });

  const handleScheduleMessage = useChatScheduleMessage({
    contactId: conversation.contact.id,
    scheduleMessage,
    onDone: () => closeDialog('scheduleDialog'),
  });

  const handlePollSent = useCallback(
    async (poll: { name: string; options: string[] }) => {
      await dbFrom('messages').insert({
        contact_id: conversation.contact.id,
        whatsapp_connection_id: whatsappConnectionId,
        content: `📊 *Enquete:* ${poll.name}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
        message_type: 'text',
        sender: 'agent',
        status: 'sending',
      });
    },
    [conversation.contact.id, whatsappConnectionId]
  );

  const handleContactSent = useCallback(
    async (contactName: string) => {
      await dbFrom('messages').insert({
        contact_id: conversation.contact.id,
        whatsapp_connection_id: whatsappConnectionId,
        content: `📇 Cartão de contato: ${contactName}`,
        message_type: 'text',
        sender: 'agent',
        status: 'sending',
      });
    },
    [conversation.contact.id, whatsappConnectionId]
  );

  return {
    conversation,
    messages,
    showDetails,
    onToggleDetails,
    onBack,
    hideHeader,
    isDevExact,
    dialogs,
    openDialog,
    closeDialog,
    historyOpen,
    setHistoryOpen,
    activeTool,
    setActiveTool,
    handleSetActiveTool,
    callDirection,
    setCallDirection,
    highlightedMessageIds,
    activeHighlightId,
    searchQuery,
    setSearchQuery,
    handleHighlightChange,
    failuresOnly,
    failureCategory,
    setFailuresOnly,
    setFailureCategory,
    failedMessages,
    categoryCounts,
    categoryFilteredMessages,
    visibleMessages,
    fileUploaderRef,
    messagesAreaRef,
    isDraggingOver,
    dragHandlers,
    typingUsers,
    handleTypingStart,
    handleTypingStop,
    isContactTyping,
    dbQuickReplies,
    speak,
    stop,
    ttsLoading,
    ttsPlaying,
    ttsMessageId,
    voiceId,
    setVoiceId,
    speed,
    setSpeed,
    instanceName,
    whatsappConnectionId,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
    signatureEnabled,
    agentName,
    toggleSignature,
    handlers,
    filteredQuickReplies,
    selectedQuickReplyIndex,
    handleQuickReply,
    handleKeyDown,
    handleInputChange,
    contactJid,
    contactAvatar,
    handleScrollToMessage,
    handleTransfer,
    handleScheduleMessage,
    handlePollSent,
    handleContactSent,
    onSendAudio,
    onLoadOlder,
    onCancelLoadOlder,
    loadingOlder,
    hasMoreOlder,
    isLoading,
    messageQueue: messageQueueController?.queue ?? [],
  };
}
