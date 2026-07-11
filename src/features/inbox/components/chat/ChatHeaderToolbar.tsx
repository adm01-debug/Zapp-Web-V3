import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search,
  Radar,
  GraduationCap,
  FileText,
  Info,
  Loader2,
  AlertTriangle,
  LayoutTemplate,
  ClipboardCheck,
  BarChart3,
} from 'lucide-react';

export type ActiveTool =
  | 'chatSearch'
  | 'objections'
  | 'university'
  | 'aiAssistant'
  | 'summary'
  | 'teamFiles'
  | 'templates'
  | 'monitoring'
  | null;

interface ChatHeaderToolbarProps {
  activeTool?: ActiveTool;
  showAIAssistant: boolean;
  showDetails?: boolean;
  showSummaryPanel?: boolean;
  isSummaryLoading?: boolean;
  onOpenSearch: () => void;
  onSetActiveTool?: (tool: ActiveTool) => void;
  onToggleAIAssistant: () => void;
  onToggleDetails?: () => void;
  onGenerateSummary?: () => void;
  /** Filtro: exibir apenas mensagens com falha terminal (failed/failed_auth/failed_retries). */
  failuresOnly?: boolean;
  onToggleFailuresOnly?: () => void;
  /** Quantidade de mensagens em falha — exibida no aria-label e como contador. */
  failuresCount?: number;
  onOpenValidation?: () => void;
}

interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  badge?: boolean;
  highlight?: boolean;
}

function ToolButton({ icon, label, active, onClick, disabled, badge, highlight }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9 outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 active:scale-95',
            highlight
              ? 'bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/20 hover:text-primary'
              : active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            badge && 'relative'
          )}
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
        >
          {icon}
          {badge && (
            <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-primary" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ChatHeaderToolbar({
  activeTool,
  showAIAssistant: _showAIAssistant,
  showDetails,
  showSummaryPanel,
  isSummaryLoading,
  onOpenSearch,
  onSetActiveTool,
  onToggleAIAssistant: _onToggleAIAssistant,
  onToggleDetails,
  onGenerateSummary,
  failuresOnly,
  onToggleFailuresOnly,
  failuresCount = 0,
  onOpenValidation,
}: ChatHeaderToolbarProps) {
  return (
    <>
      <ToolButton
        icon={<Search className="h-[18px] w-[18px]" />}
        label="Buscar na conversa (Ctrl+F)"
        onClick={onOpenSearch}
        highlight
      />
      {onToggleFailuresOnly && (
        <ToolButton
          icon={
            <span className="relative inline-flex">
              <AlertTriangle className="h-[18px] w-[18px]" />
              {failuresCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 h-[14px] min-w-[14px] rounded-full bg-destructive px-1 text-center text-[9px] font-bold leading-[14px] text-destructive-foreground"
                  aria-hidden="true"
                >
                  {failuresCount > 99 ? '99+' : failuresCount}
                </span>
              )}
            </span>
          }
          label={
            failuresOnly
              ? `Mostrando ${failuresCount} mensagem(s) com falha — clique para limpar`
              : failuresCount > 0
                ? `Filtrar somente falhas (${failuresCount})`
                : 'Filtrar somente falhas terminais'
          }
          active={failuresOnly}
          onClick={onToggleFailuresOnly}
        />
      )}
      <ToolButton
        icon={<Radar className="h-[18px] w-[18px]" />}
        label="Monitoramento de Objeções"
        active={activeTool === 'objections'}
        onClick={() => onSetActiveTool?.('objections')}
      />
      <ToolButton
        icon={<GraduationCap className="h-[18px] w-[18px]" />}
        label="Ajuda dos Universitários"
        active={activeTool === 'university'}
        onClick={() => onSetActiveTool?.('university')}
      />
      <ToolButton
        icon={<LayoutTemplate className="h-[18px] w-[18px]" />}
        label="Templates dinâmicos"
        active={activeTool === 'templates'}
        onClick={() => onSetActiveTool?.('templates')}
      />
      {onGenerateSummary && (
        <ToolButton
          icon={
            isSummaryLoading ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <FileText className="h-[18px] w-[18px]" />
            )
          }
          label="Resumo da conversa"
          active={showSummaryPanel}
          onClick={onGenerateSummary}
          disabled={isSummaryLoading}
        />
      )}
      {onToggleDetails && (
        <ToolButton
          icon={<Info className="h-[18px] w-[18px]" />}
          label="Detalhes do contato"
          active={showDetails}
          onClick={onToggleDetails}
          badge={!showDetails}
        />
      )}
      <ToolButton
        icon={<BarChart3 className="h-[18px] w-[18px]" />}
        label="Métricas de Envio"
        active={activeTool === 'monitoring'}
        onClick={() => onSetActiveTool?.('monitoring')}
      />
      {onOpenValidation && (
        <ToolButton
          icon={<ClipboardCheck className="h-[18px] w-[18px]" />}
          label="Checklist de Validação 10/10"
          onClick={onOpenValidation}
          highlight
        />
      )}
    </>
  );
}
