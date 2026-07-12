import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useSearchInsights } from '@/hooks/useSearchInsights';
import { SearchInsightsKPICards } from './admin-search-insights/SearchInsightsKPICards';
import { SearchInsightsTables } from './admin-search-insights/SearchInsightsTables';
import { cn } from '@/lib/utils';

const WINDOWS: Array<{ days: number; label: string }> = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
];

export default function AdminSearchInsightsPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isFetching, refetch, error } = useSearchInsights(days);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Search className="h-5 w-5" /> Search Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            KPIs e queries mais frequentes da busca global. Use as queries zero-result para curar a base de conhecimento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {WINDOWS.map((w) => (
              <Button
                key={w.days}
                variant="ghost"
                size="sm"
                className={cn('h-8 px-3 text-xs', days === w.days && 'bg-background shadow-sm')}
                onClick={() => setDays(w.days)}
              >
                {w.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </header>

      {error && (
        <Card>
          <CardContent className="p-6">
            <GenericEmptyState
              icon={Search}
              title="Falha ao carregar insights"
              description={error instanceof Error ? error.message : 'Erro desconhecido'}
              className="py-4"
            />
          </CardContent>
        </Card>
      )}

      {!error && data && data.total_searches === 0 && !isLoading ? (
        <Card>
          <CardContent className="p-6">
            <GenericEmptyState
              icon={Search}
              title="Sem buscas no período"
              description="Nenhum evento de busca foi registrado na janela selecionada. Tente ampliar o período."
              className="py-8"
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <SearchInsightsKPICards data={data ?? { total_searches: 0, unique_queries: 0, vector_searches: 0, vector_share: 0, total_clicks: 0, click_through_rate: 0, zero_result_count: 0, zero_result_rate: 0, avg_result_count: 0, top_queries: [], zero_result_queries: [], window_days: days }} isLoading={isLoading} />
          {data && <SearchInsightsTables data={data} />}
        </>
      )}
    </div>
  );
}
