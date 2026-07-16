import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  Sparkles,
  Zap,
  Info,
  RefreshCw,
} from 'lucide-react';
import { SLAInfo, AIConversationTag } from '@/hooks/useContactEnrichedData';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SLAAndAITagsSectionProps {
  slaInfo: SLAInfo | null | undefined;
  aiTags: AIConversationTag[];
  isLoadingAITags?: boolean;
  isLoadingSLA?: boolean;
  aiTagsError?: Error | null;
  slaError?: Error | null;
  onRetryAITags?: () => void;
  onRetrySLA?: () => void;
}

const confidenceColor = (c: number) => {
  if (c >= 0.8) return 'bg-success/15 text-success border-success/30';
  if (c >= 0.5) return 'bg-warning/15 text-warning border-warning/30';
  return 'bg-muted/20 text-muted-foreground border-border/30';
};

function SectionErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px] text-destructive hover:bg-destructive/20"
          onClick={onRetry}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function SLAAndAITagsSection({
  slaInfo,
  aiTags,
  isLoadingAITags = false,
  isLoadingSLA = false,
  aiTagsError = null,
  slaError = null,
  onRetryAITags,
  onRetrySLA,
}: SLAAndAITagsSectionProps) {
  const hasSLA =
    slaInfo &&
    (slaInfo.first_response_breached !== null || slaInfo.resolution_breached !== null);
  const hasAITags = aiTags.length > 0;

  const showSLABlock = isLoadingSLA || slaError || hasSLA;
  const showAIBlock = isLoadingAITags || aiTagsError || hasAITags;

  // Se nada carregando, sem erro e sem dados — mostra placeholder discreto ao invés de nada.
  if (!showSLABlock && !showAIBlock) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg bg-background/40 px-2.5 py-2 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <Info className="h-3.5 w-3.5 opacity-70" />
        <span>Sem informações de SLA ou tags de IA para este contato.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* SLA Block */}
      {showSLABlock && (
        <div className="space-y-1.5" aria-busy={isLoadingSLA || undefined}>
          {isLoadingSLA ? (
            <>
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </>
          ) : slaError ? (
            <SectionErrorBanner
              message="Não foi possível carregar o SLA."
              onRetry={onRetrySLA}
            />
          ) : hasSLA ? (
            <>
              <div className="flex items-center justify-between text-xs bg-background/40 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">1ª Resposta</span>
                </div>
                {slaInfo?.first_response_breached ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Violado
                  </Badge>
                ) : slaInfo?.first_response_at ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-success/15 text-success border-success/30"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    OK
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-warning/15 text-warning border-warning/30"
                  >
                    Pendente
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between text-xs bg-background/40 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-primary" />
                  <span className="text-muted-foreground">Resolução</span>
                </div>
                {slaInfo?.resolution_breached ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-destructive/15 text-destructive border-destructive/30 animate-pulse"
                  >
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Violado
                  </Badge>
                ) : slaInfo?.resolved_at ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-success/15 text-success border-success/30"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Resolvido
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] bg-warning/15 text-warning border-warning/30"
                  >
                    Em andamento
                  </Badge>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* Separator */}
      {showSLABlock && showAIBlock && (
        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
      )}

      {/* AI Tags Block */}
      {showAIBlock && (
        <div className="space-y-2" aria-busy={isLoadingAITags || undefined}>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <Zap className="w-3 h-3" />
            <span>Tags geradas por IA</span>
          </div>
          {isLoadingAITags ? (
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ) : aiTagsError ? (
            <SectionErrorBanner
              message="Não foi possível carregar as tags de IA."
              onRetry={onRetryAITags}
            />
          ) : hasAITags ? (
            <TooltipProvider>
              <div className="flex flex-wrap gap-1.5">
                {aiTags.map((tag, i) => (
                  <Tooltip key={tag.id}>
                    <TooltipTrigger asChild>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] cursor-default transition-all hover:scale-105',
                            tag.confidence
                              ? confidenceColor(tag.confidence)
                              : 'bg-primary/10 border-primary/20 text-foreground'
                          )}
                        >
                          <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                          {tag.tag_name}
                        </Badge>
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {tag.confidence
                        ? `Confiança: ${Math.round(tag.confidence * 100)}%`
                        : 'Tag IA'}
                      {tag.source && ` • Fonte: ${tag.source}`}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </TooltipProvider>
          ) : null}
        </div>
      )}
    </div>
  );
}
