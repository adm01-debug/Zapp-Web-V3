import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { useIsMobile } from '@/hooks/use-mobile';
import { SLAIndicatorForContact } from '../SLAIndicatorForContact';
import { ChatHeaderToolbar } from './ChatHeaderToolbar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  MoreVertical,
  Tag,
  Archive,
  CheckCircle,
  Clock,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  XCircle,
} from 'lucide-react';
import { openChatPopup } from '@/lib/popupManager';
import { useContactAvatar } from '@/features/inbox';
import { ActiveTool } from './ChatHeaderToolbar';

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
}

interface ChatPanelHeaderProps {
  conversation: Conversation;
  isContactTyping: boolean;
  showAIAssistant: boolean;
  showDetails?: boolean;
  showSummaryPanel?: boolean;
  activeTool?: ActiveTool;
  onSetActiveTool?: (tool: ActiveTool) => void;
  voiceId: string;
  speed: number;
  onToggleAIAssistant: () => void;
  onToggleDetails?: () => void;
  onStartCall: () => void;
  onOpenSearch: () => void;
  onOpenTransfer: () => void;
  onOpenSchedule: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onBack?: () => void;
  onGenerateSummary?: () => void;
  isSummaryLoading?: boolean;
  canGenerateSummary?: boolean;
  onCloseConversation?: () => void;
  lastMessages?: string[];
  allMessages?: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
  sendState?: 'idle' | 'retrying' | 'failed';
  failuresOnly?: boolean;
  onToggleFailuresOnly?: () => void;
  failuresCount?: number;
  onOpenValidation?: () => void;
}

export function ChatPanelHeader({
  conversation,
  isContactTyping,
  showAIAssistant,
  showDetails,
  showSummaryPanel,
  onToggleAIAssistant,
  onToggleDetails,
  onOpenSearch,
  onOpenTransfer,
  onOpenSchedule,
  onBack,
  onGenerateSummary,
  isSummaryLoading,
  onCloseConversation,
  activeTool,
  onSetActiveTool,
  sendState = 'idle',
  failuresOnly,
  onToggleFailuresOnly,
  failuresCount,
  onOpenValidation,
}: ChatPanelHeaderProps) {
  const isMobile = useIsMobile();
  const { avatarUrl } = useContactAvatar(conversation.contact.id, conversation.contact.avatar);

  return (
    <div className="sticky top-0 z-30 flex h-[64px] shrink-0 items-center justify-between border-b border-border/10 bg-background/60 px-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-3xl transition-all duration-500 md:h-[80px] md:px-8">
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        {isMobile && onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 touch-manipulation rounded-xl transition-all hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
            onClick={onBack}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="relative shrink-0">
          <Avatar className="h-9 w-9 border border-border/50 shadow-sm md:h-11 md:w-11">
            <AvatarImage
              src={avatarUrl || undefined}
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).removeAttribute('src');
              }}
            />
            <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
              {conversation.contact.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-[hsl(var(--online))]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-none tracking-normal text-foreground">
              {conversation.contact.name}
            </h3>
            {conversation.sentiment === 'critical' && (
              <span className="animate-pulse text-destructive" title="Sentimento Crítico">
                🔥
              </span>
            )}
            {conversation.sentiment === 'negative' && (
              <span className="text-destructive/80" title="Sentimento Negativo">
                😡
              </span>
            )}
            {conversation.sentiment === 'positive' && (
              <span className="text-success" title="Sentimento Positivo">
                🌟
              </span>
            )}

            {conversation.queue && (
              <Badge
                variant="outline"
                className="h-4 border-primary/20 bg-primary/5 px-1.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                style={{
                  borderColor: `${conversation.queue.color}40`,
                  color: conversation.queue.color,
                }}
              >
                {conversation.queue.name}
              </Badge>
            )}

            <SLAIndicatorForContact conversation={conversation} />

            {sendState === 'retrying' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                Tentando reenviar…
              </span>
            )}
            {sendState === 'failed' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">
                Última mensagem falhou
              </span>
            )}
          </div>
          <div className="flex h-4 items-center">
            {isContactTyping ? (
              <div className="flex items-center gap-1.5">
                <TypingIndicatorCompact isVisible={true} className="text-success" />
                <span className="animate-pulse text-[11px] font-semibold text-success">
                  digitando…
                </span>
              </div>
            ) : (
              <div className="group flex cursor-default items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success"></span>
                </span>
                <span className="text-[11px] font-medium text-muted-foreground/80 transition-colors group-hover:text-foreground">
                  Online
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="mx-2 hidden h-8 w-px shrink-0 bg-border/40 md:flex" />
      </div>

      <div className="flex items-center gap-0.5">
        <ChatHeaderToolbar
          activeTool={activeTool}
          showAIAssistant={showAIAssistant}
          showDetails={showDetails}
          showSummaryPanel={showSummaryPanel}
          isSummaryLoading={isSummaryLoading}
          onOpenSearch={onOpenSearch}
          onSetActiveTool={onSetActiveTool}
          onToggleAIAssistant={onToggleAIAssistant}
          onToggleDetails={onToggleDetails}
          onGenerateSummary={onGenerateSummary}
          failuresOnly={failuresOnly}
          onToggleFailuresOnly={onToggleFailuresOnly}
          failuresCount={failuresCount}
          onOpenValidation={onOpenValidation}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Mais ações"
              title="Mais ações"
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-border bg-popover">
            <DropdownMenuItem
              onClick={() => openChatPopup(conversation.contact.id, conversation.contact.name)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir em popup
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Tag className="mr-2 h-4 w-4" />
              Adicionar tag
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenTransfer}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Transferir
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSchedule}>
              <Clock className="mr-2 h-4 w-4" />
              Agendar mensagem
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <CheckCircle className="mr-2 h-4 w-4" />
              Marcar como resolvido
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onCloseConversation}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Encerrar Conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
