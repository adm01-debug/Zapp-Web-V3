import { useEffect, useState } from 'react';
import { safeFrom } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, ShieldCheck, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

/**
 * DASHBOARD-18 — Media Pipeline (stats mínimos).
 *
 * evo.media_download_queue (~3.3k linhas) e evo.media_scan_log
 * (tabelas migradas de zapp -> evo em 2026-08-10; acessadas via public.* VIEW)
 * não tinham NENHUMA UI de monitoramento. Este card expõe contagens por status
 * da fila de download + resumo de scans, para diagnóstico rápido do pipeline.
 *
 * Observação: não há página admin de mídia dedicada (MediaLibraryAdmin é a
 * biblioteca de figurinhas/áudios, feature separada). Este card vive na aba
 * Métricas de Operações como superfície mínima de monitoramento.
 */

interface QueueCounts {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  total: number;
}

interface ScanSummary {
  total: number;
  failed: number;
  lastScannedAt: string | null;
}

async function countRows(
  table: 'media_download_queue' | 'media_scan_log',
  filter?: { column: string; value: string }
): Promise<number> {
  let query = safeFrom(table).select('id', { count: 'exact', head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function KpiCell({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  tone?: 'ok' | 'bad' | 'muted';
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-muted/40 p-3 text-center">
      <div
        className={`flex items-center gap-1.5 text-xs text-muted-foreground ${
          tone === 'bad' ? 'text-destructive' : tone === 'ok' ? 'text-success' : ''
        }`}
      >
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Media Pipeline stats card — reads evo.media_download_queue / evo.media_scan_log via public.* VIEW (DASHBOARD-18). */
export function MediaPipelineStats() {
  const [queue, setQueue] = useState<QueueCounts | null>(null);
  const [scans, setScans] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [pending, processing, completed, failed, scanTotal, scanFailed] =
          await Promise.all([
            countRows('media_download_queue', { column: 'status', value: 'pending' }),
            countRows('media_download_queue', { column: 'status', value: 'processing' }),
            countRows('media_download_queue', { column: 'status', value: 'completed' }),
            countRows('media_download_queue', { column: 'status', value: 'failed' }),
            countRows('media_scan_log'),
            countRows('media_scan_log', { column: 'scan_result', value: 'failed' }),
          ]);
        if (cancelled) return;

        let lastScannedAt: string | null = null;
        const { data: lastRow } = await safeFrom('media_scan_log')
          .select('scanned_at')
          .order('scanned_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled) {
          lastScannedAt =
            lastRow && typeof lastRow.scanned_at === 'string' ? lastRow.scanned_at : null;
          setQueue({
            pending,
            processing,
            completed,
            failed,
            total: pending + processing + completed + failed,
          });
          setScans({ total: scanTotal, failed: scanFailed, lastScannedAt });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="border border-border/60 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-5 w-5 text-primary" />
          Media Pipeline
        </CardTitle>
        <CardDescription className="text-xs">
          Fila de download de mídias (evo.media_download_queue) e varreduras de
          segurança (evo.media_scan_log)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Erro ao carregar stats do pipeline: {error}</span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <KpiCell
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Pendentes"
                value={queue?.pending ?? 0}
                tone={queue && queue.pending > 0 ? 'bad' : 'muted'}
              />
              <KpiCell
                icon={<Download className="h-3.5 w-3.5" />}
                label="Processando"
                value={queue?.processing ?? 0}
              />
              <KpiCell
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label="Concluídas"
                value={queue?.completed ?? 0}
                tone="ok"
              />
              <KpiCell
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Falhas"
                value={queue?.failed ?? 0}
                tone={queue && queue.failed > 0 ? 'bad' : 'muted'}
              />
              <KpiCell
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label="Scans (total)"
                value={scans?.total ?? 0}
              />
              <KpiCell
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                label="Scans falhos"
                value={scans?.failed ?? 0}
                tone={scans && scans.failed > 0 ? 'bad' : 'muted'}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                Total na fila: {(queue?.total ?? 0).toLocaleString('pt-BR')}
              </Badge>
              {scans?.lastScannedAt && (
                <Badge variant="outline" className="text-[10px]">
                  Último scan:{' '}
                  {new Date(scans.lastScannedAt).toLocaleString('pt-BR')}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
