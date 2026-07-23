import { useAITagStats, useRetagRecentContacts } from '@/hooks/useAIAutoTags';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Tags, Brain, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** AIAuto Tags Config component for the settings section. */
export function AIAutoTagsConfig() {
  const { data: tagStats = [], isLoading } = useAITagStats();

  const retagMutation = useRetagRecentContacts((count) => {
    toast({
      title: 'Tags atualizadas!',
      description: `${count} conversas classificadas por IA.`,
    });
  });

  // Wrap onError to use toast
  const handleRetag = () => {
    retagMutation.mutate(undefined, {
      onError: (e: Error) => {
        toast({ title: 'Erro', description: e.message, variant: 'destructive' });
      },
    });
  };

  const tagColors: Record<string, string> = {
    suporte_tecnico: 'bg-info/15 text-info border-info',
    vendas: 'bg-success/15 text-success border-success',
    financeiro: 'bg-warning/15 text-warning border-warning',
    reclamacao: 'bg-destructive/15 text-destructive border-destructive',
    elogio: 'bg-success/15 text-success border-success/30',
    urgente: 'bg-destructive/15 text-destructive border-destructive/30',
    cancelamento: 'bg-warning/15 text-warning border-warning',
    duvida: 'bg-primary/15 text-primary border-primary',
    feedback: 'bg-info/15 text-info border-info/30',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Tags className="h-5 w-5 text-primary" />
            Tags Automáticas por IA
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Classificação automática de conversas por tema e sentimento usando IA.
          </p>
        </div>
        <Button
          onClick={handleRetag}
          disabled={retagMutation.isPending}
          className="gap-2"
        >
          {retagMutation.isPending ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {retagMutation.isPending ? 'Classificando...' : 'Classificar Recentes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4" />
            Distribuição de Tags
          </CardTitle>
          <CardDescription>
            Tags geradas automaticamente pela IA com base no conteúdo das conversas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Carregando...</div>
          ) : tagStats.length === 0 ? (
            <div className="py-8 text-center">
              <Tags className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhuma tag gerada ainda.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clique em "Classificar Recentes" para começar.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tagStats.map((tag) => {
                const maxCount = Math.max(...tagStats.map((t) => t.count));
                const barWidth = (tag.count / maxCount) * 100;
                const colorClass = tagColors[tag.name] || 'bg-muted text-foreground border-border';

                return (
                  <div key={tag.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={cn('text-xs', colorClass)}>
                        {tag.name.replace(/_/g, ' ')}
                      </Badge>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{tag.count} conversas</span>
                        <span>•</span>
                        <span>{(tag.avgConfidence * 100).toFixed(0)}% confiança</span>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}