import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLatestAnalysis } from '@/hooks/useLatestAnalysis';
import { AlertTriangle, ThumbsUp, ThumbsDown, Minus, Zap } from 'lucide-react';

const sentimentMap: Record<string, { icon: typeof ThumbsUp; color: string; label: string }> = {
  positivo: { icon: ThumbsUp, color: 'text-success', label: 'Positivo' },
  neutro: { icon: Minus, color: 'text-muted-foreground', label: 'Neutro' },
  negativo: { icon: ThumbsDown, color: 'text-warning', label: 'Negativo' },
  critico: { icon: AlertTriangle, color: 'text-destructive', label: 'Crítico' },
};

const urgencyMap: Record<string, { color: string; label: string }> = {
  baixa: { color: 'bg-success/15 text-success border-success/30', label: 'Baixa' },
  media: { color: 'bg-warning/15 text-warning border-warning/30', label: 'Média' },
  alta: { color: 'bg-destructive/15 text-destructive border-destructive/30', label: 'Alta' },
  critica: {
    color: 'bg-destructive/25 text-destructive border-destructive/40 animate-pulse',
    label: 'Crítica',
  },
};

interface AnalysisBadgesProps {
  contactId: string;
  compact?: boolean;
  className?: string;
}

export function AnalysisBadges({ contactId, compact = false, className }: AnalysisBadgesProps) {
  const { data: analysis } = useLatestAnalysis(contactId);

  if (!analysis) return null;

  const sentCfg = sentimentMap[analysis.sentiment];
  const urgCfg = analysis.urgency ? urgencyMap[analysis.urgency] : null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {sentCfg && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn('flex h-4 w-4 items-center justify-center', sentCfg.color)}>
                <sentCfg.icon className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[200px] text-xs">
              <p className="font-medium">Sentimento: {sentCfg.label}</p>
              {analysis.summary && (
                <p className="mt-0.5 line-clamp-2 text-muted-foreground">{analysis.summary}</p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
        {urgCfg && analysis.urgency !== 'baixa' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Zap
                className={cn(
                  'h-3 w-3',
                  analysis.urgency === 'alta' || analysis.urgency === 'critica'
                    ? 'text-destructive'
                    : 'text-warning'
                )}
              />
            </TooltipTrigger>
            <TooltipContent className="text-xs">Urgência: {urgCfg.label}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {sentCfg && (
        <Badge
          variant="outline"
          className={cn(
            'gap-0.5 border text-[10px]',
            sentCfg.color === 'text-success' && 'border-success/30 bg-success/10',
            sentCfg.color === 'text-warning' && 'border-warning/30 bg-warning/10',
            sentCfg.color === 'text-destructive' && 'border-destructive/30 bg-destructive/10'
          )}
        >
          <sentCfg.icon className="h-3 w-3" />
          {sentCfg.label}
        </Badge>
      )}
      {urgCfg && (
        <Badge variant="outline" className={cn('border text-[10px]', urgCfg.color)}>
          Urg: {urgCfg.label}
        </Badge>
      )}
      {analysis.department && (
        <Badge variant="outline" className="border border-border/50 text-[10px]">
          {analysis.department}
        </Badge>
      )}
    </div>
  );
}
