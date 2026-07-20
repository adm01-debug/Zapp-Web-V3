import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  MoreVertical,
  Tag,
  Archive,
  CheckCircle,
  Clock,
  ArrowRight,
  Brain,
  XCircle,
  Share2,
} from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';

interface ChatHeaderMenuProps {
  onOpenTransfer: () => void;
  onOpenSchedule: () => void;
  onGenerateSummary?: (tool?: string) => void;
  onToggleFailuresOnly?: () => void;
  failuresOnly?: boolean;
  failuresCount?: number;
  onCloseConversation?: () => void;
}

/** Chat Header Menu component for the chat section. */
export function ChatHeaderMenu({
  onOpenTransfer,
  onOpenSchedule,
  onGenerateSummary,
  onToggleFailuresOnly,
  failuresOnly,
  failuresCount,
  onCloseConversation,
}: ChatHeaderMenuProps) {
  return (
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
        <DropdownMenuItem onClick={() => onGenerateSummary?.()}>
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
  );
}
