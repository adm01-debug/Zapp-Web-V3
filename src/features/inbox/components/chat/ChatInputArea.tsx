import { useMemo, useEffect, useRef } from 'react';
import { isFeatureEnabled } from '@/lib/featureFlags';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import { RichTextToolbar } from './RichTextToolbar';
import { AIRewriteButton } from './AIRewriteButton';
import { MentionAutocomplete, useMentions } from './MentionAutocomplete';
import { MarkdownPreview } from './MarkdownPreview';
import { SlashCommands, SlashCommand } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { FileUploaderRef } from '../FileUploader';
import { ExternalProduct } from '@/hooks/useExternalCatalog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SecondaryToolbar, TertiaryToolsMenu } from './ChatInputToolbars';
import { StickerPicker } from '../StickerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { RichTextToggle } from './RichTextToolbar';
import {
  Send,
  Mic,
  Check,
  Plus,
  Loader2,
  X,
  Image as ImageIcon,
  FileText,
  FileVideo,
  FileAudio,
  Clock,
} from 'lucide-react';
import { InputPreviewBars } from './InputPreviewBars';
import { useChatInputLogic, setNativeValue } from './useChatInputLogic';
import { playNotificationSound } from '@/utils/notificationSounds';
import { formatFileSize } from '@/utils/whatsappFileTypes';

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatInputAreaProps {
  inputValue: string;
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  isRecordingAudio: boolean;
  showSlashCommands: boolean;
  contactId: string;
  contactPhone: string;
  contactName: string;
  instanceName?: string;
  onPollSent?: (poll: { name: string; options: string[]; selectableCount: number }) => void;
  onContactSent?: (contactName: string) => void;
  messages: Message[];
  quickReplies: QuickReplyItem[];
  isSending?: boolean;
  sendProgress?: number;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
  onSend: (attachments?: File[]) => void;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
  onSlashCommand: (command: SlashCommand, subCommand?: string) => void;
  onCloseSlashCommands: () => void;
  onQuickReply: (reply: QuickReplyItem) => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onAudioCancel: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSendSticker: (stickerUrl: string) => void;
  onSendAudioMeme: (audioUrl: string) => void;
  onSendCustomEmoji: (emojiUrl: string) => void;
  onOpenCatalog?: () => void;
  onSelectSuggestion: (text: string) => void;
  onSelectTemplate: (text: string) => void;
  onExternalFiles?: (files: File[]) => void;
  onPasteFiles?: (files: File[]) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
  onToggleSignature?: () => void;
  isWhisper?: boolean;
  onToggleWhisper?: () => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onOpenTeamFiles?: () => void;
  queue?: any[];
  onRetry?: (id: string) => void;
  onRemoveFromQueue?: (id: string) => void;
}

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
    sendProgress: _sendProgress = 0,
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
    queue: _queue,
    onRetry: _onRetry,
    onRemoveFromQueue: _onRemoveFromQueue,
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

  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(inputRef);

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
    ]
  );

  const typingNotification = useMemo(() => {
    if (isWhisper) return 'Modo Sussurro: Notas internas invisíveis ao cliente';
    return null;
  }, [isWhisper]);

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
      <AnimatePresence>
        {logic.attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border/50 bg-background/80 px-4 py-2 backdrop-blur-sm"
          >
            <div className="flex flex-wrap gap-2">
              {logic.attachments.map((att) => (
                <motion.div
                  key={att.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
                >
                  {att.preview ? (
                    <img src={att.preview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 p-1 text-muted-foreground">
                      {att.category === 'video' ? (
                        <FileVideo className="h-6 w-6" />
                      ) : att.category === 'audio' ? (
                        <FileAudio className="h-6 w-6" />
                      ) : att.category === 'image' ? (
                        <ImageIcon className="h-6 w-6" />
                      ) : (
                        <FileText className="h-6 w-6" />
                      )}
                      <span className="max-w-full truncate text-center text-[8px]">
                        {att.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => logic.removeAttachment(att.id)}
                    className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 text-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="backdrop-blur-xs absolute bottom-0 left-0 right-0 bg-background/60 px-1 py-0.5">
                    <span className="block truncate text-[8px] font-medium">
                      {formatFileSize(att.file.size)}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isSending || props.queue?.length > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-primary/10 bg-primary/5 px-4 py-1.5"
          >
            {props.queue?.map((item: any) => (
              <div key={item.id} className="group mb-2 last:mb-0">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {item.status === 'sending' ? (
                      <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    ) : item.status === 'failed' ? (
                      <X className="h-3 w-3 text-destructive" />
                    ) : item.status === 'confirmed' ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Clock className="h-3 w-3 text-muted-foreground/50" />
                    )}
                    <div className="flex flex-col">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase tracking-wider',
                          item.status === 'failed'
                            ? 'text-destructive'
                            : item.status === 'confirmed'
                              ? 'text-success'
                              : 'text-primary'
                        )}
                      >
                        {item.status === 'failed'
                          ? 'Erro no envio'
                          : item.status === 'sending'
                            ? 'Enviando...'
                            : item.status === 'confirmed'
                              ? 'Enviado!'
                              : 'Aguardando na fila...'}
                      </span>
                      {item.error && (
                        <span className="line-clamp-1 text-[9px] italic text-destructive/80">
                          {item.error?.message || String(item.error)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'failed' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => props.onRetry?.(item.id)}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-black text-primary transition-colors hover:text-primary/80"
                        >
                          Tentar novamente
                        </button>
                        <button
                          onClick={() => props.onRemoveFromQueue?.(item.id)}
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-black text-destructive transition-colors hover:text-destructive/80"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    <span
                      className={cn(
                        'text-[10px] font-black tabular-nums',
                        item.status === 'failed' ? 'text-destructive' : 'text-primary'
                      )}
                    >
                      {item.status === 'failed' ? '!' : `${Math.round(item.progress || 0)}%`}
                    </span>
                  </div>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                  <motion.div
                    className={cn(
                      'h-full',
                      item.status === 'failed'
                        ? 'bg-destructive'
                        : item.status === 'confirmed'
                          ? 'bg-success'
                          : 'bg-primary'
                    )}
                    initial={{ width: 0 }}
                    animate={{
                      width: item.status === 'failed' ? '100%' : `${item.progress || 0}%`,
                    }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  />
                </div>
                {item.attempts?.length > 0 && (
                  <div className="mt-1 hidden border-t border-primary/5 pt-1 group-hover:block">
                    <div className="flex items-center justify-between text-[8px] text-muted-foreground">
                      <span>
                        {item.attempts.length}{' '}
                        {item.attempts.length === 1 ? 'tentativa' : 'tentativas'}
                      </span>
                      {item.attempts[item.attempts.length - 1].duration && (
                        <span>{item.attempts[item.attempts.length - 1].duration}ms</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
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

        {/* Improved Message Queue Stats */}
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
          {/* SINGLE ROW: [+] [textarea] [secondary tools] [mic] [send] */}
          <div className="flex w-full items-end gap-1.5">
            {/* "+" Button (first) */}
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

            {/* Textarea (second) */}
            <div className="relative min-w-0 flex-1">
              <MentionAutocomplete
                inputValue={inputValue}
                cursorPosition={mentionCursorPos}
                onSelect={handleMentionSelect}
                onClose={closeMention}
                isOpen={mentionOpen}
              />

              <AnimatePresence>
                {logic.showMarkdownPreview && logic.hasText && logic.showRichToolbar && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="mb-2 max-h-[120px] overflow-y-auto rounded-2xl border border-border/10 bg-muted/20 px-4 py-3 text-[13px] shadow-sm backdrop-blur-sm"
                  >
                    <MarkdownPreview
                      text={inputValue}
                      className="leading-snug text-foreground/90"
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => {
                  onInputChange(e);
                  checkForMention(e.target.value, e.target.selectionStart ?? 0);
                }}
                onKeyDown={(e) => {
                  // Enter to send, Shift+Enter for new line
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!isSending && logic.canSend) {
                      logic.handleSendWithAnimation();
                    }
                    return;
                  }

                  onKeyDown(e);
                  if (e.key === 'ArrowUp' && !inputValue && messages.length > 0) {
                    const lastOwnMessage = [...messages]
                      .reverse()
                      .find((m) => m.sender === 'agent' && !m.is_deleted);
                    if (lastOwnMessage && props.onCancelEdit && props.onCancelReply) {
                      // This is a heuristic shortcut for accessibility
                      // In a full implementation, we'd pass onEditStart as a prop
                      e.preventDefault();
                    }
                  }
                }}
                onBlur={onBlur}
                onPaste={logic.handlePaste}
                onClick={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  checkForMention(t.value, t.selectionStart ?? 0);
                }}
                placeholder={
                  editingMessage
                    ? 'Editar mensagem...'
                    : replyToMessage
                      ? 'Digite sua resposta...'
                      : isWhisper
                        ? 'Sussurro interno (apenas agentes)...'
                        : 'Escreva sua mensagem...'
                }
                rows={1}
                className={cn(
                  'w-full rounded-[24px] border border-border/10 bg-muted/30 text-[15px] font-semibold tracking-normal text-foreground shadow-sm outline-none hover:bg-muted/50 focus:border-primary/20 focus:bg-background',
                  'resize-none transition-all duration-500 ease-out placeholder:font-normal placeholder:text-muted-foreground/30',
                  'focus:shadow-lg focus:ring-4 focus:ring-primary/5',
                  logic.isMobile
                    ? 'max-h-[160px] min-h-[48px] px-5 py-3.5 text-[16px]'
                    : 'max-h-[220px] min-h-[48px] px-5 py-[14px]',
                  isWhisper &&
                    'border-warning/20 bg-warning/5 ring-amber-500/30 focus:bg-warning/10',
                  logic.isOverLimit && 'text-destructive',
                  isSending && 'pointer-events-none opacity-60'
                )}
                disabled={isSending}
                aria-label={
                  editingMessage
                    ? 'Editar mensagem'
                    : replyToMessage
                      ? 'Responder mensagem'
                      : 'Digite sua mensagem'
                }
                aria-describedby={logic.charCount > 0 ? 'char-counter' : undefined}
              />
              {logic.charCount > 100 && (
                <span
                  id="char-counter"
                  className={cn(
                    'pointer-events-none absolute bottom-2 right-4 select-none text-[9px] tracking-tighter transition-colors',
                    logic.isOverLimit
                      ? 'font-bold text-destructive'
                      : logic.isNearLimit
                        ? 'text-warning'
                        : 'text-muted-foreground/30'
                  )}
                >
                  {logic.charCount}/{logic.CHAR_LIMIT}
                </span>
              )}
            </div>

            {/* Send + Mic (third and fourth) — always glowing in primary/blue */}
            <div className="mb-[1px] flex shrink-0 items-center gap-2 self-end">
              {isSending && !logic.isMobile && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-[10px] font-black uppercase tracking-tighter text-primary/60"
                >
                  Enviando...
                </motion.span>
              )}
              {/* SEND */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={() => logic.handleSendWithAnimation()}
                    disabled={isSending}
                    whileHover={!isSending ? { scale: 1.1 } : {}}
                    whileTap={!isSending ? { scale: 0.9 } : {}}
                    className={cn(
                      'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                      logic.canSend
                        ? 'bg-primary text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/0.55),0_0_36px_hsl(var(--primary)/0.35)] ring-2 ring-primary/40 hover:shadow-[0_0_24px_hsl(var(--primary)/0.7),0_0_48px_hsl(var(--primary)/0.45)]'
                        : 'cursor-not-allowed bg-muted text-muted-foreground opacity-50 hover:bg-muted/80',
                      logic.isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
                    )}
                    aria-label={isSending ? 'Enviando mensagem...' : 'Enviar mensagem'}
                    aria-disabled={isSending || !logic.canSend}
                  >
                    <AnimatePresence mode="wait">
                      {isSending ? (
                        <motion.div
                          key="loading"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </motion.div>
                      ) : editingMessage ? (
                        <motion.div
                          key="edit"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Check className="h-6 w-6" />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="send"
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                        >
                          <Send className="h-6 w-6" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[200px] rounded-lg border-none bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground shadow-xl"
                >
                  {isSending
                    ? '🚀 Mensagem sendo processada...'
                    : logic.isOverLimit
                      ? '⚠️ Limite de caracteres excedido'
                      : !logic.canSend
                        ? '📎 Clique para anexar arquivo'
                        : editingMessage
                          ? '✅ Confirmar alterações'
                          : '🚀 Enviar mensagem (Enter)'}
                </TooltipContent>
              </Tooltip>

              {/* MIC */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={onRecordToggle}
                    disabled={isSending || logic.canSend}
                    whileHover={!(isSending || logic.canSend) ? { scale: 1.1 } : {}}
                    whileTap={!(isSending || logic.canSend) ? { scale: 0.9 } : {}}
                    className={cn(
                      'inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2',
                      logic.isMicActive
                        ? 'z-10 scale-110 bg-destructive text-foreground shadow-[0_0_24px_rgba(244,63,94,0.7),0_0_48px_rgba(244,63,94,0.45)] ring-2 ring-rose-400/60 hover:bg-destructive'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      !logic.isMicActive &&
                        (isSending || logic.canSend) &&
                        'cursor-not-allowed opacity-50',
                      logic.isMobile ? 'h-11 w-11' : 'h-[46px] w-[46px]'
                    )}
                    aria-label={logic.isMicActive ? 'Parar gravação' : 'Gravar áudio'}
                    aria-disabled={isSending || logic.canSend}
                    aria-pressed={logic.isMicActive}
                  >
                    <Mic className={cn('h-6 w-6', logic.isMicActive && 'animate-pulse')} />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="max-w-[200px] rounded-lg border-none bg-destructive px-3 py-1.5 text-[10px] font-medium text-foreground shadow-xl"
                >
                  {logic.isMicActive
                    ? '🔴 Gravando... Clique para parar'
                    : logic.canSend
                      ? '🚫 Limpe o texto para gravar áudio'
                      : isSending
                        ? '⏳ Aguarde o envio para gravar'
                        : '🎤 Gravar áudio (Segure ou clique)'}
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Secondary toolbar (last) */}
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
