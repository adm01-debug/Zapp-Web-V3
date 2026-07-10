/**
 * SLADashboard.tsx
 * SLA compliance dashboard using get_sla_dashboard() RPC.
 * Shows violations, compliance rate, and overdue alerts.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert,
} from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';

const log = getLogger('SLADashboard');

interface SLAStats {
  total_violations:          number;
  unresolved_violations:     number;
  first_response_violations: number;
  resolution_violations:     number;
  breached_conversations:    number;
  compliance_rate_pct:       number;
  avg_overdue_minutes:       number | null;
  period_days:               number;
}

function getComplianceColor(rate: number): string {
  if (rate >= 95) return 'text-primary';
  if (rate >= 80) return 'text-warning-foreground';
  return 'text-destructive-foreground';
}

function getProgressColor(rate: number): string {
  if (rate >= 95) return 'bg-primary';
  if (rate >= 80) return 'bg-warning';
  return 'bg-destructive';
}

interface Props {
  instanceName?: string;
  days?:         number;
  compact?:      boolean;
}

export const SLADashboard: React.FC<Props> = ({
  instanceName = 'wpp2', days = 7, compact = false,
}) => {
  const mountedRef = useMountedRef();
  const [stats,   setStats]   = useState<SLAStats | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await safeClient.rpc<SLAStats>('get_sla_dashboard', {
        p_instance_name: instanceName,
        p_days: days,
      });
      if (error) throw error;
      if (mountedRef.current) setStats(data);
    } catch (err) {
      log.error('Failed to load SLA dashboard', err);
    } finally { if (mountedRef.current) setLoading(false); }
  }, [instanceName, days, mountedRef]);

  useEffect(() => { load(); }, [load]);

  if (!stats) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-6 bg-muted rounded w-48" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  const complianceColor   = getComplianceColor(stats.compliance_rate_pct);
  const progressBarColor  = getProgressColor(stats.compliance_rate_pct);
  const hasViolations     = stats.unresolved_violations > 0;

  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className={`flex items-center gap-1 font-semibold ${complianceColor}`}>
          {stats.compliance_rate_pct >= 95
            ? <CheckCircle2 className="h-3.5 w-3.5" />
            : <AlertTriangle className="h-3.5 w-3.5" />}
          SLA {stats.compliance_rate_pct}%
        </span>
        {hasViolations && (
          <Badge variant="destructive" className="text-xs">
            {stats.unresolved_violations} violações
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">SLA — últimos {days} dias</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} className="h-7 w-7 p-0">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Compliance rate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Taxa de Conformidade</span>
          <span className={`text-2xl font-bold ${complianceColor}`}>
            {stats.compliance_rate_pct}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all ${progressBarColor}`}
            style={{ width: `${Math.min(stats.compliance_rate_pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Meta: 95% | Período: {days} dias
        </p>
      </div>

      {/* Violations alert */}
      {hasViolations && (
        <Alert className="border-destructive bg-destructive">
          <AlertTriangle className="h-4 w-4 text-destructive-foreground" />
          <AlertDescription className="text-sm text-destructive-foreground">
            <strong>{stats.unresolved_violations}</strong> violação{stats.unresolved_violations !== 1 ? 'ões' : ''} ativa{stats.unresolved_violations !== 1 ? 's' : ''} em{' '}
            <strong>{stats.breached_conversations}</strong> conversa{stats.breached_conversations !== 1 ? 's' : ''}.
          </AlertDescription>
        </Alert>
      )}

      {/* Violation breakdown */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className={`text-xl font-bold ${stats.first_response_violations > 0 ? 'text-destructive-foreground' : 'text-primary'}`}>
              {stats.first_response_violations}
            </p>
            <p className="text-muted-foreground">1ª Resposta</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className={`text-xl font-bold ${stats.resolution_violations > 0 ? 'text-destructive-foreground' : 'text-primary'}`}>
              {stats.resolution_violations}
            </p>
            <p className="text-muted-foreground">Resolução</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-2.5 text-center">
            <p className="text-xl font-bold text-muted-foreground">
              {stats.avg_overdue_minutes
                ? `${Math.round(stats.avg_overdue_minutes)}min`
                : '—'}
            </p>
            <p className="text-muted-foreground">Atraso médio</p>
          </CardContent>
        </Card>
      </div>

      {stats.compliance_rate_pct >= 95 && !hasViolations && (
        <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 rounded-lg p-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>Todos os SLAs cumpridos no período! 🎉</span>
        </div>
      )}
    </div>
  );
};

export default SLADashboard;
