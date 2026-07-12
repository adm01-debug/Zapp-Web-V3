import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, Clock, RefreshCw, Users, Zap, Filter } from 'lucide-react';
import {
  useQueueSlaPanel,
  QueueSlaFilters,
  QueueSlaRow,
  SlaStatusFilter,
} from '@/hooks/useQueueSlaPanel';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const PRIORITY_LABEL: Record<QueueSlaRow['sla_priority'], string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_COLOR: Record<QueueSlaRow['sla_priority'], string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-warning text-warning-foreground',
  medium: 'bg-primary/15 text-primary',
  low: 'bg-muted text-muted-foreground',
};

export const QueueSlaPanel = () => {
  const [filters, setFilters] = useState<QueueSlaFilters>({
    skill_name: null,
    channel_type: null,
    sla_status: null,
  });
  const [skills, setSkills] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [rebalancing, setRebalancing] = useState(false);

  const { rows, loading, refetch, updateQueueConfig, triggerRebalance } = useQueueSlaPanel(filters);

  useEffect(() => {
    (async () => {
      const [{ data: sk }, { data: ch }] = await Promise.all([
        supabase.from('queue_skill_requirements').select('skill_name'),
        supabase.from('channel_connections').select('channel_type'),
      ]);
      setSkills(Array.from(new Set((sk ?? []).map((s: { skill_name: string | null }) => s.skill_name).filter(Boolean) as string[]))); // ignore-audit: filter(Boolean) removes nulls; cast safely narrows (string|null)[] to string[]
      setChannels(Array.from(new Set((ch ?? []).map((c: { channel_type: string | null }) => c.channel_type).filter(Boolean) as string[]))); // ignore-audit: filter(Boolean) removes nulls; cast safely narrows (string|null)[] to string[]
    })();
  }, []);

  const totals = useMemo(
    () => ({
      waiting: rows.reduce((s, r) => s + r.waiting_count, 0),
      inProgress: rows.reduce((s, r) => s + r.in_progress_count, 0),
      breached: rows.reduce((s, r) => s + r.breached_count, 0),
      atRisk: rows.reduce((s, r) => s + r.at_risk_count, 0),
    }),
    [rows]
  );

  const handleRebalance = async () => {
    setRebalancing(true);
    await triggerRebalance(100);
    setRebalancing(false);
  };

  return (
    <div className="space-y-6">
      {/* KPIs globais */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Aguardando" value={totals.waiting} icon={<Clock className="h-4 w-4" />} />
        <KpiCard
          label="Em atendimento"
          value={totals.inProgress}
          icon={<Users className="h-4 w-4" />}
        />
        <KpiCard
          label="Em risco"
          value={totals.atRisk}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="warning"
        />
        <KpiCard
          label="SLA estourado"
          value={totals.breached}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="destructive"
        />
      </div>

      {/* Filtros + ações */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtros:
          </div>

          <Select
            value={filters.skill_name ?? '__all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, skill_name: v === '__all' ? null : v }))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Habilidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as habilidades</SelectItem>
              {skills.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.channel_type ?? '__all'}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, channel_type: v === '__all' ? null : v }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os canais</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.sla_status ?? '__all'}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                sla_status: v === '__all' ? null : (v as SlaStatusFilter),
              }))
            }
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status SLA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos</SelectItem>
              <SelectItem value="on_track">No prazo</SelectItem>
              <SelectItem value="at_risk">Em risco</SelectItem>
              <SelectItem value="breached">Estourado</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Button size="sm" onClick={handleRebalance} disabled={rebalancing} className="gap-2">
              <Zap className={cn('h-4 w-4', rebalancing && 'animate-pulse')} />
              {rebalancing ? 'Redistribuindo...' : 'Redistribuir agora'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de filas */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Filas — Priorização SLA & Roteamento</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma fila atende aos filtros selecionados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Painel de SLA das filas">
                <thead className="border-b text-xs uppercase text-muted-foreground">
                  <tr className="text-left [&>th]:px-2 [&>th]:py-2">
                    <th scope="col">Fila</th>
                    <th scope="col">Prioridade</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Auto</th>
                    <th scope="col">Agentes</th>
                    <th scope="col">Aguardando</th>
                    <th scope="col">Em atend.</th>
                    <th scope="col">Em risco</th>
                    <th scope="col">Estourados</th>
                    <th scope="col">+ tempo (min)</th>
                    <th scope="col">Último roteamento</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <QueueRow key={r.queue_id} row={r} onUpdate={updateQueueConfig} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Job automático: o sistema redistribui tickets sem agente ou com SLA estourado a cada 5
        minutos, respeitando a prioridade e o peso de cada fila.
      </p>
    </div>
  );
};

function KpiCard({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: 'default' | 'warning' | 'destructive';
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            tone === 'destructive' && 'bg-destructive/10 text-destructive',
            tone === 'warning' && 'bg-warning/10 text-warning',
            tone === 'default' && 'bg-primary/10 text-primary'
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QueueRow({
  row,
  onUpdate,
}: {
  row: QueueSlaRow;
  onUpdate: (id: string, patch: Partial<QueueSlaRow>) => Promise<boolean>;
}) {
  const [weight, setWeight] = useState(String(row.routing_weight));
  useEffect(() => setWeight(String(row.routing_weight)), [row.routing_weight]);

  return (
    <tr className="border-b hover:bg-muted/30 [&>td]:px-2 [&>td]:py-2">
      <td>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
          <span className="font-medium">{row.queue_name}</span>
        </div>
      </td>
      <td>
        <Select
          value={row.sla_priority}
          onValueChange={(v) => onUpdate(row.queue_id, { sla_priority: v as QueueSlaRow['sla_priority']  /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */})}
        >
          <SelectTrigger className="h-8 w-[110px]">
            <Badge className={cn('text-[10px]', PRIORITY_COLOR[row.sla_priority])}>
              {PRIORITY_LABEL[row.sla_priority]}
            </Badge>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">Crítica</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="low">Baixa</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td>
        <Input
          type="number"
          min={0}
          max={100}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          onBlur={() => {
            const n = Math.max(0, Math.min(100, Number(weight) || 0));
            if (n !== row.routing_weight) onUpdate(row.queue_id, { routing_weight: n });
          }}
          className="h-8 w-16"
        />
      </td>
      <td>
        <Switch
          checked={row.auto_rebalance_enabled}
          onCheckedChange={(v) => onUpdate(row.queue_id, { auto_rebalance_enabled: v })}
        />
      </td>
      <td>{row.active_agents}</td>
      <td>{row.waiting_count}</td>
      <td>{row.in_progress_count}</td>
      <td>
        {row.at_risk_count > 0 ? (
          <Badge variant="outline" className="border-warning text-warning">
            {row.at_risk_count}
          </Badge>
        ) : (
          '0'
        )}
      </td>
      <td>
        {row.breached_count > 0 ? <Badge variant="destructive">{row.breached_count}</Badge> : '0'}
      </td>
      <td className="tabular-nums">{Math.round(Number(row.oldest_wait_minutes) || 0)}</td>
      <td className="text-xs text-muted-foreground">
        {row.last_routed_at ? new Date(row.last_routed_at).toLocaleTimeString() : '—'}
      </td>
    </tr>
  );
}
