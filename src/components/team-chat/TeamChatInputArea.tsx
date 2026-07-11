import { useRef, useState, useCallback, useEffect } from 'react';
import { useTeamChatDraft } from '@/hooks/useTeamChatDraft';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { RichTextToolbar, RichTextToggle } from '@/features/inbox';
import { AIRewriteButton } from '@/features/inbox';
import { TextToAudioButton } from '@/features/inbox';
import { MentionAutocomplete, useMentions } from '@/features/inbox';
import { MarkdownPreview } from '@/features/inbox';
import { StickerPicker } from '@/features/inbox';
import { AudioMemePicker } from '@/features/inbox';
import { VoiceChangerPicker } from '@/features/inbox';
import { CustomEmojiPicker } from '@/features/inbox';
import { AudioRecorder } from '@/features/inbox';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';
import { TeamFileUploader } from './TeamFileUploader';
import { useIsMobile } from '@/hooks/use-mobile';
import { TeamMessage } from '@/hooks/useTeamChat';
import { Send, Mic, Reply, X, Loader2, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface TeamChatInputAreaProps {
  conversationId: string;
  text: string;
  setText: (text: string) => void;
  replyTo: TeamMessage | null;
  isRecordingAudio: boolean;
  isPending: boolean;
  onSend: () => void;
  onCancelReply: () => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onSendSticker: (url: string) => void;
  onSendAudioMeme: (url: string) => void;
  onSendCustomEmoji: (url: string) => void;
  onFileSent: (mediaUrl: string, mediaType: string, fileName: string) => void;
}

export function TeamChatInputArea({
  conversationId,
  text,
  setText,
  replyTo,
  isRecordingAudio,
  isPending,
  onSend,
  onCancelReply,
  onRecordToggle,
  onAudioSend,
  onSendSticker,
  onSendAudioMeme,
  onSendCustomEmoji,
  onFileSent,
}: TeamChatInputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showRichToolbar, setShowRichToolbar] = useState(false);
  const [showMarkdownPreview, _setShowMarkdownPreview] = useState(false);
  const [sendAnimation, setSendAnimation] = useState(false);
  const isMobile = useIsMobile();

  const draft = useTeamChatDraft({ conversationId, text, setText, onFileSent });
  const {
    isOpen: mentionOpen,
    cursorPos: mentionCursorPos,
    checkForMention,
    handleSelect: handleMentionSelect,
    close: closeMention,
  } = useMentions(textareaRef);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendWithAnimation();
    }
  };

  const handleSendWithAnimation = useCallback(() => {
    if (!draft.hasText || draft.isOverLimit || isPending) return;
    setSendAnimation(true);
    draft.clearDraft();
    if (isMobile && navigator.vibrate) navigator.vibrate(50);
    onSend();
    setTimeout(() => setSendAnimation(false), 400);
  }, [draft.hasText, draft.isOverLimit, isPending, isMobile, onSend, draft.clearDraft]);

  const handleVoiceDictation = useCallback(
    (transcript: string) => {
      setText(text ? `${text} ${transcript}` : transcript);
      textareaRef.current?.focus();
    },
    [text, setText]
  );

  const secondaryTools = (
    <>
      <AIRewriteButton inputValue={text} onRewrite={(newText) => setText(newText)} />
      <StickerPicker onSendSticker={onSendSticker} />
      <AudioMemePicker onSendAudioMeme={(meme) => onSendAudioMeme(meme.audio_url)} />
      <VoiceChangerPicker onSendAudio={(url) => onSendAudioMeme(url)} />
      <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
      <RichTextToggle
        active={showRichToolbar}
        onToggle={() => setShowRichToolbar(!showRichToolbar)}
      />
      <VoiceDictationButton onTranscript={handleVoiceDictation} disabled={isRecordingAudio} />
    </>
  );

  return (
    <>
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-border bg-card px-3 pt-2"
          >
            <div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted/50 p-2">
              <Reply className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-primary">
                  {replyTo.sender?.name || 'Você'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {replyTo.content || 'Mídia'}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 shrink-0"
                onClick={onCancelReply}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RichTextToolbar
        inputRef={textareaRef}
        inputValue={text}
        onInputChange={setText}
        visible={showRichToolbar}
        onToggle={() => setShowRichToolbar(!showRichToolbar)}
      />

      <div
        className={cn(
          'border-t border-border bg-card px-4 py-3',
          isMobile && 'safe-area-bottom px-2.5 py-2'
        )}
      >
        <AnimatePresence>
          {isRecordingAudio && (
            <div className="mb-3">
              <AudioRecorder onSend={onAudioSend} onCancel={() => onRecordToggle()} />
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showMarkdownPreview && draft.hasText && showRichToolbar && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-1 max-h-[100px] overflow-y-auto rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
            >
              <MarkdownPreview text={text} className="leading-relaxed text-foreground" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1.5" role="toolbar" aria-label="Barra de mensagem">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'shrink-0 touch-manipulation text-muted-foreground hover:bg-muted hover:text-foreground',
                  isMobile ? 'h-10 w-10' : 'h-9 w-9'
                )}
                aria-label="Mais opções"
              >
                <Plus className="h-[18px] w-[18px]" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 border-border bg-popover p-2" align="start" side="top">
              <div className="flex flex-col gap-1">
                <TeamFileUploader conversationId={conversationId} onFileSent={onFileSent} />
              </div>
            </PopoverContent>
          </Popover>

          <div className="relative min-w-0 flex-1">
            <MentionAutocomplete
              inputValue={text}
              cursorPosition={mentionCursorPos}
              onSelect={handleMentionSelect}
              onClose={closeMention}
              isOpen={mentionOpen}
            />
            <textarea
              ref={textareaRef}
              value={text}
              aria-label="Digite sua mensagem para o chat da equipe"
              aria-multiline="true"
              tabIndex={0}
              onChange={(e) => {
                setText(e.target.value);
                checkForMention(e.target.value, e.target.selectionStart ?? 0);
              }}
              onKeyDown={handleKeyDown}
              onPaste={draft.handlePaste}
              autoFocus
              onClick={(e) => {
                const t = e.target as HTMLTextAreaElement;
                checkForMention(t.value, t.selectionStart ?? 0);
              }}
              placeholder="Digite uma mensagem... (/ para comandos, @ para mencionar)"
              rows={1}
              className={cn(
                'w-full resize-none rounded-xl border border-border/50 bg-transparent text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20',
                isMobile
                  ? 'max-h-[200px] min-h-[42px] px-3 py-2.5 text-[16px]'
                  : 'max-h-[200px] min-h-[40px] px-3 py-2',
                draft.isOverLimit &&
                  'border-destructive/50 focus:border-destructive focus:ring-destructive/20'
              )}
              aria-describedby={draft.charCount > 0 ? 'team-char-counter' : undefined}
            />
            {draft.charCount > 100 && (
              <span
                id="team-char-counter"
                className={cn(
                  'pointer-events-none absolute bottom-1 right-2 select-none text-[10px]',
                  draft.isOverLimit
                    ? 'font-medium text-destructive'
                    : draft.isNearLimit
                      ? 'text-warning'
                      : 'text-muted-foreground/50'
                )}
              >
                {draft.charCount}/{draft.CHAR_LIMIT}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSendWithAnimation}
                  disabled={!draft.hasText || draft.isOverLimit || isPending}
                  size="icon"
                  className={cn(
                    'shrink-0 touch-manipulation rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40',
                    isMobile ? 'h-11 w-11' : 'h-10 w-10',
                    sendAnimation && 'motion-safe:animate-pulse'
                  )}
                >
                  {isPending ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin" />
                  ) : (
                    <Send className="h-[18px] w-[18px]" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Enviar (Enter)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className={cn(
                    'shrink-0 touch-manipulation rounded-full transition-all active:scale-95',
                    isMobile ? 'h-11 w-11' : 'h-10 w-10',
                    isRecordingAudio
                      ? 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30'
                      : 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90'
                  )}
                  onClick={onRecordToggle}
                >
                  <Mic className={cn('h-5 w-5', isRecordingAudio && 'motion-safe:animate-pulse')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}
              </TooltipContent>
            </Tooltip>
          </div>

          {!isMobile && (
            <div className="flex shrink-0 items-center gap-0.5">
              {secondaryTools}
              <TextToAudioButton inputValue={text} onAudioReady={onAudioSend} />
            </div>
          )}
          {isMobile && (
            <div className="flex shrink-0 items-center gap-0.5">
              <TeamFileUploader conversationId={conversationId} onFileSent={onFileSent} />
            </div>
          )}
        </div>

        {isMobile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="scrollbar-none mt-1.5 flex items-center gap-1 overflow-x-auto pb-0.5"
            role="toolbar"
            aria-label="Ferramentas de formatação"
          >
            {secondaryTools}
          </motion.div>
        )}
      </div>
    </>
  );
}
