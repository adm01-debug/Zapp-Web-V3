import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from '@/components/ui/motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AISuggestions } from '../AISuggestions';
import { MessageTemplates } from '../MessageTemplates';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import { ExternalProduct } from '@/hooks/useExternalApiManagement';
import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Zap, Mic, Clock, MapPin, Package, Layers } from 'lucide-react';
import type { QuickReply } from '@/types/chat';

interface InputExtraToolsProps {
  isRecordingAudio: boolean;
  messages: Message[];
  contactName: string;
  quickReplies: QuickReply[];
  onInputChange: (value: string) => void;
  onQuickReply: (reply: QuickReply) => void;
  onRecordToggle: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
}

export function InputExtraTools({
  isRecordingAudio,
  messages,
  contactName,
  quickReplies,
  onInputChange,
  onQuickReply,
  onRecordToggle,
  onOpenInteractiveBuilder,
  onOpenSchedule,
  onOpenLocationPicker,
  onSendProduct,
}: InputExtraToolsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={onOpenInteractiveBuilder}
            aria-label="Mensagem Interativa"
          >
            <Layers className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mensagem Interativa</TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="Respostas rápidas"
          >
            <Zap className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="glass-strong w-72 border-border/50 p-0" align="start">
          <div className="border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent p-3">
            <h4 className="text-sm font-medium">Respostas Rápidas</h4>
            <p className="text-xs text-muted-foreground">Digite / para usar atalhos</p>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto p-2">
            {quickReplies.map((reply) => (
              <motion.button
                key={reply.id}
                whileHover={{ x: 4 }}
                onClick={() => onQuickReply(reply)}
                className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-primary/10"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{reply.title}</span>
                  <Badge variant="outline" className="border-primary/30 text-[10px]">
                    {reply.shortcut}
                  </Badge>
                </div>
              </motion.button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <AISuggestions
        messages={messages.map((m) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
          timestamp: m.timestamp,
        }))}
        contactName={contactName}
        onSelectSuggestion={(text) => onInputChange(text)}
      />
      <MessageTemplates onSelectTemplate={(text) => onInputChange(text)} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'text-muted-foreground hover:bg-primary/10 hover:text-primary',
              isRecordingAudio && 'bg-destructive/10 text-destructive'
            )}
            onClick={onRecordToggle}
            aria-label={isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}
          >
            <Mic className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={onOpenLocationPicker}
            aria-label="Compartilhar localização"
          >
            <MapPin className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Compartilhar localização</TooltipContent>
      </Tooltip>

      <ExternalProductCatalog
        onSendProduct={onSendProduct}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="Catálogo de produtos"
          >
            <Package className="h-5 w-5" />
          </Button>
        }
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={onOpenSchedule}
            aria-label="Agendar mensagem"
          >
            <Clock className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Agendar mensagem</TooltipContent>
      </Tooltip>
    </>
  );
}
