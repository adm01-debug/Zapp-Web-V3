import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { History, Search, AlertTriangle, XCircle, CheckCircle2, RefreshCw, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useSLAAlertHistory,
  type SLAAlertHistoryEntry,
  type SLAAlertSeverity,
} from '@/features/sla';

type SeverityFilter = 'all' | SLAAlertSeverity;

function HistoryRow({ entry, onResolve, isResolving }: { entry: SLAAlertHistoryEntry; onResolve: (id: string) => void; isResolving: boolean }) {
  const isBreach = entry.status === 'violated';
  
  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors',
        isBreach ? 'border-destructive/30' : 'border-warning/30',
        entry.isResolved && 'opacity-60 grayscale-[0.5]'
      )}
      role="listitem"
    >
      <div
        className={cn(
          'mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isBreach ? 'bg-destructive/10' : 'bg-warning/10',
          entry.isResolved && 'bg-success/10'
        )}
      >
        {entry.isResolved ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : (
          isBreach ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-warning" />
          )
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">{entry.contactName}</span>
          <Badge
            variant="outline"
            className={cn(
              'text-[10px] h-5 px-1.5 font-medium border inline-flex items-center gap-1',
              isBreach
                ? 'bg-destructive/15 text-destructive border-destructive/30'
                : 'bg-warning/15 text-warning border-warning/30',
              entry.isResolved && 'bg-success/15 text-success border-success/30'
            )}
          >
            {entry.isResolved ? 'Resolvido' : (isBreach ? 'Violado' : 'Em risco')}
          </Badge>
          {entry.isResolved && entry.resolvedAt && (
            <span className="text-[10px] text-muted-foreground">
              Resolvido em {format(new Date(entry.resolvedAt), "dd/MM HH:mm", { locale: ptBR })}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {entry.contactPhone && <span>{entry.contactPhone}</span>}
          <span className="text-foreground/40">·</span>
          <span>
            Thread ID: <span className="text-foreground/80 font-medium  text-[10px]">{entry.threadId.slice(0, 8)}...</span>
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
          {format(new Date(entry.alertTime), "dd/MM HH:mm", { locale: ptBR })}
        </div>
        {!entry.isResolved && (
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7 px-2 text-[10px] gap-1 hover:bg-success/10 hover:text-success hover:border-success/50"
            onClick={() => onResolve(entry.id)}
            disabled={isResolving}
          >
            {isResolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
            Resolver
          </Button>
        )}
      </div>
    </div>
  );
}

/** SLAAlert History. */
export default function SLAAlertHistory() {
  const { data, isLoading, refetch, isFetching, resolveAlert, isResolving } = useSLAAlertHistory();
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [currentView, setCurrentView] = useState('sla-history');

  const filtered = useMemo(() => {
    const items = data ?? [];
    const q = search.trim().toLowerCase();
    return items.filter((entry) => {
      if (severity !== 'all' && entry.status !== severity) return false;
      if (!q) return true;
      const haystack = [
        entry.contactName,
        entry.contactPhone ?? '',
        entry.threadId,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search, severity]);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <History className="w-6 h-6 text-primary" />
                Histórico de alertas de SLA
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Monitoramento de respostas em tempo real por conversa.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
              Atualizar
            </Button>
          </header>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filtros</CardTitle>
              <CardDescription>Busque por contato ou thread ID.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por contato ou thread ID..."
                  className="pl-9"
                  aria-label="Buscar alertas"
                />
              </div>
              <ToggleGroup
                type="single"
                value={severity}
                onValueChange={(v) => v && setSeverity(v as SeverityFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */)}
                size="sm"
                variant="outline"
                aria-label="Filtrar por severidade"
                className="justify-start gap-1"
              >
                <ToggleGroupItem value="all" className="h-7 px-3 text-xs">
                  Todos
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="risk"
                  className="h-7 px-3 text-xs data-[state=on]:bg-warning/15 data-[state=on]:text-warning"
                >
                  <AlertTriangle className="w-3 h-3 mr-1" />Em risco
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="violated"
                  className="h-7 px-3 text-xs data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"
                >
                  <XCircle className="w-3 h-3 mr-1" />Violado
                </ToggleGroupItem>
              </ToggleGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Alertas Recentes</span>
                <Badge variant="outline" className="text-[10px]">
                  {filtered.length} {filtered.length === 1 ? 'alerta' : 'alertas'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <GenericEmptyState
                  icon={History}
                  title={search || severity !== 'all' ? 'Nenhum alerta corresponde aos filtros' : 'Nenhum alerta registrado ainda'}
                  description={
                    search || severity !== 'all'
                      ? 'Ajuste a busca ou limpe os filtros para ver mais resultados.'
                      : 'Quando um SLA entrar em risco ou for violado, o disparo aparecerá aqui.'
                  }
                  className="py-8"
                />
              ) : (
                <div role="list" className="space-y-2">
                  {filtered.map((entry) => (
                    <HistoryRow 
                      key={entry.id} 
                      entry={entry} 
                      onResolve={resolveAlert}
                      isResolving={isResolving}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
