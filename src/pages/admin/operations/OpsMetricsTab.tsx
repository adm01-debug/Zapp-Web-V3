import { useEffect, useMemo, useState } from "react";
import { safeClient } from "@/integrations/supabase/safeClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Inbox, Send, AlertTriangle, Users, Hash, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Totals = {
  total_in: number;
  total_out: number;
  total_failed: number;
  active_channels: number;
  active_queues: number;
  online_agents: number;
};

type ChannelRow = {
  channel_id: string;
  channel_name: string;
  channel_type: string;
  status: string;
  msgs_in: number;
  msgs_out: number;
  msgs_failed: number;
};

type QueueRow = {
  queue_id: string;
  queue_name: string;
  queue_status: string;
  waiting: number;
  in_service: number;
  avg_wait_seconds: number | null;
  p99_wait_seconds: number | null;
};

type Metrics = {
  window_hours: number;
  generated_at: string;
  totals: Totals;
  by_channel: ChannelRow[];
  by_queue: QueueRow[];
};

const WINDOWS = [
  { value: "24", label: "Últimas 24h" },
  { value: "168", label: "Últimos 7 dias" },
  { value: "720", label: "Últimos 30 dias" },
];

function fmtSeconds(sec: number | null | undefined) {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}min`;
  return `${(sec / 3600).toFixed(1)}h`;
}

export function OpsMetricsTab() {
  const [windowHours, setWindowHours] = useState("24");
  const [data, setData] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useMemo(
    () => async () => {
      setLoading(true);
      const { data: res, error } = await safeClient.rpc<Metrics>(
        "rpc_ops_metrics",
        { p_window_hours: Number(windowHours) }
      );
      if (error) {
        toast.error("Erro ao carregar métricas: " + error.message);
        setLoading(false);
        return;
      }
      setData(res);
      setLoading(false);
    },
    [windowHours],
  );

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <span className="text-xs text-muted-foreground">
              Atualizado em {new Date(data.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<Inbox className="h-4 w-4" />} label="Recebidas" value={data.totals.total_in} />
            <KpiCard icon={<Send className="h-4 w-4" />} label="Enviadas" value={data.totals.total_out} />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Falhas"
              value={data.totals.total_failed}
              variant={data.totals.total_failed > 0 ? "destructive" : "default"}
            />
            <KpiCard icon={<Hash className="h-4 w-4" />} label="Canais ativos" value={data.totals.active_channels} />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Filas ativas" value={data.totals.active_queues} />
            <KpiCard icon={<Users className="h-4 w-4" />} label="Agentes online" value={data.totals.online_agents} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Volume por canal</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Recebidas</TableHead>
                    <TableHead className="text-right">Enviadas</TableHead>
                    <TableHead className="text-right">Falhas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_channel.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhum canal encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.by_channel.map((c) => (
                      <TableRow key={c.channel_id}>
                        <TableCell className="font-medium">{c.channel_name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.channel_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.msgs_in}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.msgs_out}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.msgs_failed > 0 ? (
                            <span className="text-destructive">{c.msgs_failed}</span>
                          ) : (
                            c.msgs_failed
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tempo em fila</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fila</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aguardando</TableHead>
                    <TableHead className="text-right">Em atendimento</TableHead>
                    <TableHead className="text-right">Espera média</TableHead>
                    <TableHead className="text-right">P99</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.by_queue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Nenhuma fila encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.by_queue.map((q) => (
                      <TableRow key={q.queue_id}>
                        <TableCell className="font-medium">{q.queue_name}</TableCell>
                        <TableCell>
                          <Badge variant={q.queue_status === "active" ? "default" : "outline"}>
                            {q.queue_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{q.waiting}</TableCell>
                        <TableCell className="text-right tabular-nums">{q.in_service}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtSeconds(q.avg_wait_seconds)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtSeconds(q.p99_wait_seconds)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  variant?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div
          className={`text-2xl font-semibold tabular-nums mt-1 ${
            variant === "destructive" && value > 0 ? "text-destructive" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}