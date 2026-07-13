import { useMemo, useEffect, useRef } from 'react';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RichTextToolbar } from './RichTextToolbar';
import { AIRewriteButton } from './AIRewriteButton';
import { SlashCommands } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { SecondaryToolbar, TertiaryToolsMenu } from './ChatInputToolbars';
import { StickerPicker } from '../StickerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { RichTextToggle } from './RichTextToolbar';
import { InputPreviewBars } from './InputPreviewBars';
import { useChatInputLogic, setNativeValue } from './useChatInputLogic';
import { playNotificationSound } from '@/utils/notificationSounds';
import { AttachmentPreviewStrip } from './AttachmentPreviewStrip';
import { QueueProgressPanel } from './QueueProgressPanel';
import { MessageTextarea } from './MessageTextarea';
import { SendMicButtons } from './SendMicButtons';
import type { ChatInputAreaProps } from './chatInputTypes';

export type { ChatInputAreaProps, QuickReplyItem } from './chatInputTypes';

export function ChatInputArea(props: ChatInputAreaProps) {
  const {
    inputValue,
    replyToMessage,
    editingMessage,
    isRecordingAudio,
    showSlashCommands,
    contactId,
    contactPhone,
    contactName,
    instanceName,
    onPollSent,
    onContactSent,
    messages,
    quickReplies,
    isSending = false,
    onInputChange,
    onKeyDown,
    onBlur,
    onSend,
    onCancelReply,
    onCancelEdit,
    onSlashCommand,
    onCloseSlashCommands,
    onQuickReply,
    onRecordToggle,
    onAudioSend,
    onAudioCancel,
    onOpenInteractiveBuilder,
    onOpenSchedule,
    onOpenLocationPicker,
    onSendProduct,
    onSendSticker,
    onSendAudioMeme,
    onSendCustomEmoji,
    onOpenCatalog,
    onSelectSuggestion,
    onSelectTemplate,
    onPasteFiles,
    signatureEnabled,
    signatureName,
    onToggleSignature,
    isWhisper,
    onToggleWhisper,
    fileUploaderRef,
    inputRef,
    onOpenTeamFiles,
  } = props;

  const prevRecordingRef = useRef(isRecordingAudio);

  useEffect(() => {
    if (isRecordingAudio && !prevRecordingRef.current) {
      playNotificationSound('record_start', 'soft');
    } else if (!isRecordingAudio && prevRecordingRef.current) {
      playNotificationSound('record_stop', 'soft');
    }
    prevRecordingRef.current = isRecordingAudio;
  }, [isRecordingAudio]);

  const logic = useChatInputLogic({
    inputValue,
    contactId,
    editingMessage,
    inputRef,
    fileUploaderRef,
    onSend,
    onPasteFiles,
    isRecordingAudio,
  });

  const isV2AudioEnabled = isFeatureEnabled('v2_audio_recorder');
  const isRetryEnabled = isFeatureEnabled('message_queue_retry');

  const tertiaryTools = useMemo(
    () => (
      <TertiaryToolsMenu
        instanceName={instanceName}
        contactPhone={contactPhone}
        contactName={contactName}
        messages={messages}
        quickReplies={quickReplies}
        onOpenInteractiveBuilder={onOpenInteractiveBuilder}
        onOpenLocationPicker={onOpenLocationPicker}
        onOpenSchedule={onOpenSchedule}
        onSendProduct={onSendProduct}
        onSelectSuggestion={onSelectSuggestion}
        onSelectTemplate={onSelectTemplate}
        onQuickReply={onQuickReply}
        signatureEnabled={signatureEnabled}
        signatureName={signatureName}
        onToggleSignature={onToggleSignature}
        onPollSent={onPollSent}
        onContactSent={onContactSent}
        onOpenTeamFiles={onOpenTeamFiles}
      />
    ),
    [
      instanceName,
      contactPhone,
      contactName,
      messages,
      quickReplies,
      onOpenInteractiveBuilder,
      onOpenLocationPicker,
      onOpenSchedule,
      onSendProduct,
      onSelectSuggestion,
      onSelectTemplate,
      signatureEnabled,
      signatureName,
      onToggleSignature,
      onPollSent,
      onContactSent,
      onOpenTeamFiles,
      onQuickReply,
    ]
  );

  const typingNotification = isWhisper
    ? 'Modo Sussurro: Notas internas invisíveis ao cliente'
    : null;

  return (
    <>
      <RichTextToolbar
        inputRef={inputRef}
        inputValue={inputValue}
        onInputChange={(val) => setNativeValue(inputRef, val)}
        visible={logic.showRichToolbar}
        onToggle={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
      />

      <InputPreviewBars
        replyToMessage={replyToMessage}
        editingMessage={editingMessage}
        onCancelReply={onCancelReply}
        onCancelEdit={onCancelEdit}
      />

      <AttachmentPreviewStrip attachments={logic.attachments} onRemove={logic.removeAttachment} />

      <QueueProgressPanel
        queue={props.queue}
        isSending={isSending}
        onRetry={props.onRetry}
        onRemoveFromQueue={props.onRemoveFromQueue}
      />

      <div
        className={cn(
          'relative flex shrink-0 flex-col gap-3 border-t border-border/10 bg-background/95 px-4 py-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] backdrop-blur-3xl transition-all duration-500 md:px-10 md:py-6',
          isWhisper && 'border-t-2 border-warning bg-warning/10 shadow-warning/10',
          logic.isMobile && 'safe-area-bottom px-3 py-4 pb-8'
        )}
        role="form"
        aria-label="Área de composição de mensagem"
      >
        <AnimatePresence>
          {isRecordingAudio && isV2AudioEnabled && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mb-4 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 shadow-lg shadow-rose-500/5 backdrop-blur-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-destructive shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-destructive">
                    Gravando Áudio
                  </span>
                </div>
                <div className="flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-2 py-0.5">
                  <span className="text-[10px] font-bold text-destructive">LIVE</span>
                </div>
              </div>
              <AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} />
            </motion.div>
          )}
        </AnimatePresence>

        {isRetryEnabled && props.queue && props.queue.length > 0 && (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-2 py-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Sincronização Ativa
                </span>
              </div>
              <div className="mx-1 h-3 w-px bg-border" />
              <span className="text-[10px] font-medium text-muted-foreground">
                {props.queue.length}{' '}
                {props.queue.length === 1 ? 'mensagem pendente' : 'mensagens pendentes'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-success">
              <Check className="h-3 w-3" /> Online
            </div>
          </div>
        )}

        <SlashCommands
          inputValue={inputValue}
          onSelectCommand={onSlashCommand}
          onClose={onCloseSlashCommands}
          isOpen={showSlashCommands}
        />

        {typingNotification && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-10 left-8 z-50 flex items-center gap-2"
          >
            <div className="h-2 w-2 animate-pulse rounded-full bg-warning shadow-[0_0_12px_rgba(245,158,11,0.8)]" />
            <span className="rounded-2xl border border-warning/40 bg-background/90 px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-warning-foreground shadow-xl backdrop-blur-md dark:bg-warning/80 dark:text-warning-foreground">
              {typingNotification}
            </span>
          </motion.div>
        )}

        <div className="flex flex-col gap-2" role="toolbar" aria-label="Barra de mensagem">
          <div className="flex w-full items-end gap-1.5">
            {/* "+" Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    'inline-flex shrink-0 items-center justify-center self-end rounded-full text-[hsl(var(--muted-foreground))] outline-none transition-all hover:bg-muted/10 focus-visible:ring-2 focus-visible:ring-primary',
                    logic.isMobile ? 'mb-0.5 h-11 w-11' : 'mb-[3px] h-[42px] w-[42px]'
                  )}
                  aria-label="Mais opções de mensagem"
                >
                  <Plus className="h-6 w-6" />
                </motion.button>
              </PopoverTrigger>
              <PopoverContent
                className="w-60 border-border/40 bg-popover/95 p-2 shadow-2xl backdrop-blur-md duration-300 animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2"
                align="start"
                side="top"
              >
                {tertiaryTools}
              </PopoverContent>
            </Popover>

            <MessageTextarea
              inputRef={inputRef}
              inputValue={inputValue}
              onInputChange={onInputChange}
              onKeyDown={onKeyDown}
              onBlur={onBlur}
              onPaste={logic.handlePaste}
              editingMessage={editingMessage}
              replyToMessage={replyToMessage}
              isWhisper={isWhisper}
              isSending={isSending}
              canSend={logic.canSend}
              onSend={logic.handleSendWithAnimation}
              showMarkdownPreview={logic.showMarkdownPreview}
              hasText={logic.hasText}
              showRichToolbar={logic.showRichToolbar}
              charCount={logic.charCount}
              isOverLimit={logic.isOverLimit}
              isNearLimit={logic.isNearLimit}
              charLimit={logic.CHAR_LIMIT}
              messages={messages}
              isMobile={logic.isMobile}
            />

            <SendMicButtons
              isSending={isSending}
              canSend={logic.canSend}
              isOverLimit={logic.isOverLimit}
              isMicActive={logic.isMicActive}
              isMobile={logic.isMobile}
              isEditing={!!editingMessage}
              onSend={logic.handleSendWithAnimation}
              onRecordToggle={onRecordToggle}
            />

            {/* Secondary toolbar */}
            <div
              className={cn(
                'mb-[3px] flex shrink-0 items-center self-end',
                logic.isMobile && 'mb-0'
              )}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      isSending || !!editingMessage || isRecordingAudio ? 'cursor-not-allowed' : ''
                    )}
                  >
                    <SecondaryToolbar
                      inputRef={inputRef}
                      inputValue={inputValue}
                      showRichToolbar={logic.showRichToolbar}
                      onToggleRichToolbar={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
                      isRecordingAudio={isRecordingAudio}
                      onSendSticker={onSendSticker}
                      onSendAudioMeme={onSendAudioMeme}
                      onSendCustomEmoji={onSendCustomEmoji}
                      onOpenCatalog={onOpenCatalog}
                      onAudioSend={onAudioSend}
                      fileUploaderRef={fileUploaderRef}
                      instanceName={instanceName}
                      contactPhone={contactPhone}
                      contactId={contactId}
                      contactName={contactName}
                      onVoiceDictation={logic.handleVoiceDictation}
                      onFileSelect={logic.handleFileSelect}
                      isWhisper={isWhisper}
                      onToggleWhisper={onToggleWhisper}
                      disabled={isSending || !!editingMessage || isRecordingAudio}
                    />
                  </div>
                </TooltipTrigger>
                {(isSending || !!editingMessage || isRecordingAudio) && (
                  <TooltipContent
                    side="top"
                    className="border-border bg-muted text-[10px] font-medium text-muted-foreground shadow-md"
                  >
                    {isSending
                      ? 'Aguarde o envio concluir'
                      : editingMessage
                        ? 'Finalize a edição para usar ferramentas'
                        : 'Finalize a gravação para usar ferramentas'}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </div>
        </div>

        {logic.isMobile && logic.hasText && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="scrollbar-none mt-1.5 flex items-center gap-1.5 overflow-x-auto pb-0.5"
          >
            <AIRewriteButton
              inputValue={inputValue}
              contactName={contactName}
              onRewrite={(newText) => setNativeValue(inputRef, newText)}
            />
            <RichTextToggle
              active={logic.showRichToolbar}
              onToggle={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
            />
            <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
            <StickerPicker onSendSticker={onSendSticker} />
          </motion.div>
        )}
      </div>
    </>
  );
}
