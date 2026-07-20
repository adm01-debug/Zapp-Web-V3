import { CRMAutoSync } from './CRMAutoSync';
import { ChatToolPanels } from './chat/ChatToolPanels';
import { ChatDialogs } from './chat/ChatDialogs';
import { ChatPanelHeader } from './chat/ChatPanelHeader';
import { ChatAssignedBar } from './chat/ChatAssignedBar';
import { TicketActionsBar } from './chat/TicketActionsBar';
import { TicketHistorySheet } from './TicketHistorySheet';
import { ChatMessagesArea } from './chat/ChatMessagesArea';
import { ChatInputArea } from './chat/ChatInputArea';
import { AutomationSuggestionsBar } from './chat/AutomationSuggestionsBar';
import { SendErrorBanner } from './chat/SendErrorBanner';
import { ChatDragOverlay } from './chat/ChatDragOverlay';
import { ChatQuickRepliesPopover } from './chat/ChatQuickRepliesPopover';
import { ChatSearchBar } from './chat/ChatSearchBar';
import { FailureFilterBar } from './chat/FailureFilterBar';
import { ChatTemplatesOverlay } from './chat/ChatTemplatesOverlay';
import { ChatMonitoringDialog } from './chat/ChatMonitoringDialog';
import { ChatPanelOverlays } from './chat/ChatPanelOverlays';
import { useChatPanel } from './chat/useChatPanel';
import type { ChatPanelProps } from './chat/useChatPanel';

/** Re-exported module members. */
export type { ChatPanelProps };

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as Window).requestIdleCallback(() => {
    import('./TransferDialog');
    import('./AIConversationAssistant');
    import('./CloseConversationDialog');
  });
}

/** Chat Panel component. */
export function ChatPanel(props: ChatPanelProps) {
  const {
    conversation,
    messages,
    showDetails = false,
    onToggleDetails,
    onBack,
    hideHeader = false,
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
    handleHighlightChange,
    setSearchQuery,
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
    messageQueue,
  } = useChatPanel(props);

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
          onPollSent={handlePollSent}
          onContactSent={handleContactSent}
          onOpenCatalog={() => openDialog('catalogDirect')}
          onSelectSuggestion={(text) => handlers.setInputValue(text)}
          onSelectTemplate={(text) => handlers.setInputValue(text)}
          onOpenTeamFiles={() => handleSetActiveTool('teamFiles')}
          fileUploaderRef={fileUploaderRef}
          inputRef={handlers.inputRef}
          queue={messageQueue}
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
        metrics={undefined}
      />
    </div>
  );
}