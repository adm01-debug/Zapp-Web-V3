import { useRef, forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { ReplyPreview } from '../ReplyQuote';
import { SlashCommands, SlashCommand } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { FileUploader, FileUploaderRef } from '../FileUploader';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, Smile, Plus, Loader2 } from 'lucide-react';
import { AIEnhanceButton } from './AIEnhanceButton';
import { InputExtraTools } from './InputExtraTools';
import { ChatAttachmentsPreview } from './ChatAttachmentsPreview';
import { ChatSendProgress } from './ChatSendProgress';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { validateFile, formatFileSize } from '@/utils/whatsappFileTypes';
import type { QuickReply } from '@/types/chat';

export interface QueuedFile {
  id: string;
  file: File;
  preview?: string;
  category: string;
}

interface ChatMessageInputProps {
  inputValue: string;
  replyToMessage: Message | null;
  isRecordingAudio: boolean;
  showSlashCommands: boolean;
  contactId: string;
  contactPhone: string;
  contactName: string;
  messages: Message[];
  quickReplies: QuickReply[];
  onInputChange: (value: string) => void;
  onSend: (attachments?: File[]) => void;
  onCancelReply: () => void;
  onSlashCommand: (command: SlashCommand, subCommand?: string) => void;
  onCloseSlashCommands: () => void;
  onQuickReply: (reply: QuickReply) => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onAudioCancel: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onExternalFiles?: (files: File[]) => void;
  isSending?: boolean;
  sendProgress?: number;
}

export interface ChatMessageInputRef {
  focus: () => void;
  handleExternalFiles: (files: File[]) => void;
}

export const ChatMessageInput = forwardRef<ChatMessageInputRef, ChatMessageInputProps>(
  (
    {
      inputValue,
      replyToMessage,
      isRecordingAudio,
      showSlashCommands,
      contactId,
      contactPhone,
      contactName,
      messages,
      quickReplies,
      onInputChange,
      onSend,
      onCancelReply,
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
      onTypingStart,
      onTypingStop,
      isSending = false,
      sendProgress = 0,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileUploaderRef = useRef<FileUploaderRef>(null);
    const isMobile = useIsMobile();
    const [attachments, setAttachments] = useState<QueuedFile[]>([]);

    const handleFileSelect = useCallback((file: File) => {
      const validation = validateFile(file);
      if (!validation.valid) {
        toast({ title: 'Arquivo inválido', description: validation.error, variant: 'destructive' });
        return;
      }

      const preview =
        validation.category === 'image' || file.type === 'application/pdf'
          ? URL.createObjectURL(file)
          : undefined;

      setAttachments((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substr(2, 9),
          file,
          preview,
          category: validation.category || 'document',
        },
      ]);
    }, []);

    const removeAttachment = useCallback((id: string) => {
      setAttachments((prev) => {
        const att = prev.find((a) => a.id === id);
        if (att?.preview) URL.revokeObjectURL(att.preview);
        return prev.filter((a) => a.id !== id);
      });
    }, []);

    const handleSend = () => {
      onSend(attachments.map((a) => a.file));
      setAttachments([]);
    };

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      handleExternalFiles: (files: File[]) => fileUploaderRef.current?.handleExternalFiles(files),
    }));

    const autoResize = useCallback((el: HTMLTextAreaElement) => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      onInputChange(value);
      autoResize(e.target);
      if (value.length > 0) onTypingStart();
      else onTypingStop();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (showSlashCommands && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown'))
        return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape' && showSlashCommands) onCloseSlashCommands();
    };

    const extraTools = (
      <InputExtraTools
        isRecordingAudio={isRecordingAudio}
        messages={messages}
        contactName={contactName}
        quickReplies={quickReplies}
        onInputChange={onInputChange}
        onQuickReply={onQuickReply}
        onRecordToggle={onRecordToggle}
        onOpenInteractiveBuilder={onOpenInteractiveBuilder}
        onOpenSchedule={onOpenSchedule}
        onOpenLocationPicker={onOpenLocationPicker}
        onSendProduct={onSendProduct}
      />
    );

    return (
      <>
        <AnimatePresence>
          {replyToMessage && <ReplyPreview message={replyToMessage} onCancel={onCancelReply} />}
        </AnimatePresence>

        <ChatAttachmentsPreview attachments={attachments} onRemove={removeAttachment} />
        <ChatSendProgress isSending={isSending} sendProgress={sendProgress} />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'border-t border-border/50 bg-background/95 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] backdrop-blur-md',
            isMobile ? 'safe-area-bottom p-3' : 'p-4'
          )}
        >
          <div className="flex items-end gap-1">
            <FileUploader
              ref={fileUploaderRef}
              instanceName={contactId}
              recipientNumber={contactPhone}
              contactId={contactId}
              connectionId={undefined}
              onFileSelect={handleFileSelect}
              onFileSent={() =>
                toast({
                  title: 'Arquivo enviado!',
                  description: 'O arquivo foi enviado com sucesso via WhatsApp.',
                })
              }
              showDialog={false}
            />

            {isMobile ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 flex-shrink-0 touch-manipulation text-muted-foreground hover:bg-primary/10 hover:text-primary active:scale-95"
                    aria-label="Mais opções"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="glass-strong w-auto border-border/50 p-2"
                  align="start"
                  side="top"
                >
                  <div className="flex max-w-[240px] flex-wrap gap-1">{extraTools}</div>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="flex items-center gap-1">{extraTools}</div>
            )}

            <div className="group relative min-w-0 flex-1">
              <SlashCommands
                inputValue={inputValue}
                onSelectCommand={onSlashCommand}
                onClose={onCloseSlashCommands}
                isOpen={showSlashCommands}
              />
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onBlur={onTypingStop}
                placeholder={
                  replyToMessage
                    ? 'Digite sua resposta...'
                    : isMobile
                      ? 'Mensagem...'
                      : 'Digite / para comandos... (Shift+Enter para nova linha)'
                }
                className={cn(
                  'max-h-[120px] min-h-[44px] resize-none rounded-2xl border-border/50 bg-background/50 pr-10 text-[14px] font-medium tracking-normal transition-all focus:border-primary/50 focus:ring-primary/20',
                  isMobile ? 'py-2.5 text-[16px] leading-snug' : 'py-3',
                  isSending && 'pointer-events-none opacity-50'
                )}
                rows={1}
                disabled={isSending}
              />
              <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
                <AIEnhanceButton
                  inputValue={inputValue}
                  onInputChange={onInputChange}
                  contactName={contactName}
                />
                {!isMobile && (
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      aria-label="Emojis"
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              <Button
                onClick={handleSend}
                disabled={(!inputValue.trim() && attachments.length === 0) || isSending}
                size="icon"
                className={cn(
                  'touch-manipulation text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-primary/40 active:scale-95 disabled:opacity-50',
                  isMobile ? 'h-10 w-10 rounded-full' : 'h-9 w-9'
                )}
                style={{ background: 'var(--gradient-primary)' }}
                aria-label="Enviar mensagem"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {isRecordingAudio && (
              <div className="mt-3">
                <AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} />
              </div>
            )}
          </AnimatePresence>
        </motion.div>
      </>
    );
  }
);

ChatMessageInput.displayName = 'ChatMessageInput';
