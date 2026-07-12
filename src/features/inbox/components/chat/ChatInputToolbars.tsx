import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIRewriteButton } from './AIRewriteButton';
import { RichTextToggle } from './RichTextToolbar';
import { StickerPicker } from '../StickerPicker';
import { AudioMemePicker } from '../AudioMemePicker';
import { VoiceChangerPicker } from '../VoiceChangerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { EmojiPicker } from '../EmojiPicker';
import { FileUploader, FileUploaderRef } from '../FileUploader';
import { TextToAudioButton } from '../TextToAudioButton';
import { AISuggestions } from '../AISuggestions';
import { MessageTemplates } from '../MessageTemplates';
import { AdvancedMessageMenu } from '../AdvancedMessageMenu';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import { ExternalProduct } from '@/hooks/useExternalCatalog';
import { Message } from '@/types/chat';
import {
  Package,
  Layers,
  MapPin,
  Clock,
  Zap,
  PenTool,
  Check,
  Lock,
  Unlock,
  Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type QuickReplyItem = {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
};

interface SecondaryToolbarProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  showRichToolbar: boolean;
  onToggleRichToolbar: () => void;
  isRecordingAudio: boolean;
  onSendSticker: (url: string) => void;
  onSendAudioMeme: (url: string) => void;
  onSendCustomEmoji: (url: string) => void;
  onOpenCatalog?: () => void;
  onAudioSend: (blob: Blob) => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  instanceName?: string;
  contactPhone: string;
  contactId: string;
  contactName?: string;
  onVoiceDictation: (text: string) => void;
  isWhisper?: boolean;
  onToggleWhisper?: () => void;
  onFileSelect?: (file: File, category: string) => void;
  disabled?: boolean;
}

export function SecondaryToolbar({
  inputRef,
  inputValue,
  showRichToolbar,
  onToggleRichToolbar,
  isRecordingAudio: _isRecordingAudio,
  onSendSticker,
  onSendAudioMeme,
  onSendCustomEmoji,
  onOpenCatalog,
  onAudioSend,
  fileUploaderRef,
  instanceName,
  contactPhone,
  contactId,
  contactName,
  onVoiceDictation: _onVoiceDictation,
  isWhisper,
  onToggleWhisper,
  onFileSelect,
  disabled,
}: SecondaryToolbarProps) {
  const handleRewrite = (newText: string) => {
    const el = inputRef.current;
    if (!el) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, newText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div
      className={cn(
        'ml-1 flex shrink-0 items-center gap-0.5 rounded-full border border-border/5 bg-card p-1 transition-opacity',
        disabled && 'pointer-events-none opacity-50'
      )}
    >
      {onToggleWhisper && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-7 w-7 rounded-full transition-all duration-300',
                isWhisper
                  ? 'bg-warning/10 text-warning-foreground shadow-sm hover:bg-warning/20'
                  : 'text-muted-foreground/40 hover:bg-warning/5 hover:text-warning-foreground'
              )}
              onClick={onToggleWhisper}
              aria-label={
                isWhisper ? 'Desativar modo sussurro' : 'Ativar modo sussurro (nota interna)'
              }
            >
              {isWhisper ? (
                <div className="relative">
                  <Lock className="h-3.5 w-3.5" />
                  <span className="absolute -right-0.5 -top-0.5 h-1 w-1 animate-pulse rounded-full bg-warning" />
                </div>
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-[10px] font-medium">
            Whisper
          </TooltipContent>
        </Tooltip>
      )}
      <AIRewriteButton
        inputValue={inputValue}
        onRewrite={handleRewrite}
        contactName={contactName}
      />
      <StickerPicker onSendSticker={onSendSticker} />
      <AudioMemePicker onSendAudioMeme={onSendAudioMeme} />
      <VoiceChangerPicker onSendAudio={onSendAudioMeme} />
      <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
      <EmojiPicker
        onSelect={(emoji) => {
          const el = inputRef.current;
          if (!el) return;
          const start = el.selectionStart;
          const end = el.selectionEnd;
          const text = el.value;
          const newText = text.substring(0, start) + emoji + text.substring(end);

          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(el, newText);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // Restore cursor position
            setTimeout(() => {
              el.focus();
              el.setSelectionRange(start + emoji.length, start + emoji.length);
            }, 0);
          }
        }}
      />
      {onOpenCatalog && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground transition-colors hover:text-primary"
              onClick={onOpenCatalog}
              aria-label="Catálogo de produtos"
            >
              <Package className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Catálogo de Produtos</TooltipContent>
        </Tooltip>
      )}
      <FileUploader
        ref={fileUploaderRef}
        instanceName={instanceName || ''}
        recipientNumber={contactPhone}
        contactId={contactId}
        connectionId={undefined}
        onFileSelect={(file, category) => {
          if (onFileSelect) onFileSelect(file, category);
          else
            toast({
              title: 'Arquivo selecionado',
              description: `${file.name} (${category}) será enviado.`,
            });
        }}
        onFileSent={() => {
          toast({ title: 'Arquivo enviado!', description: 'O arquivo foi enviado com sucesso.' });
        }}
        showDialog={!onFileSelect}
      />
      <RichTextToggle active={showRichToolbar} onToggle={onToggleRichToolbar} />
      <TextToAudioButton inputValue={inputValue} onAudioReady={onAudioSend} />
    </div>
  );
}

interface TertiaryToolsMenuProps {
  instanceName?: string;
  contactPhone: string;
  contactName: string;
  messages: Message[];
  quickReplies: QuickReplyItem[];
  onOpenInteractiveBuilder: () => void;
  onOpenLocationPicker: () => void;
  onOpenSchedule: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSelectSuggestion: (text: string) => void;
  onSelectTemplate: (text: string) => void;
  onQuickReply: (reply: QuickReplyItem) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
  onToggleSignature?: () => void;
  onPollSent?: (poll: { name: string; options: string[]; selectableCount: number }) => void;
  onContactSent?: (contactName: string) => void;
  onOpenTeamFiles?: () => void;
}

export function TertiaryToolsMenu({
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
  onQuickReply,
  signatureEnabled,
  signatureName,
  onToggleSignature,
  onPollSent,
  onContactSent,
  onOpenTeamFiles,
}: TertiaryToolsMenuProps) {
  const quickRepliesList = useMemo(
    () =>
      quickReplies.slice(0, 50).map((reply) => (
        <Button
          key={reply.id}
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onQuickReply(reply)}
        >
          <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-primary/80">/{reply.shortcut}</span>
          <span className="truncate">{reply.content}</span>
        </Button>
      )),
    [quickReplies, onQuickReply]
  );

  return (
    <div className="flex flex-col gap-1">
      {onOpenTeamFiles && (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-2 text-warning-foreground hover:bg-warning hover:text-warning-foreground"
          onClick={onOpenTeamFiles}
          aria-label="Arquivos da equipe"
        >
          <Share2 className="h-4 w-4" /> Arquivos da Equipe
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={onOpenInteractiveBuilder}
        aria-label="Mensagem interativa"
      >
        <Layers className="h-4 w-4" /> Mensagem Interativa
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={onOpenLocationPicker}
        aria-label="Enviar localização"
      >
        <MapPin className="h-4 w-4" /> Localização
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-muted-foreground hover:text-foreground"
        onClick={onOpenSchedule}
        aria-label="Agendar mensagem"
      >
        <Clock className="h-4 w-4" /> Agendar
      </Button>
      <ExternalProductCatalog
        onSendProduct={onSendProduct}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            aria-label="Catálogo de produtos"
          >
            <Package className="h-4 w-4" /> Catálogo
          </Button>
        }
      />
      <AdvancedMessageMenu
        instanceName={instanceName || ''}
        recipientNumber={contactPhone}
        onPollSent={onPollSent}
        onContactSent={onContactSent}
      />
      <AISuggestions
        messages={messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
          timestamp: m.timestamp,
        }))}
        contactName={contactName}
        onSelectSuggestion={onSelectSuggestion}
      />
      <MessageTemplates onSelectTemplate={onSelectTemplate} />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            aria-label="Respostas rápidas"
          >
            <Zap className="h-4 w-4" /> Respostas Rápidas
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 border-border bg-popover p-0" align="start" side="top">
          <div className="border-b border-border p-3">
            <h4 className="text-sm font-medium text-foreground">Respostas Rápidas</h4>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto p-2">{quickRepliesList}</div>
        </PopoverContent>
      </Popover>
      {onToggleSignature && (
        <>
          <div className="my-1 border-t border-border/50" />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full justify-start gap-2',
              signatureEnabled
                ? 'text-primary hover:text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={onToggleSignature}
            aria-label={signatureEnabled ? 'Desativar assinatura' : 'Ativar assinatura'}
          >
            <PenTool className="h-4 w-4" />
            {signatureEnabled ? `Assinatura: ${signatureName || 'Ativa'}` : 'Assinar mensagens'}
            {signatureEnabled && <Check className="ml-auto h-3.5 w-3.5" />}
          </Button>
        </>
      )}
    </div>
  );
}
