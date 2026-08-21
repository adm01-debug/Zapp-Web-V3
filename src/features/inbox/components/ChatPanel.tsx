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
import { toast } from '@/hooks/use-toast';

import { useScheduledMessages } from '@/hooks/useScheduledMessages';
import { useMessageSignature } from '@/features/inbox';
import { useChatMediaSending } from '../hooks/useChatMediaSending';
import { resolveContactRef, isUuidRef } from '../utils/contactRef';
import { CRMAutoSync } from './CRMAutoSync';
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
import { useAuth } from '@/features/auth';
import { useInitialHighlight } from './chat/hooks/useInitialHighlight';
import { useChatDragAndDrop } from './chat/hooks/useChatDragAndDrop';
import { ChatTemplatesOverlay } from './chat/ChatTemplatesOverlay';
import { ChatMonitoringDialog } from './chat/ChatMonitoringDialog';
import { ChatPanelOverlays } from './chat/ChatPanelOverlays';
import { useChatAutoScroll } from '../hooks/useChatAutoScroll';
import { useTransferConversation } from '../hooks/useTransferConversation';
import { useFavoriteMessage } from '@/hooks/useFavoriteMessage';
import { usePinMessage } from '@/hooks/usePinMessage';
import { useReportMessage } from '@/hooks/useReportMessage';
import { useInboxShortcuts } from '../hooks/useInboxShortcuts';
import { useArchiveConversationActions } from '../hooks/useArchiveConversationActions';
import { dbFrom } from '@/integrations/datasource/db';
import { isValidUUID } from '@/utils/uuid';
import type { MessageQueueController } from '../hooks/useMessageQueue';
import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('ChatPanel');

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as Window).requestIdleCallback(() => {
    import('./TransferDialog').catch(() => undefined);
    import('./AIConversationAssistant').catch(() => undefined);
    import('./CloseConversationDialog').catch(() => undefined);
  });
}

interface ChatPanelProps extends LoadOlderProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (
    content: string,
    attachments?: File[],
    onProgress?: (p: number) => void
  ) => void | Promise<void>;
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
  /** WhatsApp instance name for this conversation (enables edit, stickers, automations).
   *  Propagated from inbox source via RealtimeInboxView. */
  instanceName?: string;
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
  whisperCount = 0,
  isLoading = false,
  messageQueue,
  instanceName: instanceNameProp,
}: ChatPanelProps) {
  // Ferramentas de desenvolvimento (Checklist 10/10) só para devs reais em ambiente allowlisted (E51).
  const { isDev: isDevExact } = useUserRole();
  const { dialogs, openDialog, closeDialog, resetAllDialogs } = useChatDialogs();
  const { profile } = useAuth();
  // Ações reais de arquivar/desarquivar (soft-delete do contato — PR PR 773).
  const { archive: archiveConversation } = useArchiveConversationActions();
  // Arquivar REAL da conversa ativa — mesma ação usada pelo slash /archive,
  // pelo menu do header (onArchiveConversation) e pelo atalho Mod+E.
  // Toasts de sucesso/erro vêm da mutation (useContactsMutations), padrão
  // ContactDetails: chamada direta + catch(() => undefined) p/ evitar
  // unhandled rejection (sem toast duplicado do wrapper do slash).
  const handleArchiveConversation = useCallback(() => {
    if (!isValidUUID(conversation.contact.id ?? '')) return;
    void archiveConversation(conversation.contact.id ?? '').catch(() => undefined);
  }, [archiveConversation, conversation.contact.id]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool((prev) => (prev === tool ? null : tool));
  }, []);

  useEffect(() => {
    const isSearch = activeTool === 'chatSearch';
    const isAssistant = activeTool === 'aiAssistant';

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
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isDraggingOver, dragHandlers } = useChatDragAndDrop(fileUploaderRef);

  const contactJid = useMemo(() => {
    // Prefer the canonical remote_jid (present for groups, @lid, and broadcast JIDs
    // where phone is null). Fall back to deriving from phone for legacy contacts.
    const rj = conversation.contact.remote_jid;
    if (rj) return rj;
    const ph = conversation.contact.phone;
    if (!ph) return '';
    // Strategy B/C may have stored a full JID (e.g. 120363@g.us) in the phone field —
    // appending @s.whatsapp.net would produce a malformed double-suffix JID.
    if (ph.includes('@')) return ph;
    return `${ph}@s.whatsapp.net`;
  }, [conversation.contact.remote_jid, conversation.contact.phone]);

  const { typingUsers, handleTypingStart, handleTypingStop } = useTypingPresence({
    conversationId: conversation.id,
    currentUserId: profile?.id || 'agent',
    currentUserName: profile?.name || 'Agente',
  });
  // `isContactTyping` vem do canal compartilhado `typing:${jid}` (broadcast do webhook).
  // Mantido em hook dedicado para evitar colisão de canais Realtime no client.
  const isContactTyping = useContactTyping(contactJid, {
    allowGroups: contactJid.endsWith('@g.us'),
  });
  const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();
  const { settings, updateSettings, saveSettings } = useUserSettings();
  const { editMessage } = useEvolutionApi();
  const { scheduleMessage } = useScheduledMessages(conversation.contact.id ?? undefined);
  const { signatureEnabled, agentName, toggleSignature, applySignature } = useMessageSignature();
  const {
    instanceName,
    whatsappConnectionId,
    initResolve,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
  } = useChatMediaSending(
    conversation.contact.id ?? '',
    conversation.contact.phone ?? '',
    instanceNameProp
  );

  const saveSettingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback(() => {
    if (saveSettingsTimerRef.current !== null) clearTimeout(saveSettingsTimerRef.current);
    saveSettingsTimerRef.current = setTimeout(() => {
      saveSettingsTimerRef.current = null;
      void saveSettings();
    }, 500);
  }, [saveSettings]);
  useEffect(
    () => () => {
      if (saveSettingsTimerRef.current !== null) {
        clearTimeout(saveSettingsTimerRef.current);
        void saveSettings();
      }
    },
    [saveSettings]
  );
  useEffect(
    () => () => {
      if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
    },
    []
  );

  const handleVoiceChange = (v: string) => {
    updateSettings({ tts_voice_id: v });
    debouncedSave();
  };
  const handleSpeedChange = (s: number) => {
    updateSettings({ tts_speed: s });
    debouncedSave();
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
  useEffect(() => {
    if (settings.tts_voice_id) setVoiceId(settings.tts_voice_id);
    if (settings.tts_speed !== undefined) setSpeed(settings.tts_speed);
  }, [settings.tts_voice_id, settings.tts_speed, setVoiceId, setSpeed]);

  const handlers = useChatPanelHandlers({
    conversationId: conversation.id ?? '',
    contactId: conversation.contact.id ?? '',
    contactPhone: conversation.contact.phone ?? '',
    instanceName,
    onSendMessage,
    editMessageApi: editMessage,
    applySignature,
    handleTypingStart,
    handleTypingStop,
    openDialog,
    closeDialog,
    handleSetActiveTool,
    // /archive real: soft-delete via useArchiveConversationActions.archive().
    // Decisão consciente: com ID inválido faz early return silencioso (sem toast)
    // — o guard UUID de onArchiveChat (handlers.onArchive) lança antes, então
    // esta camada nunca é alcançada com ID inválido em condições normais.
    onArchive: handleArchiveConversation,
  });

  useEffect(() => {
    initResolve();
  }, [conversation.contact.id, initResolve, instanceNameProp]);

  // Avalia regras de automação para a conversa ativa
  useAutomations({
    remoteJid: conversation.contact.id,
    instanceName,
    assignedTo: conversation.assignedTo?.id ?? null,
  });

  // Monitora atraso na entrega (SLA Delivery)
  useSLADelivery({ contactId: conversation.contact.id ?? '', messages });

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
    // Mod+E unificado: usa o mesmo caminho validado do slash /archive
    // (handlers.onArchive = onArchiveChat, que valida UUID e rejeita sem
    // silent-fail), evitando duplicação de lógica com a mutation crua.
    onArchive: () => { void handlers.onArchive?.(); },
    onTransfer: () => handlers.handleSlashCommand({ id: 'transfer' }),
    onRefresh: () => {}, // Handled in Sidebar
    onSearchFocusChat: () => handleSetActiveTool('chatSearch'),
  });

  useEffect(() => {
    setActiveTool(null);
    resetSearch();
    setFailuresOnly(false);
    resetAllDialogs();
    setHistoryOpen(false);
    setCallDirection('outbound');
  }, [conversation.id, resetSearch, setFailuresOnly, resetAllDialogs]);

  // Deep-link "Ver no chat": encontra a mensagem alvo, faz scroll e aplica destaque temporário.
  useInitialHighlight({
    initialHighlightMessageId,
    messages,
    messagesAreaRef,
    setHighlightedMessageIds,
    setActiveHighlightId,
    onHighlightConsumed,
  });

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
  const contactAvatar = conversation.contact.avatar || undefined;
  const handleScrollToMessage = useCallback(
    (id: string) => messagesAreaRef.current?.scrollToMessage(id),
    []
  );

  // Etapa 41: "Responder depois" da toolbar de mensagem — converte a duração
  // em data e delega ao snooze real da conversa (useChatPanelHandlers.onSnooze).
  const { onSnooze } = handlers;
  const handleSnoozeFromToolbar = useCallback(
    (duration: '1h' | '3h' | 'tomorrow' | 'nextweek') => {
      const now = new Date();
      let until: Date;
      switch (duration) {
        case '1h':
          until = new Date(now.getTime() + 60 * 60 * 1000);
          break;
        case '3h':
          until = new Date(now.getTime() + 3 * 60 * 60 * 1000);
          break;
        case 'tomorrow': {
          const t = new Date(now);
          t.setDate(t.getDate() + 1);
          t.setHours(9, 0, 0, 0);
          until = t;
          break;
        }
        case 'nextweek': {
          const t = new Date(now);
          const daysUntilMonday = (1 - t.getDay() + 7) % 7 || 7;
          t.setDate(t.getDate() + daysUntilMonday);
          t.setHours(9, 0, 0, 0);
          until = t;
          break;
        }
        default:
          until = new Date(now.getTime() + 60 * 60 * 1000);
      }
      void onSnooze(until.toISOString()).catch(() => {
        log.warn('[ChatPanel] Falha ao adiar conversa pela toolbar');
      });
    },
    [onSnooze]
  );

  // Etapa 44: ações de mensagem com backend real — instanciadas UMA vez por
  // conversa (não por mensagem) e passadas até a toolbar via messageActions.
  const favoriteMsg = useFavoriteMessage();
  const pinMsg = usePinMessage();
  const reportMsg = useReportMessage();
  const messageActions = useMemo(
    () => ({
      toggleFavorite: favoriteMsg.toggleFavorite,
      isFavorite: favoriteMsg.isFavorite,
      togglePin: pinMsg.togglePin,
      isPinned: pinMsg.isPinned,
      report: reportMsg.report,
      hasReported: reportMsg.hasReported,
    }),
    [
      favoriteMsg.toggleFavorite,
      favoriteMsg.isFavorite,
      pinMsg.togglePin,
      pinMsg.isPinned,
      reportMsg.report,
      reportMsg.hasReported,
    ]
  );

  const { transferConversation: handleTransfer } = useTransferConversation({
    contactId: conversation.contact.id ?? '',
    whatsappConnectionId: whatsappConnectionId ?? undefined,
  });

  const handleScheduleMessage = useChatScheduleMessage({
    contactId: conversation.contact.id ?? '',
    scheduleMessage,
    onDone: () => closeDialog('scheduleDialog'),
  });

  const stableOnToggleDetails = useCallback(() => {
    onToggleDetails?.();
  }, [onToggleDetails]);

  const handlePollSent = useCallback(async (poll: { name: string; options: string[] }) => {
    if (!isValidUUID(conversation.contact.id)) return;
    try {
      const ref = resolveContactRef(conversation.contact.id);
      if (!isUuidRef(ref)) return;
      await dbFrom('messages').insert({
        contact_id: ref.uuid,
        whatsapp_connection_id: whatsappConnectionId,
        content: `📊 *Enquete:* ${poll.name}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
        message_type: 'text',
        sender: 'agent',
        status: 'pending',
      });
    } catch (err) {
      log.error('Failed to insert poll message', err);
    }
  }, [conversation.contact.id, whatsappConnectionId]);

  const handleContactSent = useCallback(async (contactName: string) => {
    if (!isValidUUID(conversation.contact.id)) return;
    try {
      const ref = resolveContactRef(conversation.contact.id);
      if (!isUuidRef(ref)) return;
      await dbFrom('messages').insert({
        contact_id: ref.uuid,
        whatsapp_connection_id: whatsappConnectionId,
        content: `📇 Cartão de contato: ${contactName}`,
        message_type: 'text',
        sender: 'agent',
        status: 'pending',
      });
    } catch (err) {
      log.error('Failed to insert contact card message', err);
    }
  }, [conversation.contact.id, whatsappConnectionId]);

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
            onToggleDetails={stableOnToggleDetails}
            onStartCall={() => {
              setCallDirection('outbound');
              openDialog('callDialog');
            }}
            onOpenSearch={() => handleSetActiveTool('chatSearch')}
            onOpenValidation={isDevExact ? () => openDialog('visualValidation') : undefined}
            onResolveConversation={handlers.onResolveConversation}
            onArchiveConversation={handleArchiveConversation}
            onOpenTransfer={() => openDialog('transferDialog')}
            onOpenSchedule={() => openDialog('scheduleDialog')}
            onVoiceChange={setVoiceId}
            onSpeedChange={setSpeed}
            onBack={onBack}
            onGenerateSummary={() => handleSetActiveTool('aiAssistant')}
            onCloseConversation={() => openDialog('closeDialog')}
            failuresOnly={failuresOnly}
            failuresCount={failedMessages.length}
            hasMoreOlder={hasMoreOlder}
            onToggleFailuresOnly={() => setFailuresOnly((v) => !v)}
            activeTool={activeTool}
            whisperCount={whisperCount}
            onSetActiveTool={handleSetActiveTool}
          />
        )}

        {activeTool === 'templates' && (
          <ChatTemplatesOverlay
            contactName={conversation.contact.name ?? undefined}
            contactCompany={conversation.contact.company ?? undefined}
            onClose={() => setActiveTool(null)}
            onUseTemplate={(content) => {
              handlers.setInputValue(content);
              setActiveTool(null);
              if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
              focusTimerRef.current = setTimeout(() => handlers.inputRef.current?.focus(), 10);
            }}
          />
        )}

        <ChatSearchBar
          messages={messages}
          isOpen={activeTool === 'chatSearch'}
          onClose={() => {
            setActiveTool(null);
            if (focusTimerRef.current !== null) clearTimeout(focusTimerRef.current);
            focusTimerRef.current = setTimeout(() => handlers.inputRef.current?.focus(), 150);
          }}
          onNavigateToMessage={(id) => messagesAreaRef.current?.scrollToMessage(id)}
          onHighlightChange={handleHighlightChange}
          onSearchQueryChange={setSearchQuery}
        />

        <TicketActionsBar
          contactId={conversation.contact.id ?? ''}
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
          hasMoreOlder={hasMoreOlder}
        />

        <ChatPanelOverlays
          contactId={conversation.contact.id ?? ''}
          contactName={conversation.contact.name ?? ''}
          showVisualValidation={dialogs.visualValidation}
          onCloseVisualValidation={() => closeDialog('visualValidation')}
          showWhisper={dialogs.whisper}
        />

        <ChatMessagesArea
          ref={messagesAreaRef}
          messages={visibleMessages}
          isContactTyping={isContactTyping}
          typingUserName={typingUsers[0]?.name || 'Agente'}
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
          onSnoozeConversation={handleSnoozeFromToolbar}
          messageActions={messageActions}
          highlightedMessageIds={highlightedMessageIds}
          activeHighlightId={activeHighlightId}
          searchQuery={searchQuery}
          {/* Etapa 50: paginação desabilitada no modo de falhas — carregar mensagens
              mais antigas que não passariam no filtro seria desperdício de rede e
              geraria confusão (botão "carregar mais" sem resultado visível). */}
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
          contactId={conversation.contact.id}
          onUseSuggestion={(t) => handlers.setInputValue(t)}
        />

        <ChatInputArea
          inputValue={handlers.inputValue}
          replyToMessage={handlers.replyToMessage}
          editingMessage={handlers.editingMessage}
          isRecordingAudio={handlers.isRecordingAudio}
          showSlashCommands={dialogs.slashCommands}
          contactId={conversation.contact.id ?? ''}
          contactPhone={conversation.contact.phone ?? ''}
          contactName={conversation.contact.name ?? ''}
          instanceName={instanceName}
          messages={messages}
          quickReplies={dbQuickReplies}
          isSending={handlers.isSending}
          sendProgress={handlers.sendProgress}
          isWhisper={handlers.isWhisper}
          onToggleWhisper={() => handlers.setIsWhisper((v) => !v)}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleTypingStop}
          onSend={(att) => handlers.handleSend(att)}
          onCancelReply={() => handlers.setReplyToMessage(null)}
          onCancelEdit={handlers.handleCancelEdit}
          onEditStart={handlers.handleEditStart}
          onSlashCommand={handlers.handleSlashCommand}
          onCloseSlashCommands={() => closeDialog('slashCommands')}
          onQuickReply={handleQuickReply}
          onRecordToggle={() => handlers.setIsRecordingAudio((v) => !v)}
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
          onPollSent={handlePollSent}
          onContactSent={handleContactSent}
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
          contactId={conversation.contact.id ?? ''}
          onTransfer={handleTransfer}
          onScheduleMessage={handleScheduleMessage}
          onSendInteractiveMessage={handlers.handleSendInteractiveMessage}
          onForwardToTargets={handlers.handleForwardToTargets}
          onSendLocation={handlers.handleSendLocation}
          onSendProduct={handlers.handleSendProduct}
          onSetInputValue={handlers.setInputValue}
          onSelectSearchResult={(result) => {
            // BUG-24: resultado de mensagem navega direto na conversa;
            // demais tipos (contato, acao, crm) mostram um toast informativo.
            if (result.type === 'message' && result.id) {
              if (failuresOnly && !failedMessages.some((m) => m.id === result.id)) {
                toast({
                  title: 'Mensagem oculta pelo filtro',
                  description: 'Desative o filtro de falhas para navegar até esta mensagem.',
                });
                return;
              }
              messagesAreaRef.current?.scrollToMessage(result.id);
            } else {
              toast({ title: 'Resultado', description: result.title });
            }
          }}
        />
      </div>

      <ChatToolPanels
        activeTool={activeTool}
        onSetActiveTool={handleSetActiveTool}
        messages={messages}
        contactId={conversation.contact.id ?? ''}
        contactName={conversation.contact.name ?? ''}
        onSelectSuggestion={(text) => handlers.setInputValue(text)}
      />
      <ChatMonitoringDialog
        open={activeTool === 'monitoring'}
        onOpenChange={(open) => !open && handleSetActiveTool(null)}
        metrics={activeTool === 'monitoring' ? messageQueue?.getMetrics() : undefined}
      />
    </div>
  );
}
