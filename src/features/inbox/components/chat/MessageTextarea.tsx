import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import { MentionAutocomplete, useMentions } from './MentionAutocomplete';
import { MarkdownPreview } from './MarkdownPreview';
import { asRef } from '@/lib/reactRefs';

interface MessageTextareaProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
  onPaste: React.ClipboardEventHandler<HTMLTextAreaElement>;
  editingMessage?: Message | null;
  replyToMessage: Message | null;
  isWhisper?: boolean;
  isSending: boolean;
  canSend: boolean;
  onSend: () => void;
  showMarkdownPreview: boolean;
  hasText: boolean;
  showRichToolbar: boolean;
  charCount: number;
  isOverLimit: boolean;
  isNearLimit: boolean;
  charLimit: number;
  messages: Message[];
  isMobile: boolean;
}

/** Message Textarea component for the chat section. */
export function MessageTextarea({
  inputRef,
  inputValue,
  onInputChange,
  onKeyDown,
  onBlur,
  onPaste,
  editingMessage,
  replyToMessage,
  isWhisper,
  isSending,
  canSend,
  onSend,
  showMarkdownPreview,
  hasText,
  showRichToolbar,
  charCount,
  isOverLimit,
  isNearLimit,
  charLimit,
  messages,
  isMobile,
}: MessageTextareaProps) {
  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(inputRef);

  return (
    <div className="relative min-w-0 flex-1">
      <MentionAutocomplete
        inputValue={inputValue}
        cursorPosition={mentionCursorPos}
        onSelect={handleMentionSelect}
        onClose={closeMention}
        isOpen={mentionOpen}
      />

      <AnimatePresence>
        {showMarkdownPreview && hasText && showRichToolbar && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="mb-2 max-h-[120px] overflow-y-auto rounded-2xl border border-border/10 bg-muted/20 px-4 py-3 text-[13px] shadow-sm backdrop-blur-sm"
          >
            <MarkdownPreview text={inputValue} className="leading-snug text-foreground/90" />
          </motion.div>
        )}
      </AnimatePresence>

      <textarea
        ref={asRef(inputRef)}
        value={inputValue}
        onChange={(e) => {
          onInputChange(e);
          checkForMention(e.target.value, e.target.selectionStart ?? 0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isSending && canSend) {
              onSend();
            }
            return;
          }
          onKeyDown(e);
          if (e.key === 'ArrowUp' && !inputValue && messages.length > 0) {
            const lastOwnMessage = [...messages]
              .reverse()
              .find((m) => m.sender === 'agent' && !m.is_deleted);
            if (lastOwnMessage) {
              e.preventDefault();
            }
          }
        }}
        onBlur={onBlur}
        onPaste={onPaste}
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
          isMobile
            ? 'max-h-[160px] min-h-[48px] px-5 py-3.5 text-[16px]'
            : 'max-h-[220px] min-h-[48px] px-5 py-[14px]',
          isWhisper && 'border-warning/20 bg-warning/5 ring-amber-500/30 focus:bg-warning/10',
          isOverLimit && 'text-destructive',
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
        aria-describedby={charCount > 0 ? 'char-counter' : undefined}
      />
      {charCount > 100 && (
        <span
          id="char-counter"
          className={cn(
            'pointer-events-none absolute bottom-2 right-4 select-none text-[9px] tracking-tighter transition-colors',
            isOverLimit
              ? 'font-bold text-destructive'
              : isNearLimit
                ? 'text-warning'
                : 'text-muted-foreground/30'
          )}
        >
          {charCount}/{charLimit}
        </span>
      )}
    </div>
  );
}
