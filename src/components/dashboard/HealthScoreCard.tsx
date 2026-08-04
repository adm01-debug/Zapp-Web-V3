import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';

/**
 * DASHBOARD-17 — Health Score.
 *
 * Conecta um card mínimo ao zapp.fn_system_health_score() (RPC SECURITY DEFINER
 * que avalia 100pts de saúde da infra — wpp2, webhook pipeline, WAL, backups etc.
 * — e retorna { score, grade, breakdown }). A função e o cache (fn_health_score_cache)
 * são mantidos por crons no banco; nenhum painel lia o resultado antes.
 *
 * Shape defensivo: `result` é Json — renderiza score/grade + itens do breakdown
 * (key, score/max, status) quando presentes; sem dados → estado vazio explícito.
 */

type BreakdownItem = { score?: number; max?: number; status?: string | number; [k: string]: unknown };

interface HealthScoreResult {
  score?: number | string;
  grade?: string;
  breakdown?: Record<string, BreakdownItem | null> | null;
}

function gradeVariant(grade: string | undefined): 'default' | 'secondary' | 'destructive' {
  if (!grade) return 'secondary';
  const g = grade.toLowerCase();
  if (g === 'excelente' || g === 'excellent' || g === 'a' || g === 'pass') return 'default';
  if (g === 'critico' || g === 'critical' || g === 'f' || g === 'fail') return 'destructive';
  return 'secondary';
}

function fmtStatus(value: string | number | undefined): string {
  if (value === undefined) return '—';
  return String(value);
}

/** Health Score card — reads zapp.fn_system_health_score() (DASHBOARD-17). */
export function HealthScoreCard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'health-score'],
    queryFn: async (): Promise<HealthScoreResult | null> => {
      const { data, error: rpcError } = await supabase.rpc('fn_system_health_score');
      if (rpcError) throw rpcError;
      if (data == null || typeof data !== 'object') return null;
      return data as HealthScoreResult;
    },
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  const breakdownEntries = useMemo(() => {
    const bd = data?.breakdown;
    if (!bd || typeof bd !== 'object') return [];
    return Object.entries(bd).filter(
      (entry): entry is [string, BreakdownItem] => !!entry[1] && typeof entry[1] === 'object'
    );
  }, [data]);

  const score =
    typeof data?.score === 'number'
      ? data.score
      : typeof data?.score === 'string'
        ? Number(data.score)
        : null;

  if (isLoading) {
    return <Skeleton className="h-28 w-full rounded-xl" />;
  }

  if (error || data == null || score == null) {
    return (
      <Card className="border border-border/60 bg-card">
        <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <Activity className="h-6 w-6 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">Health Score indisponível</p>
          <p className="max-w-md text-xs text-muted-foreground/70">
            {error
              ? `Erro ao chamar fn_system_health_score: ${error.message}`
              : 'A função de health score não retornou dados.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/60 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-primary" />
          Health Score da Infra
        </CardTitle>
        <CardDescription className="text-xs">
          Avaliação automática (0–100) — wpp2, pipeline, WAL, backups e auditoria
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center rounded-xl bg-primary/10 px-6 py-4">
            <span className="text-4xl font-bold tabular-nums text-primary">{score}</span>
            <Badge variant={gradeVariant(data.grade)} className="mt-1">
              {data.grade ?? '—'}
            </Badge>
          </div>
          <div className="min-w-0 flex-1">
            {breakdownEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem breakdown disponível.</p>
            ) : (
              <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                {breakdownEntries.slice(0, 12).map(([key, item]) => (
                  <li key={key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{key}</span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                      <span className="font-medium">
                        {item.score ?? 0}/{item.max ?? '—'}
                      </span>
                      <Badge variant="outline" className="text-[9px]">
                        {fmtStatus(item.status)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
