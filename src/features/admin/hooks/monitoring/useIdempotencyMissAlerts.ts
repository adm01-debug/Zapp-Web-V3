/**
 * useIdempotencyMissAlerts — admin-only watchdog for the Evolution send cache.
 *
 * Polls FATOR X `evolution_audit_log` for `idempotency_miss` rows in the last
 * hour, groups them by `instance_name`, and raises a `warroom_alerts` row when
 * any instance crosses the configured threshold. Reuses the existing siren /
 * push notification flow via `useWarRoomAlerts`.
 *
 * Why poll instead of subscribe? `evolution_audit_log` lives on FATOR X, which
 * does not share a Realtime channel with the Lovable Cloud where the alerts
 * are stored. A 60s poll is acceptable: misses are a low-frequency signal and
 * the alert is hourly-bucketed.
 *
 * Returns the live miss counts per instance so the Connections page can show
 * an inline badge alongside the toast.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryExternalProxy } from '@/lib/externalProxy';
import { useUserRole } from '@/features/auth';
import { getLogger } from '@/lib/logger';

const log = getLogger('useIdempotencyMissAlerts');

/** Misses per instance per hour above this raise an alert. Tunable per env. */
export const DEFAULT_MISS_THRESHOLD = 50;
const POLL_INTERVAL_MS = 60_000;
const ALERT_DEDUPE_KEY_PREFIX = 'idempotency-miss';
/** localStorage key used to persist `(instance × hour-bucket)` dedupe entries across refresh. */
const ALERT_DEDUPE_STORAGE_KEY = 'zapp:idempotency-miss-alerts:v1';
const ONE_HOUR_MS = 60 * 60 * 1000;
/** Drop persisted entries older than this to keep the payload small. */
const PERSIST_TTL_MS = 6 * ONE_HOUR_MS;

/** Hour bucket aligned to wall-clock hours, so the dedupe matches the alert window. */
function hourBucket(ts: number): number {
  return Math.floor(ts / ONE_HOUR_MS);
}

/** Stable storage key combining instance and hour bucket. */
function buildPersistKey(instance: string, ts: number): string {
  return `${ALERT_DEDUPE_KEY_PREFIX}:${instance}:${hourBucket(ts)}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadPersistedAlerts(): Map<string, number> {
  const map = new Map<string, number>();
  const storage = safeStorage();
  if (!storage) return map;
  try {
    const raw = storage.getItem(ALERT_DEDUPE_STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as Record<string, number> | null;
    if (!parsed || typeof parsed !== 'object') return map;
    const cutoff = Date.now() - PERSIST_TTL_MS;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && v >= cutoff) map.set(k, v);
    }
  } catch (e) {
    log.debug('failed to load persisted dedupe alerts:', e);
  }
  return map;
}

function savePersistedAlerts(map: Map<string, number>): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const cutoff = Date.now() - PERSIST_TTL_MS;
    const obj: Record<string, number> = {};
    for (const [k, v] of map.entries()) {
      if (v >= cutoff) obj[k] = v;
    }
    storage.setItem(ALERT_DEDUPE_STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    log.debug('failed to persist dedupe alerts:', e);
  }
}

interface AuditLogRow {
  id: string;
  action: string;
  metadata: { instance_name?: string | null; path?: string | null } | null;
  created_at: string;
}

export interface InstanceMissCount {
  instance: string;
  count: number;
  overThreshold: boolean;
}

interface UseIdempotencyMissAlertsOptions {
  /** Override the per-instance threshold. */
  threshold?: number;
  /** Disable polling (e.g. for tests or non-admin users). */
  enabled?: boolean;
}

export function useIdempotencyMissAlerts(opts: UseIdempotencyMissAlertsOptions = {}) {
  const { threshold = DEFAULT_MISS_THRESHOLD } = opts;
  const { isDev, loading: roleLoading } = useUserRole();
  const enabled = (opts.enabled ?? true) && isDev && !roleLoading;
  // Hydrate dedupe map from localStorage so refreshes don't re-fire alerts within the same hour bucket.
  const [lastAlertedAt, setLastAlertedAt] = useState<Map<string, number>>(() => loadPersistedAlerts());
  const hydratedRef = useRef(true);

  // Persist whenever the dedupe map changes (skip the initial hydration write).
  useEffect(() => {
    if (hydratedRef.current) {
      hydratedRef.current = false;
      return;
    }
    savePersistedAlerts(lastAlertedAt);
  }, [lastAlertedAt]);

  const { data, isFetching, error } = useQuery({
    queryKey: ['idempotency-miss', 'last-hour'],
    enabled,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    staleTime: POLL_INTERVAL_MS / 2,
    queryFn: async (): Promise<AuditLogRow[]> => {
      const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
      const result = await queryExternalProxy<AuditLogRow>({
        table: 'evolution_audit_log',
        select: 'id, action, metadata, created_at',
        filters: [
          { column: 'action', operator: 'eq', value: 'idempotency_miss' },
          { column: 'created_at', operator: 'gte', value: since },
        ],
        order: { column: 'created_at', ascending: false },
        limit: 1000,
      });
      return result.data ?? [];
    },
  });

  const counts = useMemo<InstanceMissCount[]>(() => {
    if (!data) return [];
    const byInstance = new Map<string, number>();
    for (const row of data) {
      const inst = (row.metadata?.instance_name ?? 'unknown').trim() || 'unknown';
      byInstance.set(inst, (byInstance.get(inst) ?? 0) + 1);
    }
    return Array.from(byInstance.entries())
      .map(([instance, count]) => ({
        instance,
        count,
        overThreshold: count >= threshold,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data, threshold]);

  // Raise a warroom alert per breaching instance, deduped to once per (instance × hour bucket).
  useEffect(() => {
    if (!enabled || counts.length === 0) return;
    const breaching = counts.filter((c) => c.overThreshold);
    if (breaching.length === 0) return;

    const now = Date.now();
    const next = new Map(lastAlertedAt);
    let changed = false;

    void (async () => {
      for (const item of breaching) {
        const dedupeKey = buildPersistKey(item.instance, now);
        const lastTs = next.get(dedupeKey) ?? 0;
        if (now - lastTs < ONE_HOUR_MS) continue;

        try {
          const { error: insertErr } = await supabase.from('warroom_alerts').insert({
            alert_type: 'warning',
            title: `Cache de idempotência: ${item.count} miss/h em ${item.instance}`,
            message:
              `A instância "${item.instance}" registrou ${item.count} cache misses ` +
              `na última hora (limite: ${threshold}). Verifique a tabela ` +
              `evolution_send_idempotency e o TTL configurado.`,
            source: dedupeKey,
          });
          if (insertErr) {
            // RLS will block non-admins/supervisors — silent in that case.
            log.debug('warroom_alerts insert blocked or failed:', insertErr.message);
          } else {
            next.set(dedupeKey, now);
            changed = true;
          }
        } catch (e) {
          log.warn('failed to raise idempotency-miss alert:', e);
        }
      }
      if (changed) setLastAlertedAt(next);
    })();
  }, [counts, enabled, lastAlertedAt, threshold]);

  // Derived: how many toasts we've fired per instance in the CURRENT hour bucket,
  // and when that bucket flips (i.e. when the dedupe resets).
  const { toastsByInstance, currentBucketStartedAt, nextResetAt } = useMemo(() => {
    const now = Date.now();
    const currentBucket = hourBucket(now);
    const start = currentBucket * ONE_HOUR_MS;
    const next = start + ONE_HOUR_MS;
    const byInstance: Record<string, number> = {};
    for (const key of lastAlertedAt.keys()) {
      // key shape: `idempotency-miss:<instance>:<bucket>`
      const parts = key.split(':');
      if (parts.length < 3) continue;
      const bucket = Number(parts[parts.length - 1]);
      if (bucket !== currentBucket) continue;
      const instance = parts.slice(1, -1).join(':');
      byInstance[instance] = (byInstance[instance] ?? 0) + 1;
    }
    return {
      toastsByInstance: byInstance,
      currentBucketStartedAt: start,
      nextResetAt: next,
    };
  }, [lastAlertedAt]);

  return {
    counts,
    threshold,
    isLoading: isFetching && !data,
    error: error instanceof Error ? error.message : null,
    enabled,
    /** Toasts disparados na janela de hora atual, agrupados por instância. */
    toastsByInstance,
    /** Timestamp (ms) do início da janela atual. */
    currentBucketStartedAt,
    /** Timestamp (ms) em que o dedupe reseta (início da próxima janela). */
    nextResetAt,
  };
}

// Test-only helpers (tree-shaken in prod builds because they're unused).
export const __test__ = {
  ALERT_DEDUPE_STORAGE_KEY,
  ONE_HOUR_MS,
  PERSIST_TTL_MS,
  hourBucket,
  buildPersistKey,
  loadPersistedAlerts,
  savePersistedAlerts,
};
