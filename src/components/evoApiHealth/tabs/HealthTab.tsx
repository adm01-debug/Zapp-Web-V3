import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Database, Server, Zap } from 'lucide-react';
import { KpiCard } from '../KpiCard';
import { Stat } from '../Stat';
import { DashboardResponse } from '@/lib/evoApiHealth/types';

interface HealthTabProps {
  data?: DashboardResponse;
}

/** Health Tab component for the evoApiHealth section. */
export const HealthTab = React.memo(({ data }: HealthTabProps) => {
  const health = data?.health;
  const readiness = data?.readiness;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Instâncias abertas"
          value={health?.instances_open ?? '—'}
          total={health?.instances_total}
          icon={Server}
        />
        <KpiCard
          title="Mensagens (5m)"
          value={health?.messages_last_5m?.toLocaleString('pt-BR') ?? '—'}
          icon={Activity}
        />
        <KpiCard
          title="Mensagens (24h)"
          value={health?.messages_last_24h?.toLocaleString('pt-BR') ?? '—'}
          icon={Database}
        />
        <KpiCard
          title="Lag (s)"
          value={health?.lag_seconds ?? '—'}
          icon={Zap}
          warning={(health?.lag_seconds ?? 0) > 60}
        />
      </div>

      {readiness && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhes de prontidão</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Tabelas" value={readiness.tables_count} status={readiness.tables_status} />
            <Stat label="Enums" value={readiness.enums_count} status={readiness.enums_status} />
            <Stat label="Foreign Keys" value={readiness.fk_count} status={readiness.fk_status} />
            <Stat label="Realtime" value={readiness.realtime_count} status={readiness.realtime_status} />
            <Stat label="Replica Full" value={readiness.replica_full_count} status={readiness.replica_full_status} />
            <Stat label="Índices" value={readiness.index_count} />
            <Stat label="Triggers" value={readiness.trigger_count} />
            <Stat label="Cron Jobs" value={readiness.cron_jobs} />
          </CardContent>
        </Card>
      )}
    </div>
  );
});
