import { useRef, forwardRef, useImperativeHandle, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { ReplyPreview } from '@/features/inbox/components/ReplyQuote';
import { SlashCommands, SlashCommand } from '@/features/inbox/components/SlashCommands';
import { AudioRecorder } from '@/features/inbox/components/AudioRecorder';
import { FileUploader, FileUploaderRef } from '@/features/inbox/components/FileUploader';
import { ExternalProduct } from '@/hooks/useExternalCatalog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, Smile, Plus, Loader2, X, Image as ImageIcon, FileText, FileVideo, FileAudio } from 'lucide-react';
import { AIEnhanceButton } from './AIEnhanceButton';
import { InputExtraTools } from './InputExtraTools';
import { toast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { validateFile, formatFileSize } from '@/utils/whatsappFileTypes';
import type { QuickReply } from '@/types/chat';


interface QueuedFile {
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

export const ChatMessageInput = forwardRef<ChatMessageInputRef, ChatMessageInputProps>(({
  inputValue, replyToMessage, isRecordingAudio, showSlashCommands,
  contactId, contactPhone, contactName, messages, quickReplies,
  onInputChange, onSend, onCancelReply, onSlashCommand, onCloseSlashCommands,
  onQuickReply, onRecordToggle, onAudioSend, onAudioCancel,
  onOpenInteractiveBuilder, onOpenSchedule, onOpenLocationPicker,
  onSendProduct, onTypingStart, onTypingStop,
  isSending = false, sendProgress = 0,
}, ref) => {
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
    
    const preview = (validation.category === 'image' || file.type === 'application/pdf') 
      ? URL.createObjectURL(file) 
      : undefined;
      
    setAttachments(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview,
      category: validation.category || 'document'
    }]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id);
      if (att?.preview) URL.revokeObjectURL(att.preview);
      return prev.filter(a => a.id !== id);
    });
  }, []);

  const handleSend = () => {
    onSend(attachments.map(a => a.file));
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
    if (showSlashCommands && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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

      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-sm"
          >
            <div className="flex flex-wrap gap-2">
              {attachments.map((att) => (
                <motion.div
                  key={att.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center"
                >
                  {att.preview ? (
                    <img src={att.preview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground p-1">
                      {att.category === 'video' ? <FileVideo className="w-6 h-6" /> :
                       att.category === 'audio' ? <FileAudio className="w-6 h-6" /> :
                       att.category === 'image' ? <ImageIcon className="w-6 h-6" /> :
                       <FileText className="w-6 h-6" />}
                      <span className="text-[8px] truncate max-w-full text-center">{att.file.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-background/80 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/60 backdrop-blur-xs py-0.5 px-1">
                    <span className="text-[8px] block truncate font-medium">{formatFileSize(att.file.size)}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSending && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-1.5 bg-primary/5 border-t border-primary/10"
          >
            <div className="flex items-center justify-between gap-3 mb-1">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wider">Enviando...</span>
              <span className="text-[10px] font-bold text-primary">{Math.round(sendProgress)}%</span>
            </div>
            <div className="h-1 w-full bg-primary/10 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${sendProgress}%` }}
                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("bg-background/95 backdrop-blur-md border-t border-border/50 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]", isMobile ? "p-3 safe-area-bottom" : "p-4")}>
        <div className="flex items-end gap-1">
          <FileUploader ref={fileUploaderRef} instanceName={contactId} recipientNumber={contactPhone} contactId={contactId} connectionId={undefined}
            onFileSelect={handleFileSelect}
            onFileSent={() => toast({ title: 'Arquivo enviado!', description: 'O arquivo foi enviado com sucesso via WhatsApp.' })}
            showDialog={false}
          />

          {isMobile ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 flex-shrink-0 w-9 h-9 touch-manipulation active:scale-95" aria-label="Mais opções">
                  <Plus className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 glass-strong border-border/50" align="start" side="top">
                <div className="flex flex-wrap gap-1 max-w-[240px]">{extraTools}</div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center gap-1">{extraTools}</div>
          )}

          <div className="flex-1 relative group min-w-0">
            <SlashCommands inputValue={inputValue} onSelectCommand={onSlashCommand} onClose={onCloseSlashCommands} isOpen={showSlashCommands} />
            <Textarea ref={textareaRef} value={inputValue} onChange={handleInputChange} onKeyDown={handleKeyDown} onBlur={onTypingStop}
              placeholder={replyToMessage ? "Digite sua resposta..." : isMobile ? "Mensagem..." : "Digite / para comandos... (Shift+Enter para nova linha)"}
              className={cn("min-h-[44px] max-h-[120px] resize-none pr-10 bg-background/50 border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all  text-[14px] font-medium tracking-normal rounded-2xl", isMobile ? "py-2.5 text-[16px] leading-snug" : "py-3", isSending && "opacity-50 pointer-events-none")}
              rows={1}
              disabled={isSending}
            />
            <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
              <AIEnhanceButton inputValue={inputValue} onInputChange={onInputChange} contactName={contactName} />
              {!isMobile && (
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary w-8 h-8" aria-label="Emojis">
                    <Smile className="w-5 h-5" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <Button onClick={handleSend} disabled={(!inputValue.trim() && attachments.length === 0) || isSending} size="icon"
              className={cn("text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50 touch-manipulation active:scale-95", isMobile ? "w-10 h-10 rounded-full" : "w-9 h-9")}
              style={{ background: 'var(--gradient-primary)' }} aria-label="Enviar mensagem">
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isRecordingAudio && (
            <div className="mt-3"><AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} /></div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
});

ChatMessageInput.displayName = 'ChatMessageInput';