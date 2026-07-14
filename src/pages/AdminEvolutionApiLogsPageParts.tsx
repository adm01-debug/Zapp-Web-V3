import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface RetryMetric {
  id: string;
  action: string;
  method: string;
  instance_name: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; reason: string; status?: number }>;
  total_duration_ms: number | null;
  created_at: string;
}

export const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
] as const;

export const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'success', label: 'Sucesso' },
  { value: 'failed', label: 'Falhou' },
  { value: 'exhausted', label: 'Esgotou retries' },
] as const;

export function formatDate(iso: string) {
  try {
    return format(new Date(iso), 'dd/MM HH:mm:ss', { locale: ptBR });
  } catch {
    return iso;
  }
}

export function formatDuration(ms: number | null) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

export function StatusBadge({ status, http }: { status: string; http: number | null }) {
  const isOk = status === 'success';
  const isAuth = http === 401 || http === 403;
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 text-[10px]',
        isOk && 'border-success/30 bg-success/10 text-success',
        !isOk && isAuth && 'border-warning/30 bg-warning/10 text-warning',
        !isOk && !isAuth && 'border-destructive/30 bg-destructive/10 text-destructive'
      )}
    >
      {isOk ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status}
      {http ? ` · ${http}` : ''}
    </Badge>
  );
}
