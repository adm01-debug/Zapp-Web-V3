import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Download, Activity, Clock, Zap, Inbox, Database } from 'lucide-react';
import { format } from 'date-fns';
import { getLogger } from '@/lib/logger';
import { useTeamPerformance } from '@/features/inbox/hooks/team-chat';

const log = getLogger('TeamPerformancePanel');

/** Janela da telemetria real: últimos 30 minutos da conversa. */
const WINDOW_MINUTES = 30;

interface Props {
  conversationId: string;
}

interface SeriesPoint {
  timestamp: number;
  label: string;
  value: number;
}

/**
 * Team Performance Panel — telemetria REAL derivada de `team_messages`
 * (msgs/min, intervalo entre mensagens, entregues/lidas) para a conversa
 * ativa. Nenhum valor é fabricado: sem dados, o painel mostra estado vazio
 * honesto ("Sem telemetria coletada") em vez de mock.
 *
 * Nota (Etapa 66): web-vitals por conversa (LCP/INP) ainda NÃO são coletados
 * — não existe coluna conversation_id em query_telemetry/performance_snapshots.
 * O painel não inventa esses números; quando a coleta existir, ela entra aqui.
 */
export function TeamPerformancePanel({ conversationId }: Props) {
  const { data: messages, isLoading, isError } = useTeamPerformance(conversationId);

  const metrics = useMemo(() => {
    const rows = messages ?? [];
    if (rows.length === 0) return null;

    const now = Date.now();
    const start = now - WINDOW_MINUTES * 60_000;
    // Buckets de 1 minuto cobrindo a janela inteira (zeros preenchidos).
    const buckets = new Map<number, number>();
    for (let i = 0; i < WINDOW_MINUTES; i++) buckets.set(start + i * 60_000, 0);

    let firstTs: number | null = null;
    let lastTs: number | null = null;
    let delivered = 0;
    let read = 0;

    for (const row of rows) {
      if (!row.created_at) continue;
      const ts = new Date(row.created_at).getTime();
      if (Number.isNaN(ts)) continue;
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
      const bucket = Math.max(start, Math.floor(ts / 60_000) * 60_000);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
      const st = row.status;
      if (st === 'delivered' || st === 'read') delivered++;
      if (st === 'read') read++;
    }

    const series: SeriesPoint[] = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([timestamp, value]) => ({
        timestamp,
        label: format(new Date(timestamp), 'HH:mm'),
        value,
      }));

    const total = rows.length;
    const activeSpanMs = (lastTs ?? now) - (firstTs ?? start);
    const activeMinutes = Math.max(1, Math.ceil(activeSpanMs / 60_000));
    const avgPerMin = total / activeMinutes;
    const avgGapSeconds =
      total > 1 && firstTs !== null && lastTs !== null
        ? (lastTs - firstTs) / (total - 1) / 1000
        : 0;
    const deliveredPct = total > 0 ? (delivered / total) * 100 : 0;
    const readPct = total > 0 ? (read / total) * 100 : 0;

    const statusDistribution = [
      { label: 'Enviadas', value: Math.max(0, total - delivered) },
      { label: 'Entregues', value: Math.max(0, delivered - read) },
      { label: 'Lidas', value: read },
    ];

    return {
      series,
      statusDistribution,
      total,
      avgPerMin,
      avgGapSeconds,
      deliveredPct,
      readPct,
      firstTs,
      lastTs,
    };
  }, [messages]);

  const exportData = () => {
    const payload = {
      conversationId,
      windowMinutes: WINDOW_MINUTES,
      collectedAt: new Date().toISOString(),
      metrics,
    };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `performance_${conversationId}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    log.info('Performance data exported');
  };

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '0.75rem',
  };

  return (
    <div className="max-h-[500px] space-y-4 overflow-y-auto pr-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Activity className="h-5 w-5 text-primary" />
          Dashboard de Performance do Chat
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={exportData}
          disabled={!metrics}
          className="gap-2"
        >
          <Download className="h-4 w-4" /> Exportar JSON
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-lg border border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Coletando telemetria…
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-center text-sm text-destructive">
          Falha ao carregar telemetria da conversa. Tente novamente.
        </div>
      )}

      {!isLoading && !isError && !metrics && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card/50 p-8 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-foreground">Sem telemetria coletada</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Nenhuma mensagem nos últimos {WINDOW_MINUTES} minutos desta conversa.
            O painel exibe apenas dados reais de <code className="text-primary">team_messages</code> —
            sem mocks. Web-vitals por conversa (LCP/INP) ainda não são coletados.
          </p>
        </div>
      )}

      {metrics && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="bg-card/50">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Zap className="h-3 w-3" /> Msgs/min médio
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="text-2xl font-bold">{metrics.avgPerMin.toFixed(1)}</div>
                <p className="text-[10px] font-medium text-success-foreground">
                  {metrics.total} mensagens na janela de {WINDOW_MINUTES} min
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" /> Intervalo médio entre msgs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="text-2xl font-bold">{metrics.avgGapSeconds.toFixed(1)}s</div>
                <p className="text-[10px] font-medium text-success-foreground">
                  Entre mensagens consecutivas
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card/50">
              <CardHeader className="p-4 pb-0">
                <CardTitle className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Activity className="h-3 w-3" /> Entregues / Lidas
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="text-2xl font-bold">
                  {metrics.deliveredPct.toFixed(0)}%
                  <span className="text-sm font-medium text-muted-foreground">
                    {' '}
                    / {metrics.readPct.toFixed(0)}%
                  </span>
                </div>
                <p className="text-[10px] font-medium text-success-foreground">
                  status real das mensagens (team_messages)
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-4">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Mensagens por minuto (últimos {WINDOW_MINUTES} min)
              </h4>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={metrics.series}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Status de entrega (mensagens reais)
              </h4>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.statusDistribution}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <XAxis dataKey="label" fontSize={10} axisLine={false} tickLine={false} />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar
                      dataKey="value"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      opacity={0.8}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Database className="h-3 w-3" /> Fonte da telemetria
            </h4>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg bg-foreground/20 p-3 text-[10px]">
              <p className="text-primary-foreground">
                [INFO] Fonte: zapp.team_messages (conversation_id={conversationId})
              </p>
              <p className="text-primary-foreground">
                [INFO] Janela: últimos {WINDOW_MINUTES} min — {metrics.total} mensagens reais
              </p>
              {metrics.firstTs !== null && (
                <p className="text-primary-foreground">
                  [INFO] Primeira mensagem:{' '}
                  {format(new Date(metrics.firstTs), 'HH:mm:ss')} — última:{' '}
                  {format(new Date(metrics.lastTs ?? metrics.firstTs), 'HH:mm:ss')}
                </p>
              )}
              <p className="text-warning">
                [WARN] Web-vitals por conversa (LCP/INP) ainda não são coletados — nenhum valor é
                exibido ou exportado para essas métricas.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
