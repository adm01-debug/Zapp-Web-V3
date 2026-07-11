import { memo } from 'react';
import { cn } from '@/lib/utils';
import { VisionIcon } from '../ai-tools/VisionIcon';
import { Conversation, Message } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from '@/components/ui/motion';
import { SLAIndicatorForContact } from '../SLAIndicatorForContact';
import { VoiceSelector } from '../VoiceSelector';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';
import { RealtimeCollaboration } from '../RealtimeCollaboration';
import { useExternalContact360 } from '@/hooks/useExternalContact360';
import { useContactIntelligence } from '@/hooks/useContactIntelligence';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Video,
  Tag,
  Archive,
  CheckCircle,
  Clock,
  ArrowRight,
  PhoneCall,
  Search,
  Brain,
  Info,
  Users,
  UserCheck,
  Truck,
  Wrench,
  LayoutGrid,
  Maximize2,
  Minimize2,
  ArrowLeft,
  XCircle,
  AlertCircle,
  EyeOff,
  Share2,
  ClipboardCheck,
} from 'lucide-react';
import { useContactAvatar } from '@/features/inbox';
import { useDensity } from '@/hooks/useDensity';

const _contactTypeConfig: Record<string, { label: string; icon: typeof Users; color: string }> = {
  cliente: { label: 'Cliente', icon: Users, color: 'bg-info/10 text-info border-info/30' },
  colaborador: {
    label: 'Colaborador',
    icon: UserCheck,
    color: 'bg-success/10 text-success border-success/30',
  },
  fornecedor: {
    label: 'Fornecedor',
    icon: Truck,
    color: 'bg-secondary/10 text-secondary border-secondary/30',
  },
  prestador_servico: {
    label: 'Prestador',
    icon: Wrench,
    color: 'bg-warning/10 text-warning border-warning/30',
  },
  transportadora: {
    label: 'Transportadora',
    icon: Truck,
    color: 'bg-info/10 text-info border-info/30',
  },
};

interface ChatHeaderProps {
  conversation: Conversation;
  messages: Message[];
  isContactTyping: boolean;
  showAIAssistant: boolean;
  showDetails: boolean;
  voiceId: string;
  speed: number;
  onToggleAIAssistant: () => void;
  onToggleDetails: () => void;
  onStartCall: () => void;
  onOpenSearch: () => void;
  onOpenTransfer: () => void;
  onOpenSchedule: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
  onBack?: () => void;
  onCloseConversation?: () => void;
  onGenerateSummary?: (tool?: any) => void;
  failuresOnly?: boolean;
  onToggleFailuresOnly?: () => void;
  failuresCount?: number;
  onOpenWhisper?: () => void;
  whisperCount?: number;
  onOpenValidation?: () => void;
}

export const ChatHeader = memo(function ChatHeader({
  conversation,
  messages: _messages,
  isContactTyping,
  showAIAssistant,
  showDetails,
  voiceId,
  onToggleAIAssistant,
  onToggleDetails,
  onStartCall,
  onOpenSearch,
  onOpenTransfer,
  onOpenSchedule,
  onVoiceChange,
  onBack,
  onCloseConversation,
  onGenerateSummary,
  failuresOnly,
  onToggleFailuresOnly,
  failuresCount,
  onOpenWhisper,
  whisperCount,
  onOpenValidation,
}: ChatHeaderProps) {
  const { data: crmData } = useExternalContact360(
    isExternalConfigured ? conversation.contact.phone : undefined
  );
  const _crmCompany = crmData?.found ? crmData.company : null;
  const _crmCustomer = crmData?.found ? crmData.customer : null;
  const _crmRfm = crmData?.found ? crmData.rfm : null;

  const { data: intel } = useContactIntelligence(
    isExternalConfigured ? conversation.contact.phone : undefined
  );
  const _briefing = intel?.found ? intel.briefing : null;
  const { avatarUrl } = useContactAvatar(conversation.contact.id, conversation.contact.avatar);
  const { density, cycleDensity } = useDensity();

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
      className={cn(
        'sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-border/10 bg-background/80 px-4 shadow-sm backdrop-blur-xl sm:px-6',
        density === 'comfortable' ? 'py-2' : 'py-1.5'
      )}
    >
      <div className="flex items-center gap-3">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full hover:bg-primary/5 lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <motion.div whileHover={{ scale: 1.05 }} className="group relative cursor-pointer">
          <Avatar className="h-[44px] w-[44px] border border-border/10 shadow-xl ring-2 ring-background transition-shadow group-hover:shadow-primary/20">
            <AvatarImage
              src={avatarUrl || undefined}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).removeAttribute('src');
              }}
            />
            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-[11px] font-black uppercase text-primary">
              {conversation.contact.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
        </motion.div>
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-nowrap items-center gap-2 overflow-hidden">
            <h3 className="max-w-[240px] truncate text-[15px] font-semibold leading-tight tracking-[-0.01em] text-foreground sm:max-w-md">
              {conversation.contact.name}
            </h3>
            <div className="flex flex-shrink-0 items-center gap-1.5">
              <SLAIndicatorForContact conversation={conversation} />
              <Badge
                variant="outline"
                className={cn(
                  'h-4.5 border-0 px-2 text-[9px] font-black uppercase tracking-widest shadow-sm',
                  conversation.status === 'open'
                    ? 'bg-success/10 text-success-foreground'
                    : 'bg-muted/60 text-muted-foreground'
                )}
              >
                {conversation.status === 'open'
                  ? 'Aberto'
                  : conversation.status === 'pending'
                    ? 'Pendente'
                    : conversation.status === 'resolved'
                      ? 'Resolvido'
                      : 'Aguardando'}
              </Badge>
            </div>
          </div>
          <div className="flex h-4 items-center">
            {isContactTyping ? (
              <span className="flex animate-pulse items-center gap-1 text-[11px] font-semibold uppercase italic tracking-[0.04em] text-primary">
                <span className="h-1 w-1 rounded-full bg-primary" /> digitando...
              </span>
            ) : (
              <span className="max-w-[200px] truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-[hsl(var(--muted-foreground))]">
                Status: Ativo
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {onOpenValidation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-primary hover:bg-primary/5"
                onClick={onOpenValidation}
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden text-[10px] font-bold uppercase tracking-tight sm:inline">
                  Checklist
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Validação Visual 10/10</TooltipContent>
          </Tooltip>
        )}

        {failuresCount != null && failuresCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={failuresOnly ? 'destructive' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 gap-1.5 px-2 animate-in fade-in slide-in-from-right-2',
                  !failuresOnly && 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                )}
                onClick={onToggleFailuresOnly}
              >
                <AlertCircle className={cn('h-4 w-4', !failuresOnly && 'animate-pulse')} />
                <span className="text-[11px] font-bold uppercase tracking-tight">
                  {failuresCount} Falhas
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {failuresOnly ? 'Mostrar todas as mensagens' : 'Filtrar mensagens com erro'}
            </TooltipContent>
          </Tooltip>
        )}

        <RealtimeCollaboration contactId={conversation.contact.id} className="mr-1" />

        {onOpenWhisper && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2 text-warning-foreground hover:bg-warning/50 hover:text-warning-foreground"
                onClick={onOpenWhisper}
              >
                <div className="relative">
                  <EyeOff className="h-4 w-4" />
                  {whisperCount !== undefined && whisperCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-warning px-0.5 text-[8px] font-bold text-foreground ring-1 ring-white">
                      {whisperCount}
                    </span>
                  )}
                </div>
                <span className="hidden text-[10px] font-bold uppercase tracking-tight sm:inline">
                  Equipe
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir Modo Sussurro (Chat Interno - Alt+W)</TooltipContent>
          </Tooltip>
        )}
        {[
          { icon: Search, label: 'Buscar (Ctrl+K)', onClick: onOpenSearch },
          { icon: PhoneCall, label: 'Iniciar chamada', onClick: onStartCall },
          { icon: Video, label: 'Videochamada', onClick: undefined },
        ].map(({ icon: Icon, label, onClick }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <motion.div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-full text-[hsl(var(--muted-foreground))] transition-all hover:bg-transparent active:scale-95"
                  onClick={onClick}
                  aria-label={label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent className="text-[10px] font-medium">{label}</TooltipContent>
          </Tooltip>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'text-muted-foreground hover:bg-primary/10 hover:text-primary',
                  showAIAssistant && 'bg-primary/10 text-primary'
                )}
                onClick={onToggleAIAssistant}
                aria-label="Visão"
              >
                <VisionIcon className="h-4 w-4" />
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Visão</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'relative text-muted-foreground hover:bg-primary/10 hover:text-primary',
                  showDetails && 'bg-primary/10 text-primary'
                )}
                onClick={onToggleDetails}
                aria-label="Detalhes do contato"
              >
                <Info className="h-4 w-4" />
                {!showDetails && (
                  <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-primary" />
                )}
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Detalhes do contato</TooltipContent>
        </Tooltip>

        <VoiceSelector selectedVoiceId={voiceId} onVoiceChange={onVoiceChange} />
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                onClick={cycleDensity}
                aria-label={`Densidade: ${density}`}
              >
                {density === 'comfortable' ? (
                  <Maximize2 className="h-4 w-4" />
                ) : density === 'compact' ? (
                  <LayoutGrid className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>
            Densidade:{' '}
            {density === 'comfortable'
              ? 'Confortável'
              : density === 'compact'
                ? 'Compacto'
                : 'Denso'}
          </TooltipContent>
        </Tooltip>

        <KeyboardShortcutsHelp />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:bg-primary/10 hover:text-primary"
                aria-label="Mais opções"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 border-border/30 bg-card">
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
            <DropdownMenuItem onClick={onGenerateSummary}>
              <Brain className="mr-2 h-4 w-4" />
              Gerar Resumo
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onToggleFailuresOnly}
              className={cn(failuresOnly && 'font-medium text-destructive')}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {failuresOnly ? 'Ocultar Falhas' : `Ver Falhas (${failuresCount || 0})`}
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
            <DropdownMenuItem onClick={() => onGenerateSummary?.('teamFiles')}>
              <Share2 className="mr-2 h-4 w-4 text-warning-foreground" />
              Arquivos da Equipe
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCloseConversation} className="text-destructive">
              <XCircle className="mr-2 h-4 w-4" />
              Encerrar Conversa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
});
