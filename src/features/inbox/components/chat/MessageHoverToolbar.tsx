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
import type { ReportReason } from '@/hooks/useReportMessage';
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

export interface MessageHoverToolbarProps {
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
  /** Etapa 41: adia a CONVERSA (snooze) — wired no ChatPanel via useChatPanelHandlers.onSnooze. */
  onSnoozeConversation?: (duration: SnoozeDuration) => void;
  /** Etapa 44: ações de mensagem com backend real (favoritar/fixar/reportar). */
  messageActions?: {
    toggleFavorite: (messageId: string) => void;
    isFavorite: (messageId: string) => boolean;
    togglePin: (messageId: string, contactId?: string) => void;
    isPinned: (messageId: string) => boolean;
    report: (messageId: string, reason: ReportReason, details?: string) => void;
    hasReported: (messageId: string) => boolean;
  };
}

export type SnoozeDuration = '1h' | '3h' | 'tomorrow' | 'nextweek';

/** Message Hover Toolbar component for the chat section. */
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
  onSnoozeConversation,
  messageActions,
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
        <ToolbarButton onClick={() => { if (message.content) onCopy(message.content); }} title="Copiar">
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
            <button type="button"
              className="p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Mais opções"
              aria-label="Mais opções"
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

            {/* Etapa 44: favoritar/fixar/reportar com BACKEND REAL (zapp.favorite_messages,
                zapp.pinned_messages, zapp.message_reports — migrations 2026081715/16/170000). */}
            {messageActions && (
              <>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => messageActions.toggleFavorite(message.id)}
                >
                  <Star
                    className={
                      messageActions.isFavorite(message.id)
                        ? 'h-4 w-4 fill-warning text-warning'
                        : 'h-4 w-4'
                    }
                  />
                  {messageActions.isFavorite(message.id) ? 'Desfavoritar' : 'Favoritar'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer gap-2"
                  onClick={() => messageActions.togglePin(message.id)}
                >
                  <Pin
                    className={
                      messageActions.isPinned(message.id)
                        ? 'h-4 w-4 fill-primary text-primary'
                        : 'h-4 w-4'
                    }
                  />
                  {messageActions.isPinned(message.id) ? 'Desafixar' : 'Fixar'}
                </DropdownMenuItem>
                {!isSent && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger
                      disabled={messageActions.hasReported(message.id)}
                      className="gap-2 text-warning"
                    >
                      <Flag className="h-4 w-4" />
                      {messageActions.hasReported(message.id) ? 'Reportado' : 'Reportar'}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-44 border-border/50 bg-card">
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => messageActions.report(message.id, 'spam')}
                      >
                        Spam
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => messageActions.report(message.id, 'inapropriado')}
                      >
                        Conteúdo impróprio
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => messageActions.report(message.id, 'urgencia')}
                      >
                        Urgência
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() =>
                          messageActions.report(message.id, 'outro', window.prompt('Descreva o motivo:') ?? '')
                        }
                      >
                        Outro…
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
              </>
            )}

            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!onSnoozeConversation} className="gap-2">
                <Clock className="h-4 w-4" /> Responder depois
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-44 border-border/50 bg-card">
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => onSnoozeConversation?.('1h')}
                >
                  Em 1 hora
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => onSnoozeConversation?.('3h')}
                >
                  Em 3 horas
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => onSnoozeConversation?.('tomorrow')}
                >
                  Amanhã
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer"
                  onClick={() => onSnoozeConversation?.('nextweek')}
                >
                  Próxima semana
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
    <button type="button"
      onClick={onClick}
      title={title}
      className="p-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {children}
    </button>
  );
}
