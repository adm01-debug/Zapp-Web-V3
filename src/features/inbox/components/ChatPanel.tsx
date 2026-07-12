import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChatScheduleMessage } from './chat/hooks/useChatScheduleMessage';
import { useChatQuickReplyControl } from './chat/hooks/useChatQuickReplyControl';
import { Conversation, Message } from '@/types/chat';
import { FileUploaderRef } from './FileUploader';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useQuickReplies } from '@/features/inbox';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useUserSettings } from '@/hooks/useUserSettings';

import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useMessageSignature } from '@/features/inbox';
import { useChatMediaSending } from '../hooks/useChatMediaSending';
import { CRMAutoSync } from './CRMAutoSync';
import { useAmbientColor } from '@/hooks/useAmbientColor';
import { ChatToolPanels } from './chat/ChatToolPanels';
import { ChatDialogs } from './chat/ChatDialogs';
import { ChatPanelHeader } from './chat/ChatPanelHeader';

import { ChatAssignedBar } from './chat/ChatAssignedBar';
import { TicketActionsBar } from './chat/TicketActionsBar';
import { TicketHistorySheet } from './TicketHistorySheet';
import { ChatMessagesArea, ChatMessagesAreaRef } from './chat/ChatMessagesArea';
import type { LoadOlderProps } from './chat/loadOlderTypes';
import { ChatInputArea } from './chat/ChatInputArea';
import { AutomationSuggestionsBar } from './chat/AutomationSuggestionsBar';
import { useAutomations } from '@/hooks/useAutomations';
import { SendErrorBanner } from './chat/SendErrorBanner';
import { ChatDragOverlay } from './chat/ChatDragOverlay';
import { ChatQuickRepliesPopover } from './chat/ChatQuickRepliesPopover';
import { ChatSearchBar } from './chat/ChatSearchBar';
import { useChatPanelHandlers } from './chat/useChatPanelHandlers';
import type { ActiveTool } from './chat/ChatHeaderToolbar';
import { FailureFilterBar } from './chat/FailureFilterBar';
import { useChatFilters } from './chat/hooks/useChatFilters';
import { useSLADelivery } from './chat/hooks/useSLADelivery';
import { useChatSearchState } from './chat/hooks/useChatSearchState';
import { useChatDialogs } from './chat/hooks/useChatDialogs';
import { useInitialHighlight } from './chat/hooks/useInitialHighlight';
import { useChatDragAndDrop } from './chat/hooks/useChatDragAndDrop';
import { ChatTemplatesOverlay } from './chat/ChatTemplatesOverlay';
import { ChatMonitoringDialog } from './chat/ChatMonitoringDialog';
import { ChatPanelOverlays } from './chat/ChatPanelOverlays';
import { useChatAutoScroll } from '../hooks/useChatAutoScroll';
import { useTransferConversation } from '../hooks/useTransferConversation';
import { useInboxShortcuts } from '../hooks/useInboxShortcuts';
import { dbFrom } from '@/integrations/datasource/db';
import { useUserRole } from '@/features/auth';

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as Window).requestIdleCallback(() => {
    import('./TransferDialog');
    import('./AIConversationAssistant');
    import('./CloseConversationDialog');
  });
}

interface ChatPanelProps extends LoadOlderProps {
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
  messageQueue?: any;
}

export function ChatPanel({
  conversation,
  messages,
  onSendMessage,
  onSendAudio,
  showDetails = false,
  onToggleDetails,
  onBack,
  hideHeader = false,
  onLoadOlder,
  onCancelLoadOlder,
  loadingOlder = false,
  hasMoreOlder = false,
  initialHighlightMessageId,
  onHighlightConsumed,
  whisperCount: _whisperCount = 0,
  isLoading = false,
  messageQueue,
}: ChatPanelProps) {
  const { templates: _quickReplyTemplates } = useQuickReplies();
  // Ferramentas de desenvolvimento (Checklist 10/10) só para devs reais.
  const { roles: userRoles } = useUserRole();
  const isDevExact = userRoles.includes('dev');
  const {
    dialogs,
    openDialog,
    closeDialog,
    toggleDialog: _toggleDialog,
    resetDialogs: _resetDialogs,
  } = useChatDialogs();
  const [historyOpen, setHistoryOpen] = useState(false);

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  useEffect(() => {
    const isSearch = (activeTool as string) === 'chatSearch';
    const isAssistant = (activeTool as string) === 'aiAssistant';

    if (isSearch) openDialog('chatSearch');
    else closeDialog('chatSearch');

    if (isAssistant) openDialog('aiAssistant');
    else closeDialog('aiAssistant');
  }, [activeTool, openDialog, closeDialog]);

  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound');

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
  // `isContactTyping` vem do canal compartilhado `typing:${jid}` (broadcast do webhook).
  // Mantido em hook dedicado para evitar colisão de canais Realtime no client.
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

  const handleVoiceChange = (v: string) => {
    updateSettings({ tts_voice_id: v });
    setTimeout(() => saveSettings(), 100);
  };
  const handleSpeedChange = (s: number) => {
    updateSettings({ tts_speed: s });
    setTimeout(() => saveSettings(), 100);
  };
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
  }, [conversation.contact.id]);

  // Avalia regras de automação para a conversa ativa
  useAutomations({
    remoteJid: conversation.contact.id,
    instanceName,
    assignedTo: conversation.assignedTo?.id ?? null,
  });

  // Monitora atraso na entrega (SLA Delivery)
  useSLADelivery({ contactId: conversation.contact.id, messages });

  const { bindScrollListener } = useChatAutoScroll({ messages, isContactTyping, messagesAreaRef });
  useEffect(() => {
    const el = messagesAreaRef.current?.getScrollContainer();
    return el ? bindScrollListener(el) : undefined;
  }, [bindScrollListener, conversation.id]);

  useInboxShortcuts({
    onSearchFocus: () => {
      if (activeTool === 'chatSearch') {
        // Already open, try to focus input via DOM if possible or just no-op
      } else {
        handleSetActiveTool('chatSearch');
      }
    },
    onNextConversation: () => {}, // Handled in Sidebar
    onPrevConversation: () => {}, // Handled in Sidebar
    onArchive: () => {}, // Handled in Sidebar
    onTransfer: () => handlers.handleSlashCommand({ id: 'transfer' }),
    onRefresh: () => {}, // Handled in Sidebar
    onSearchFocusChat: () => handleSetActiveTool('chatSearch'),
  });

  useEffect(() => {
    setActiveTool(null);
    resetSearch();
    setFailuresOnly(false);
  }, [conversation.id, resetSearch, setFailuresOnly]);

  // Deep-link "Ver no chat": encontra a mensagem alvo, faz scroll e aplica destaque temporário.
  useInitialHighlight({
    initialHighlightMessageId,
    messages,
    messagesAreaRef,
    setHighlightedMessageIds,
    setActiveHighlightId,
    onHighlightConsumed,
  });

  const _canGenerateSummary = messages.length >= 10;

  // Memoize expensive derived arrays to avoid re-creation on every keystroke
  const _lastContactMessages = useMemo(
    () =>
      messages
        .filter((m) => m.sender === 'contact')
        .slice(-5)
        .map((m) => m.content),
    [messages]
  );
  const _allMessagesForHeader = useMemo(
    () =>
      messages.map((m) => ({
        id: m.id,
        content: m.content,
        sender: m.sender,
        timestamp: m.timestamp.toISOString(),
      })),
    [messages]
  );
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

  // Stable refs for ChatMessagesArea to prevent re-renders on input change
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

  const _ambient = useAmbientColor(conversation.sentiment);

  return (
    <div
      data-testid="chat-window"
      className={`relative flex h-full min-h-0 min-w-0 overflow-hidden bg-muted/20 antialiased`}
      {...dragHandlers}
    >
      <ChatDragOverlay isDraggingOver={isDraggingOver} />
      <CRMAutoSync conversation={conversation} messageCount={messages.length} messages={messages} />

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--background))]">
        {!hideHeader && (
          <ChatPanelHeader
            conversation={conversation}
            isContactTyping={isContactTyping}
            showAIAssistant={activeTool === 'aiAssistant'}
            showDetails={showDetails}
            voiceId={voiceId}
            speed={speed}
            onToggleAIAssistant={() => handleSetActiveTool('aiAssistant')}
            onToggleDetails={onToggleDetails || (() => {})}
            onStartCall={() => {
              setCallDirection('outbound');
              openDialog('callDialog');
            }}
            onOpenSearch={() => handleSetActiveTool('chatSearch')}
            onOpenValidation={isDevExact ? () => openDialog('visualValidation') : undefined}
            onOpenTransfer={() => openDialog('transferDialog')}
            onOpenSchedule={() => openDialog('scheduleDialog')}
            onVoiceChange={setVoiceId}
            onSpeedChange={setSpeed}
            onBack={onBack}
            onGenerateSummary={() => handleSetActiveTool('summary')}
            onCloseConversation={() => openDialog('closeDialog')}
            failuresOnly={failuresOnly}
            failuresCount={failedMessages.length}
            onToggleFailuresOnly={() => setFailuresOnly((v) => !v)}
            activeTool={activeTool}
            onSetActiveTool={handleSetActiveTool}
          />
        )}

        {activeTool === 'templates' && (
          <ChatTemplatesOverlay
            contactName={conversation.contact.name}
            contactCompany={conversation.contact.company ?? undefined}
            onClose={() => setActiveTool(null)}
            onUseTemplate={(content) => {
              handlers.setInputValue(content);
              setActiveTool(null);
              setTimeout(() => handlers.inputRef.current?.focus(), 10);
            }}
          />
        )}

        <ChatSearchBar
          messages={messages}
          isOpen={(activeTool as string) === 'chatSearch'}
          onClose={() => {
            handleSetActiveTool('chatSearch');
            setTimeout(() => handlers.inputRef.current?.focus(), 150);
          }}
          onNavigateToMessage={(id) => messagesAreaRef.current?.scrollToMessage(id)}
          onHighlightChange={handleHighlightChange}
          onSearchQueryChange={setSearchQuery}
        />

        <TicketActionsBar
          contactId={conversation.contact.id}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <TicketHistorySheet
          contactId={conversation.contact.id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
        />
        <ChatAssignedBar
          conversation={conversation}
          onOpenTransfer={() => openDialog('transferDialog')}
        />

        <FailureFilterBar
          failuresOnly={failuresOnly}
          failureCategory={failureCategory}
          categoryFilteredMessages={categoryFilteredMessages}
          failedMessagesCount={failedMessages.length}
          categoryCounts={categoryCounts}
          setFailureCategory={setFailureCategory}
          setFailuresOnly={setFailuresOnly}
        />

        <ChatPanelOverlays
          contactId={conversation.contact.id}
          contactName={conversation.contact.name}
          showVisualValidation={dialogs.visualValidation}
          onCloseVisualValidation={() => closeDialog('visualValidation')}
          showWhisper={dialogs.whisper}
        />

        <ChatMessagesArea
          ref={messagesAreaRef}
          messages={visibleMessages}
          isContactTyping={isContactTyping}
          typingUserName={typingUsers[0]?.name || conversation.contact.name}
          ttsLoading={ttsLoading}
          ttsPlaying={ttsPlaying}
          ttsMessageId={ttsMessageId}
          instanceName={instanceName}
          contactJid={contactJid}
          contactAvatar={contactAvatar}
          onSpeak={speak}
          onStop={stop}
          onReply={handlers.handleReplyToMessage}
          onForward={handlers.handleForwardMessage}
          onCopy={handlers.handleCopyMessage}
          onScrollToMessage={handleScrollToMessage}
          onInteractiveButtonClick={handlers.handleInteractiveButtonClick}
          onEditStart={handlers.handleEditStart}
          highlightedMessageIds={highlightedMessageIds}
          activeHighlightId={activeHighlightId}
          searchQuery={searchQuery}
          onLoadOlder={failuresOnly ? undefined : onLoadOlder}
          onCancelLoadOlder={failuresOnly ? undefined : onCancelLoadOlder}
          loadingOlder={failuresOnly ? false : loadingOlder}
          hasMoreOlder={failuresOnly ? false : hasMoreOlder}
          isLoading={isLoading}
          onAudioVoiceChange={handlers.handleAudioVoiceChange}
        />

        <ChatQuickRepliesPopover
          show={dialogs.quickReplies}
          replies={filteredQuickReplies}
          onSelect={handleQuickReply}
          onClose={() => closeDialog('quickReplies')}
          selectedIndex={selectedQuickReplyIndex}
        />

        <SendErrorBanner
          error={handlers.lastSendError}
          detail={handlers.lastSendErrorDetail}
          isRetrying={handlers.isSending}
          onRetry={handlers.retryLastSend}
          onDismiss={handlers.dismissSendError}
        />

        <AutomationSuggestionsBar
          remoteJid={conversation.contact.id}
          onUseSuggestion={(t) => handlers.setInputValue(t)}
        />

        <ChatInputArea
          inputValue={handlers.inputValue}
          replyToMessage={handlers.replyToMessage}
          editingMessage={handlers.editingMessage}
          isRecordingAudio={handlers.isRecordingAudio}
          showSlashCommands={dialogs.slashCommands}
          contactId={conversation.contact.id}
          contactPhone={conversation.contact.phone}
          contactName={conversation.contact.name}
          instanceName={instanceName}
          messages={messages}
          quickReplies={dbQuickReplies}
          isSending={handlers.isSending}
          sendProgress={handlers.sendProgress}
          isWhisper={handlers.isWhisper}
          onToggleWhisper={() => handlers.setIsWhisper(!handlers.isWhisper)}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleTypingStop}
          onSend={(att) => handlers.handleSend(att)}
          onCancelReply={() => handlers.setReplyToMessage(null)}
          onCancelEdit={handlers.handleCancelEdit}
          onSlashCommand={handlers.handleSlashCommand}
          onCloseSlashCommands={() => closeDialog('slashCommands')}
          onQuickReply={handleQuickReply}
          onRecordToggle={() => handlers.setIsRecordingAudio(!handlers.isRecordingAudio)}
          onAudioSend={(blob) => handlers.handleAudioSend(blob, onSendAudio)}
          onAudioCancel={() => handlers.setIsRecordingAudio(false)}
          onOpenInteractiveBuilder={() => openDialog('interactiveBuilder')}
          onOpenSchedule={() => openDialog('scheduleDialog')}
          onOpenLocationPicker={() => openDialog('locationPicker')}
          onSendProduct={handlers.handleSendProduct}
          onSendSticker={handleSendSticker}
          onSendAudioMeme={handleSendAudioMeme}
          onSendCustomEmoji={handleSendCustomEmoji}
          signatureEnabled={signatureEnabled}
          signatureName={agentName}
          onToggleSignature={toggleSignature}
          onPollSent={async (poll) => {
            await dbFrom('messages').insert({
              contact_id: conversation.contact.id,
              whatsapp_connection_id: whatsappConnectionId,
              content: `📊 *Enquete:* ${poll.name}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
              message_type: 'text',
              sender: 'agent',
              status: 'sending',
            });
          }}
          onContactSent={async (contactName) => {
            await dbFrom('messages').insert({
              contact_id: conversation.contact.id,
              whatsapp_connection_id: whatsappConnectionId,
              content: `📇 Cartão de contato: ${contactName}`,
              message_type: 'text',
              sender: 'agent',
              status: 'sending',
            });
          }}
          onOpenCatalog={() => openDialog('catalogDirect')}
          onSelectSuggestion={(text) => handlers.setInputValue(text)}
          onSelectTemplate={(text) => handlers.setInputValue(text)}
          onOpenTeamFiles={() => handleSetActiveTool('teamFiles')}
          fileUploaderRef={fileUploaderRef}
          inputRef={handlers.inputRef}
          queue={messageQueue?.queue}
          onRetry={messageQueue?.retryMessage}
          onRemoveFromQueue={messageQueue?.removeFromQueue}
        />

        <ChatDialogs
          dialogs={dialogs}
          openDialog={openDialog}
          closeDialog={closeDialog}
          conversation={conversation}
          forwardMessage={handlers.forwardMessage}
          callDirection={callDirection}
          contactId={conversation.contact.id}
          onTransfer={handleTransfer}
          onScheduleMessage={handleScheduleMessage}
          onSendInteractiveMessage={handlers.handleSendInteractiveMessage}
          onForwardToTargets={handlers.handleForwardToTargets}
          onSendLocation={handlers.handleSendLocation}
          onSendProduct={handlers.handleSendProduct}
          onSetInputValue={handlers.setInputValue}
        />
      </div>

      <ChatToolPanels
        activeTool={activeTool}
        onSetActiveTool={handleSetActiveTool}
        messages={messages}
        contactId={conversation.contact.id}
        contactName={conversation.contact.name}
        onSelectSuggestion={(text) => handlers.setInputValue(text)}
      />
      <ChatMonitoringDialog
        open={activeTool === 'monitoring'}
        onOpenChange={(open) => !open && handleSetActiveTool(null)}
        metrics={messageQueue?.getMetrics()}
      />
    </div>
  );
}
