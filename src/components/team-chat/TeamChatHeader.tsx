import { TeamConversation } from '@/hooks/useTeamChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Users,
  User,
  UserPlus,
  PanelRightOpen,
  PanelRightClose,
  Search,
  MoreVertical,
  Archive,
  Bell,
  BellOff,
  Pin,
  Building2,
  ArrowRightLeft,
  BarChart3,
  Activity,
} from 'lucide-react';
import { TransferConversationDialog } from './TransferConversationDialog';
import { useAuth } from '@/features/auth';

interface TeamChatHeaderProps {
  conversation: TeamConversation;
  showDetails?: boolean;
  voiceId: string;
  speed: number;
  showSearch: boolean;
  isMuted?: boolean;
  onBack: () => void;
  onToggleDetails?: () => void;
  onToggleSearch: () => void;
  onAddMembers: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onToggleMute?: () => void;
  onToggleStats?: () => void;
  onTogglePerformance?: () => void;
  showStats?: boolean;
}

export function TeamChatHeader({
  conversation,
  showDetails,
  voiceId: _voiceId,
  speed: _speed,
  showSearch,
  isMuted,
  onBack,
  onToggleDetails,
  onToggleSearch,
  onAddMembers,
  onVoiceChange: _onVoiceChange,
  onSpeedChange: _onSpeedChange,
  onToggleMute,
  onToggleStats,
  onTogglePerformance,
  showStats,
}: TeamChatHeaderProps) {
  const [showTransfer, setShowTransfer] = useState(false);
  const { profile } = useAuth();

  const canTransfer = profile?.role === 'admin' || profile?.department === 'Suporte';

  return (
    <div
      className="flex h-[56px] shrink-0 items-center justify-between border-b border-border bg-card px-3 pr-24 md:h-[65px] md:px-5"
      role="banner"
      aria-label="Cabeçalho da conversa"
    >
      <div className="flex min-w-0 items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={onBack}
          aria-label="Voltar para lista de conversas"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0 md:h-10 md:w-10">
          <AvatarImage src={conversation.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {conversation.type === 'department' ? (
              <Building2 className="h-4 w-4" />
            ) : conversation.type === 'group' ? (
              <Users className="h-4 w-4" />
            ) : (
              <User className="h-4 w-4" />
            )}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold leading-tight text-foreground">
            {conversation.name}
          </h3>
          <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">
            {conversation.type === 'department'
              ? 'Grupo de Departamento'
              : conversation.type === 'group'
                ? `${conversation.members?.length || 0} membros`
                : 'Chat direto'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground',
                showSearch && 'bg-primary/10 text-primary'
              )}
              onClick={onToggleSearch}
            >
              <Search className="h-[18px] w-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Buscar mensagens (⌘K)</TooltipContent>
        </Tooltip>

        {conversation.type === 'group' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={onAddMembers}
              >
                <UserPlus className="h-[18px] w-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Adicionar membros</TooltipContent>
          </Tooltip>
        )}

        {(conversation.type === 'group' || conversation.type === 'department') && onToggleStats && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground',
                  showStats && 'bg-primary/10 text-primary'
                )}
                onClick={onToggleStats}
              >
                <BarChart3 className="h-[18px] w-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Estatísticas do grupo</TooltipContent>
          </Tooltip>
        )}

        {onTogglePerformance && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground')}
                onClick={onTogglePerformance}
              >
                <Activity className="h-[18px] w-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Performance do Chat</TooltipContent>
          </Tooltip>
        )}

        {onToggleDetails && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground',
                  showDetails && 'bg-primary/10 text-primary'
                )}
                onClick={onToggleDetails}
              >
                {showDetails ? (
                  <PanelRightClose className="h-[18px] w-[18px]" />
                ) : (
                  <PanelRightOpen className="h-[18px] w-[18px]" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showDetails ? 'Fechar detalhes' : 'Ver detalhes'}
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Mais ações"
              title="Mais ações"
              data-testid="conversation-more-actions"
            >
              <MoreVertical className="h-[18px] w-[18px]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-border bg-popover">
            {onToggleMute && (
              <DropdownMenuItem onClick={onToggleMute}>
                {isMuted ? (
                  <>
                    <Bell className="mr-2 h-4 w-4" />
                    Ativar notificações
                  </>
                ) : (
                  <>
                    <BellOff className="mr-2 h-4 w-4" />
                    Silenciar
                  </>
                )}
              </DropdownMenuItem>
            )}

            {canTransfer && conversation.type === 'department' && (
              <DropdownMenuItem
                onClick={() => setShowTransfer(true)}
                data-testid="transfer-conversation-btn"
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Transferir
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="opacity-50">
              <Pin className="mr-2 h-4 w-4" />
              Fixar conversa
            </DropdownMenuItem>
            <DropdownMenuItem disabled className="opacity-50">
              <Archive className="mr-2 h-4 w-4" />
              Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <TransferConversationDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        conversation={conversation}
      />
    </div>
  );
}
