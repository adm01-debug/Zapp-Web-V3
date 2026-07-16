import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Reply,
  Forward,
  Copy,
  Star,
  Pin,
  Trash2,
  Flag,
  Volume2,
  Download,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Message } from '@/types/chat';

interface MessageContextMenuProps {
  children: ReactNode;
  message: Message;
  onReply?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onCopy?: (content: string) => void;
  onStar?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onReport?: (messageId: string) => void;
  onSpeak?: (content: string, messageId: string) => void;
  onDownload?: (mediaUrl: string) => void;
  onScheduleReply?: (message: Message) => void;
  onMarkAsRead?: (messageId: string) => void;
  onMarkAsUnread?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export function MessageContextMenu({
  children,
  message,
  onReply,
  onForward,
  onCopy,
  onStar,
  onPin,
  onDelete,
  onReport,
  onSpeak,
  onDownload: _onDownload,
  onScheduleReply,
  onMarkAsRead,
  onMarkAsUnread,
  onReact,
}: MessageContextMenuProps) {
  const hasMedia = message.type !== 'text' && message.mediaUrl;
  const isFromAgent = message.sender === 'agent';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56 border-border/50 bg-card shadow-xl">
        {/* Quick Reactions */}
        <div className="flex items-center justify-between border-b border-border/50 px-2 py-1.5">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              type="button"
              key={emoji}
              className="flex h-8 w-8 items-center justify-center rounded-full text-lg transition-colors hover:scale-125 hover:bg-muted"
              onClick={() => onReact?.(message.id, emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Main Actions */}
        <ContextMenuItem onClick={() => onReply?.(message)} className="cursor-pointer gap-2">
          <Reply className="h-4 w-4" />
          Responder
          <ContextMenuShortcut>⌘R</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem onClick={() => onForward?.(message)} className="cursor-pointer gap-2">
          <Forward className="h-4 w-4" />
          Encaminhar
          <ContextMenuShortcut>⌘F</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem onClick={() => onCopy?.(message.content)} className="cursor-pointer gap-2">
          <Copy className="h-4 w-4" />
          Copiar texto
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Text-to-Speech */}
        {message.type === 'text' && (
          <ContextMenuItem
            onClick={() => onSpeak?.(message.content, message.id)}
            className="cursor-pointer gap-2"
          >
            <Volume2 className="h-4 w-4" />
            Ouvir mensagem
          </ContextMenuItem>
        )}

        {/* Media Download - BLOCKED */}
        {hasMedia && (
          <ContextMenuItem
            onClick={() => {
              import('sonner')
                .then(({ toast }) => toast.error('🔒 Download bloqueado por política de segurança'))
                .catch(() => {});
            }}
            className="cursor-pointer gap-2 opacity-50"
          >
            <Download className="h-4 w-4" />
            Download Bloqueado 🔒
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Organization Actions */}
        <ContextMenuItem onClick={() => onStar?.(message.id)} className="cursor-pointer gap-2">
          <Star className="h-4 w-4" />
          Favoritar mensagem
        </ContextMenuItem>

        <ContextMenuItem onClick={() => onPin?.(message.id)} className="cursor-pointer gap-2">
          <Pin className="h-4 w-4" />
          Fixar mensagem
        </ContextMenuItem>

        {/* Schedule Reply */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Clock className="h-4 w-4" />
            Responder depois
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48 border-border/50 bg-card">
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="cursor-pointer gap-2"
            >
              Em 1 hora
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="cursor-pointer gap-2"
            >
              Em 3 horas
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="cursor-pointer gap-2"
            >
              Amanhã
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onScheduleReply?.(message)}
              className="cursor-pointer gap-2"
            >
              Escolher data/hora...
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Status Actions */}
        <ContextMenuItem
          onClick={() => onMarkAsRead?.(message.id)}
          className="cursor-pointer gap-2"
        >
          <CheckCircle className="h-4 w-4" />
          Marcar como lido
        </ContextMenuItem>

        <ContextMenuItem
          onClick={() => onMarkAsUnread?.(message.id)}
          className="cursor-pointer gap-2"
        >
          <XCircle className="h-4 w-4" />
          Marcar como não lido
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Danger Zone */}
        {!isFromAgent && (
          <ContextMenuItem
            onClick={() => onReport?.(message.id)}
            className="cursor-pointer gap-2 text-warning"
          >
            <Flag className="h-4 w-4" />
            Reportar mensagem
          </ContextMenuItem>
        )}

        {isFromAgent && (
          <ContextMenuItem
            onClick={() => onDelete?.(message.id)}
            className="cursor-pointer gap-2 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Excluir mensagem
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
