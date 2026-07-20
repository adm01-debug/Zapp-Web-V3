import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Audit Row interface definition. */
export interface AuditRow {
  id: string;
  instance: string | null;
  ok: boolean;
  duration_ms: number | null;
  error: string | null;
  message: string | null;
  good_accepted: boolean | null;
  tampered_rejected: boolean | null;
  created_at: string;
}

/** Hmac Audit History Panel Props interface definition. */
export interface HmacAuditHistoryPanelProps {
  /** Quando definido, pré-seleciona a instância no filtro. */
  instance?: string | null;
  /** Quantidade máxima de execuções a exibir na tabela. */
  limit?: number;
}

/** Range Key type alias. */
export type RangeKey = '24h' | '7d' | '30d';

/** RANGES constant. */
export const RANGES: { value: RangeKey; label: string; hours: number; bucket: 'hour' | 'day' }[] = [
  { value: '24h', label: 'Últimas 24h', hours: 24, bucket: 'hour' },
  { value: '7d', label: 'Últimos 7 dias', hours: 24 * 7, bucket: 'day' },
  { value: '30d', label: 'Últimos 30 dias', hours: 24 * 30, bucket: 'day' },
];

/** A L L_ I N S T A N C E S constant. */
export const ALL_INSTANCES = '__all__';

/** tooltip Style constant. */
export const tooltipStyle = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
} as const;

/** fmt Date function. */
export function fmtDate(iso: string) {
  try {
    return format(new Date(iso), 'dd/MM HH:mm:ss', { locale: ptBR });
  } catch {
    return iso;
  }
}

/** bucketize function. */
export function bucketize(rows: AuditRow[], bucket: 'hour' | 'day') {
  const map = new Map<string, { time: string; ok: number; fail: number; iso: string }>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    let key: string;
    let label: string;
    if (bucket === 'hour') {
      d.setMinutes(0, 0, 0);
      key = d.toISOString();
      label = format(d, 'dd/MM HH:00', { locale: ptBR });
    } else {
      d.setHours(0, 0, 0, 0);
      key = d.toISOString();
      label = format(d, 'dd/MM', { locale: ptBR });
    }
    const cur = map.get(key) ?? { time: label, ok: 0, fail: 0, iso: key };
    if (r.ok) cur.ok += 1;
    else cur.fail += 1;
    map.set(key, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.iso.localeCompare(b.iso));
}
