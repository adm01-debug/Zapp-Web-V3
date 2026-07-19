import { useMemo } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle, AlertTriangle, QrCode, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { cn } from '@/lib/utils';

interface ConnectionRow {
  id: string;
  name: string | null;
  channel_type: string | null;
  status: string | null;
  is_active: boolean | null;
  updated_at: string | null;
}

const STATUS_META: Record<string, { label: string; tone: 'success' | 'destructive' | 'warning' | 'info'; icon: typeof CheckCircle2 }> = {
  connected: { label: 'Conectado', tone: 'success', icon: CheckCircle2 },
  open: { label: 'Conectado', tone: 'success', icon: CheckCircle2 },
  active: { label: 'Ativo', tone: 'success', icon: CheckCircle2 },
  disconnected: { label: 'Desconectado', tone: 'destructive', icon: XCircle },
  closed: { label: 'Desconectado', tone: 'destructive', icon: XCircle },
  qrcode: { label: 'Aguardando QR', tone: 'warning', icon: QrCode },
  qr: { label: 'Aguardando QR', tone: 'warning', icon: QrCode },
  degraded: { label: 'Degradado', tone: 'warning', icon: AlertTriangle },
};

function toneClasses(tone: 'success' | 'destructive' | 'warning' | 'info'): string {
  switch (tone) {
    case 'success': return 'bg-primary/10 text-primary border-primary/30';
    case 'destructive': return 'bg-destructive/10 text-destructive border-destructive/30';
    case 'warning': return 'bg-warning/10 text-warning-foreground border-warning/30';
    default: return 'bg-muted text-muted-foreground border-border';
  }
}

const STALE_DISCONNECT_MS = 5 * 60_000;

/** Connections Health Block. */
export function ConnectionsHealthBlock() {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.adminOps.realtimeMonitorConnections(),
    queryFn: async (): Promise<ConnectionRow[]> => {
      const { data, error } = await supabase
        .from('channel_connections_safe')
        .select('id,name,channel_type,status,is_active,updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ConnectionRow[];
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const stats = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const online = rows.filter((r) => {
      const meta = STATUS_META[(r.status ?? '').toLowerCase()];
      return meta?.tone === 'success';
    }).length;
    const staleDisconnected = rows.filter((r) => {
      const meta = STATUS_META[(r.status ?? '').toLowerCase()];
      if (meta?.tone !== 'destructive') return false;
      if (!r.updated_at) return false;
      return Date.now() - new Date(r.updated_at).getTime() > STALE_DISCONNECT_MS;
    }).length;
    return { total, online, staleDisconnected };
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-5 w-5 text-primary" />
          Conexões
          <Badge variant="outline" className="ml-1">
            {stats.online}/{stats.total} online
          </Badge>
          {stats.staleDisconnected > 0 && (
            <Badge variant="destructive" className="ml-1">
              {stats.staleDisconnected} offline &gt; 5min
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Erro ao carregar conexões: {(error as Error).message}</p>
        ) : (data?.length ?? 0) === 0 ? (
          <GenericEmptyState
            icon={Smartphone}
            title="Nenhuma conexão cadastrada"
            description="Adicione canais em Conexões para monitorar status aqui."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(data ?? []).map((c) => {
              const meta = STATUS_META[(c.status ?? '').toLowerCase()] ?? {
                label: c.status ?? 'desconhecido',
                tone: 'info' as const,
                icon: AlertTriangle,
              };
              const Icon = meta.icon;
              return (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-lg border p-3 flex flex-col gap-2 transition-colors',
                    toneClasses(meta.tone),
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate" title={c.name ?? ''}>
                      {c.name ?? '—'}
                    </span>
                    <Icon className="h-4 w-4 shrink-0" />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide opacity-70">{c.channel_type ?? 'n/a'}</span>
                    <span>{meta.label}</span>
                  </div>
                  <span className="text-[10px] opacity-60">
                    {c.updated_at
                      ? `atualizado ${formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}`
                      : 'sem atualização'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
