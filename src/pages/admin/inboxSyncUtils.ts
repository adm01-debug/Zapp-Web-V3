/** INSTANCE. */
export const INSTANCE = 'wpp2';
/** POLL_MS. */
export const POLL_MS = 15_000;

/** BUCKET_CONFIGS. */
export const BUCKET_CONFIGS: Array<{ label: string; sinceMs: number }> = [
  { label: 'Últimos 5 min', sinceMs: 5 * 60_000 },
  { label: 'Última 1 h', sinceMs: 60 * 60_000 },
  { label: 'Últimas 24 h', sinceMs: 24 * 60 * 60_000 },
];

/** ALERT_THRESHOLD_KEY. */
export const ALERT_THRESHOLD_KEY = 'admin:inbox-sync:inbound-alert-threshold-min';
/** DEFAULT_ALERT_THRESHOLD_MIN. */
export const DEFAULT_ALERT_THRESHOLD_MIN = 10;
/** MIN_THRESHOLD. */
export const MIN_THRESHOLD = 1;
/** MAX_THRESHOLD. */
export const MAX_THRESHOLD = 1440; // 24h

/** Sync Bucket. */
export type SyncBucket = { label: string; sinceMs: number; count: number | null };

/** Inbound Outbound Last. */
export interface InboundOutboundLast {
  inboundAt: string | null;
  outboundAt: string | null;
}

/** Conversation Count. */
export interface ConversationCount {
  remote_jid: string;
  push_name: string | null;
  count: number;
  lastAt: string;
}

/** Failed Row. */
export interface FailedRow {
  id: string;
  created_at: string;
  error_message: string | null;
  retry_count: number | null;
  status: string | null;
}

/** Audit Row. */
export interface AuditRow {
  id: string;
  created_at: string;
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

/** time Ago. */
export function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'agora';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

/** classify Health. */
export function classifyHealth(
  lastInboundIso: string | null,
  alertThresholdMin: number
): {
  variant: 'default' | 'secondary' | 'destructive';
  label: string;
  ok: boolean;
  alerting: boolean;
  ageMinutes: number | null;
} {
  if (!lastInboundIso) {
    return {
      variant: 'destructive',
      label: 'Sem dados',
      ok: false,
      alerting: true,
      ageMinutes: null,
    };
  }
  const ms = Date.now() - new Date(lastInboundIso).getTime();
  const ageMinutes = Math.max(0, Math.floor(ms / 60_000));
  const thresholdMs = alertThresholdMin * 60_000;
  if (ms >= thresholdMs) {
    return {
      variant: 'destructive',
      label: 'Sem sincronia',
      ok: false,
      alerting: true,
      ageMinutes,
    };
  }
  if (ms >= thresholdMs / 2) {
    return { variant: 'secondary', label: 'Lento', ok: true, alerting: false, ageMinutes };
  }
  return { variant: 'default', label: 'Saudável', ok: true, alerting: false, ageMinutes };
}

/** read Stored Threshold. */
export function readStoredThreshold(): number {
  if (typeof window === 'undefined') return DEFAULT_ALERT_THRESHOLD_MIN;
  const raw = window.localStorage.getItem(ALERT_THRESHOLD_KEY);
  if (!raw) return DEFAULT_ALERT_THRESHOLD_MIN;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_ALERT_THRESHOLD_MIN;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, parsed));
}
