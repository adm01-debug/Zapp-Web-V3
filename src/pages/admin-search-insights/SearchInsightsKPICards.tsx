import { Card, CardContent } from '@/components/ui/card';
import { Search, MousePointerClick, AlertCircle, Sparkles } from 'lucide-react';
import { normalizeSearchInsights, type SearchInsights } from '@/hooks/useSearchManagement';

interface Props {
  /** Raw or partial RPC payload — normalized internally for type-safety. */
  data: SearchInsights | Partial<SearchInsights> | Record<string, unknown> | null | undefined;
  isLoading: boolean;
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtInt(v: number) {
  return v.toLocaleString('pt-BR');
}

interface KpiProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}

function KpiCard({ icon, label, value, hint }: KpiProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Search Insights K P I Cards function. */
export function SearchInsightsKPICards({ data, isLoading }: Props) {
  const insights: SearchInsights = normalizeSearchInsights(data);
  const placeholder = isLoading ? '—' : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiCard
        icon={<Search className="h-3.5 w-3.5" />}
        label="Total de buscas"
        value={placeholder ?? fmtInt(insights.total_searches)}
        hint={`${fmtInt(insights.unique_queries)} queries únicas`}
      />
      <KpiCard
        icon={<Sparkles className="h-3.5 w-3.5" />}
        label="% busca vetorial"
        value={placeholder ?? fmtPct(insights.vector_share)}
        hint={`${fmtInt(insights.vector_searches)} chamadas`}
      />
      <KpiCard
        icon={<MousePointerClick className="h-3.5 w-3.5" />}
        label="Click-through rate"
        value={placeholder ?? fmtPct(insights.click_through_rate)}
        hint={`${fmtInt(insights.total_clicks)} cliques`}
      />
      <KpiCard
        icon={<AlertCircle className="h-3.5 w-3.5" />}
        label="Zero resultados"
        value={placeholder ?? fmtPct(insights.zero_result_rate)}
        hint={`${fmtInt(insights.zero_result_count)} buscas sem retorno`}
      />
    </div>
  );
}
