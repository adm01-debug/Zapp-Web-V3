import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Reply,
  Forward,
  Copy,
  MoreVertical,
  Pin,
  Star,
  Trash2,
  Flag,
  Clock,
  CheckCheck,
  EyeOff,
  Pencil,
} from 'lucide-react';
import { Message } from '@/types/chat';
import { TextToSpeechButton } from '../TextToSpeechButton';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { dbFrom } from '@/integrations/datasource/db';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

const log = getLogger('MessageHoverToolbar');

interface MessageHoverToolbarProps {
  message: Message;
  isSent: boolean;
  instanceName?: string;
  contactJid?: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onEditStart?: (message: Message) => void;
  onMessageDeleted: (messageId: string) => void;
}

export function MessageHoverToolbar({
  message,
  isSent,
  instanceName,
  contactJid,
  ttsLoading,
  ttsPlaying,
  ttsMessageId,
  onReply,
  onForward,
  onCopy,
  onSpeak,
  onStop,
  onEditStart,
  onMessageDeleted,
}: MessageHoverToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    deleteMessage,
    markMessageAsRead,
    markMessageAsUnread,
    isLoading: _isLoading,
  } = useEvolutionApi();

  const externalId = message.external_id;

  // --- Real handlers wired to Evolution API ---

  const handleDelete = useCallback(async () => {
    try {
      if (externalId && instanceName && contactJid) {
        try {
          await deleteMessage(instanceName, externalId, contactJid, isSent);
        } catch {
          log.warn('WhatsApp API delete failed, marking locally only');
        }
      }
      await dbFrom('messages')
        .update({ is_deleted: true, content: '[Mensagem apagada]' })
        .eq('id', message.id);
      toast.success(externalId ? 'Mensagem deletada para todos' : 'Mensagem removida');
      onMessageDeleted(message.id);
    } catch {
      toast.error('Erro ao deletar mensagem');
    }
  }, [instanceName, externalId, contactJid, isSent, deleteMessage, message.id, onMessageDeleted]);

  const handleMarkRead = useCallback(async () => {
    if (!externalId || !instanceName || !contactJid) return;
    try {
      await markMessageAsRead(instanceName, {
        remoteJid: contactJid,
        fromMe: isSent,
        id: externalId,
      });
      toast.success('Marcada como lida');
    } catch {
      toast.error('Erro ao marcar como lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsRead]);

  const handleMarkUnread = useCallback(async () => {
    if (!externalId || !instanceName || !contactJid) return;
    try {
      await markMessageAsUnread(instanceName, {
        remoteJid: contactJid,
        fromMe: isSent,
        id: externalId,
      });
      toast.success('Marcada como não lida');
    } catch {
      toast.error('Erro ao marcar como não lida');
    }
  }, [instanceName, externalId, contactJid, isSent, markMessageAsUnread]);

  const canEdit =
    isSent &&
    message.type === 'text' &&
    onEditStart &&
    (() => {
      const ts =
        message.timestamp instanceof Date
          ? message.timestamp
          : new Date(message.created_at || String(message.timestamp));
      return (Date.now() - ts.getTime()) / 60000 <= 15;
    })();

  return (
    <div
      className={cn(
        'absolute top-1/2 z-10 flex -translate-y-1/2 items-center opacity-0 transition-all duration-200 group-hover:opacity-100',
        menuOpen && 'opacity-100',
        isSent ? 'right-full mr-1.5' : 'left-full ml-1.5'
      )}
    >
      <div className="flex items-center overflow-hidden rounded-full border border-border/40 bg-card/95 shadow-lg backdrop-blur-sm dark:bg-[hsl(var(--card)/0.95)]">
        <ToolbarButton onClick={() => onReply(message)} title="Responder">
          <Reply className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onForward(message)} title="Encaminhar">
          <Forward className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onCopy(message.content)} title="Copiar">
          <Copy className="h-3.5 w-3.5" />
        </ToolbarButton>
        {message.type === 'text' && (
          <TextToSpeechButton
            messageId={message.id}
            text={message.content}
            isLoading={ttsLoading}
            isPlaying={ttsPlaying}
            currentMessageId={ttsMessageId}
            onSpeak={onSpeak}
            onStop={onStop}
            className="p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          />
        )}

        {/* ⋮ Unified menu — all actions in one place */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Mais opções"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-52 border-border/50 bg-card shadow-xl"
            align={isSent ? 'end' : 'start'}
            sideOffset={8}
          >
            {canEdit && (
              <>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => onEditStart?.(message)}
                >
                  <Pencil className="h-4 w-4" /> Editar mensagem
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem className="cursor-pointer gap-2">
              <Star className="h-4 w-4" /> Favoritar
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2">
              <Pin className="h-4 w-4" /> Fixar
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Clock className="h-4 w-4" /> Responder depois
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44 border-border/50 bg-card">
                <DropdownMenuItem className="cursor-pointer">Em 1 hora</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">Em 3 horas</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">Amanhã</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                  Escolher data/hora...
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleMarkRead}>
              <CheckCheck className="h-4 w-4" /> Marcar como lida
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2" onClick={handleMarkUnread}>
              <EyeOff className="h-4 w-4" /> Marcar como não lida
            </DropdownMenuItem>

            {!isSent && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer gap-2 text-warning">
                  <Flag className="h-4 w-4" /> Reportar
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              {isSent && externalId ? 'Apagar para todos' : 'Apagar mensagem'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}
