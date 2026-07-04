/**
 * CSATWidget.tsx
 * CSAT/NPS dashboard widget using get_csat_stats() RPC.
 * Shows: avg score, NPS, score distribution, top agents.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('CSATWidget');

interface CSATStats {
  total_responses:    number;
  avg_score:          number | null;
  nps_promoters:      number;
  nps_detractors:     number;
  nps_passives:       number;
  nps_score:          number;
  score_distribution: Record<string, number>;
  by_agent:           Record<string, number> | null;
  period_days:        number;
}

function getNPSColor(nps: number): string {
  if (nps >= 50)  return 'text-primary';
  if (nps >= 0)   return 'text-warning-foreground';
  return 'text-destructive-foreground';
}

function renderStars(score: number): React.ReactNode {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= Math.round(score / 2) ? 'fill-amber-400 text-warning-foreground' : 'text-muted-foreground'}`}
        />
      ))}
    </div>
  );
}

interface Props { instanceName?: string; days?: number; compact?: boolean; }

export const CSATWidget: React.FC<Props> = ({
  instanceName = 'wpp2', days = 30, compact = false,
}) => {
  const [stats,   setStats]   = useState<CSATStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('get_csat_stats', {
        p_instance_name: instanceName,
        p_days: days,
      });
      if (error) throw error;
      setStats(data as unknown as CSATStats);
    } catch (err) { log.error('Failed to load CSAT stats', err); }
    finally { setLoading(false); }
  }, [instanceName, days]);

  useEffect(() => { load(); }, [load]);

  if (!stats) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-6 bg-muted rounded w-40" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  if (stats.total_responses === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma avaliação nos últimos {days} dias.</p>
      </div>
    );
  }

  const npsColor = getNPSColor(stats.nps_score);
  const maxDist  = Math.max(...Object.values(stats.score_distribution ?? {}));

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {renderStars(stats.avg_score ?? 0)}
        <span className="font-semibold">{stats.avg_score?.toFixed(1) ?? '—'}/10</span>
        <span className="text-muted-foreground">{stats.total_responses} avaliações</span>
        <span className={`font-semibold ${npsColor}`}>NPS {stats.nps_score}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-warning-foreground" />
          <h3 className="text-sm font-semibold">CSAT / NPS — últimos {days} dias</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 w-7 p-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            {renderStars(stats.avg_score ?? 0)}
            <p className="text-2xl font-bold mt-1">{stats.avg_score?.toFixed(1) ?? '—'}</p>
            <p className="text-xs text-muted-foreground">{stats.total_responses} avaliações</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-3xl font-bold ${npsColor}`}>{stats.nps_score}</p>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              {stats.nps_score >= 50
                ? <TrendingUp className="h-3.5 w-3.5 text-primary" />
                : stats.nps_score < 0
                  ? <TrendingDown className="h-3.5 w-3.5 text-destructive-foreground" />
                  : <Minus className="h-3.5 w-3.5 text-warning-foreground" />}
              <p className="text-xs text-muted-foreground">NPS Score</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-primary">👍 {stats.nps_promoters}</span>
              <span className="text-muted-foreground">😐 {stats.nps_passives}</span>
              <span className="text-destructive-foreground">👎 {stats.nps_detractors}</span>
            </div>
            <div className="flex gap-0.5 h-3 rounded overflow-hidden">
              {stats.nps_promoters > 0 && (
                <div className="bg-primary" style={{ flex: stats.nps_promoters }} />
              )}
              {stats.nps_passives > 0 && (
                <div className="bg-warning" style={{ flex: stats.nps_passives }} />
              )}
              {stats.nps_detractors > 0 && (
                <div className="bg-destructive" style={{ flex: stats.nps_detractors }} />
              )}
            </div>
            <p className="text-xs text-muted-foreground">Promotores / Neutros / Detratores</p>
          </CardContent>
        </Card>
      </div>

      {/* Score distribution */}
      {stats.score_distribution && Object.keys(stats.score_distribution).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Distribuição de notas</p>
          <div className="space-y-1">
            {[10,9,8,7,6,5,4,3,2,1,0].map((score) => {
              const count = stats.score_distribution[score.toString()] ?? 0;
              const pct   = maxDist > 0 ? Math.round((count / maxDist) * 100) : 0;
              const color = score >= 9 ? 'bg-primary' : score >= 7 ? 'bg-warning' : 'bg-destructive';
              return count > 0 ? (
                <div key={score} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right text-muted-foreground">{score}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className={`h-2 ${color} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{count}</span>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CSATWidget;
