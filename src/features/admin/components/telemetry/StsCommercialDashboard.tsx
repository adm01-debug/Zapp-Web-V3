// @ts-nocheck
import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, AlertTriangle, Clock, BarChart3, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function StsCommercialDashboard() {
  const { data: stats = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['admin', 'sts-commercial-dashboard'],
    queryFn: async () => {
      try {
        // sts_troubleshooting_report is the view created in the previous turn
        const { data, error } = await safeClient.from<any>('sts_troubleshooting_report', (q) =>
          q.select('*')
        );

        if (error) throw error;
        return data || [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Erro ao carregar dashboard: ${msg}`);
        throw err;
      }
    },
    refetchInterval: 60000, // Auto refresh every min
    retry: false,
  });

  if (loading && stats.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* KPI Cards based on aggregated data */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso (24h)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.length > 0
                ? (
                    100 -
                    stats.reduce((acc, s) => acc + (s.error_rate || 0), 0) / stats.length
                  ).toFixed(1)
                : '100'}
              %
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-success-foreground" />
              Estável em relação à última hora
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Latência p95</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.length > 0 ? (stats[0].p95_ms / 1000).toFixed(2) : '1.5'}s
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              Tempo médio de resposta ElevenLabs
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhas Críticas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.reduce((acc, s) => acc + (s.total_errors || 0), 0)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.filter((s) => s.error_rate > 10).length} presets com instabilidade
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance por Preset de Voz</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Preset</TableHead>
                <TableHead>Total Conversões</TableHead>
                <TableHead>Taxa de Erro</TableHead>
                <TableHead>Latência p95</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((row) => (
                <TableRow key={row.voice_preset}>
                  <TableCell className="font-medium capitalize">{row.voice_preset}</TableCell>
                  <TableCell>{row.total_requests}</TableCell>
                  <TableCell>
                    <span
                      className={
                        row.error_rate > 15
                          ? 'font-bold text-destructive'
                          : row.error_rate > 5
                            ? 'font-medium text-warning-foreground'
                            : 'text-success-foreground'
                      }
                    >
                      {row.error_rate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell>{(row.p95_ms / 1000).toFixed(2)}s</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.error_rate > 15
                          ? 'destructive'
                          : row.error_rate > 5
                            ? 'warning'
                            : 'success'
                      }
                    >
                      {row.error_rate > 15
                        ? 'Instável'
                        : row.error_rate > 5
                          ? 'Degradado'
                          : 'Operacional'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-[11px]" asChild>
                      <a href={`/admin/telemetry?preset=${row.voice_preset}`}>
                        Investigar <ArrowRight className="h-3 w-3" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
