import { useMemo } from 'react';
import { useRateLimitLogs } from './useRateLimitLogs';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AlertScope = 'ip' | 'endpoint';

export interface RateLimitAlert {
  id: string;
  scope: AlertScope;
  key: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  requestCount: number;
  blockedCount: number;
  detailsHref: string;
}

export interface RateLimitAlertThresholds {
  ip: { low: number; medium: number; high: number };
  endpoint: { low: number; medium: number; high: number };
  blockedCritical: number;
}

const DEFAULT_THRESHOLDS: RateLimitAlertThresholds = {
  ip: { low: 100, medium: 200, high: 500 },
  endpoint: { low: 500, medium: 1000, high: 2000 },
  blockedCritical: 5,
};

const STORAGE_KEY = 'zapp:admin:rate-limit-thresholds:v1';

export function loadThresholds(): RateLimitAlertThresholds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export function saveThresholds(next: RateLimitAlertThresholds) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage unavailable — thresholds fall back to defaults on reload */
  }
}

function classify(
  count: number,
  blocked: number,
  bands: { low: number; medium: number; high: number },
  blockedCritical: number
): AlertSeverity | null {
  if (blocked >= blockedCritical) return 'critical';
  if (count >= bands.high || blocked >= 1) return 'high';
  if (count >= bands.medium) return 'medium';
  if (count >= bands.low) return 'low';
  return null;
}

export function useRateLimitAlerts(thresholds: RateLimitAlertThresholds = DEFAULT_THRESHOLDS) {
  const { logs, loading, refetch } = useRateLimitLogs();

  const alerts = useMemo<RateLimitAlert[]>(() => {
    if (logs.length === 0) return [];

    const byIp = new Map<string, { count: number; blocked: number }>();
    const byEndpoint = new Map<string, { count: number; blocked: number }>();

    for (const log of logs) {
      const ipEntry = byIp.get(log.ip_address) ?? { count: 0, blocked: 0 };
      ipEntry.count += log.request_count;
      if (log.blocked) ipEntry.blocked += 1;
      byIp.set(log.ip_address, ipEntry);

      const epEntry = byEndpoint.get(log.endpoint) ?? { count: 0, blocked: 0 };
      epEntry.count += log.request_count;
      if (log.blocked) epEntry.blocked += 1;
      byEndpoint.set(log.endpoint, epEntry);
    }

    const out: RateLimitAlert[] = [];

    byIp.forEach((v, ip) => {
      const sev = classify(v.count, v.blocked, thresholds.ip, thresholds.blockedCritical);
      if (!sev) return;
      out.push({
        id: `ip:${ip}`,
        scope: 'ip',
        key: ip,
        title: `IP ${ip} acima do limite`,
        description: `${v.count} requisições · ${v.blocked} bloqueadas nas últimas 100 amostras.`,
        severity: sev,
        requestCount: v.count,
        blockedCount: v.blocked,
        detailsHref: `/admin/rate-limit?tab=logs&ip=${encodeURIComponent(ip)}`,
      });
    });

    byEndpoint.forEach((v, ep) => {
      const sev = classify(v.count, v.blocked, thresholds.endpoint, thresholds.blockedCritical);
      if (!sev) return;
      out.push({
        id: `ep:${ep}`,
        scope: 'endpoint',
        key: ep,
        title: `Endpoint ${ep} sob pressão`,
        description: `${v.count} requisições · ${v.blocked} bloqueadas nas últimas 100 amostras.`,
        severity: sev,
        requestCount: v.count,
        blockedCount: v.blocked,
        detailsHref: `/admin/rate-limit?tab=logs&endpoint=${encodeURIComponent(ep)}`,
      });
    });

    const rank: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort(
      (a, b) => rank[a.severity] - rank[b.severity] || b.requestCount - a.requestCount
    );
  }, [logs, thresholds]);

  const counts = useMemo(() => {
    const acc: Record<AlertSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of alerts) acc[a.severity] += 1;
    return acc;
  }, [alerts]);

  return { alerts, counts, loading, refetch };
}
