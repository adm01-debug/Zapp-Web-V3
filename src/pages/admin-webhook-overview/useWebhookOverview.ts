import { useEffect, useMemo, useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';
import { queryExternalProxy } from '@/lib/externalProxy';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';
import {
  aggregateByType,
  aggregateByTypeAndInstance,
  aggregateHourly,
  type WebhookEventLite,
} from './aggregations';

/** HARD_LIMIT. */
export const HARD_LIMIT = 200;
const AUTO_REFRESH_STORAGE_KEY = 'zappweb:webhook-overview:auto-refresh';
const AUTO_REFRESH_INTERVAL_MS = 60_000;

/** use Webhook Overview. */
export function useWebhookOverview() {
  const [hours, setHours] = useState<string>('24');
  const [instance, setInstance] = useState<string>('all');
  const [includeUnprocessed, setIncludeUnprocessed] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(() => {
    const stored = safeGetItem(AUTO_REFRESH_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    safeSetItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefresh));
  }, [autoRefresh]);

  const sinceISO = useMemo(() => subHours(new Date(), Number(hours)).toISOString(), [hours]);

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: queryKeys.adminOps.webhookOverviewFiltered(hours, includeUnprocessed),
    queryFn: async () => {
      const filters: { column: string; operator: string; value: unknown }[] = [
        { column: 'created_at', operator: 'gte', value: sinceISO },
      ];
      if (!includeUnprocessed) {
        filters.push({ column: 'processed', operator: 'eq', value: true });
      }
      const res = await queryExternalProxy<EvolutionWebhookEvent>({
        table: 'evolution_webhook_events',
        select: 'event_type,instance_name,processed,error_message,created_at',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: HARD_LIMIT,
      });
      return (res.data ?? []) as WebhookEventLite[];
    },
    staleTime: 30_000,
    refetchInterval: autoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (instance === 'all') return rows;
    return rows.filter((r) => r.instance_name === instance);
  }, [data, instance]);

  const byType = useMemo(() => aggregateByType(filtered), [filtered]);
  const matrix = useMemo(() => aggregateByTypeAndInstance(filtered), [filtered]);
  const hourly = useMemo(() => aggregateHourly(filtered, Number(hours)), [filtered, hours]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const errored = filtered.filter((r) => r.error_message).length;
    const processed = filtered.filter((r) => r.processed && !r.error_message).length;
    const instances = new Set(filtered.map((r) => r.instance_name)).size;
    const errorPct = total > 0 ? (errored / total) * 100 : 0;
    return { total, processed, errored, instances, errorPct };
  }, [filtered]);

  const allInstances = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.instance_name))).sort(),
    [data]
  );

  const sampleSaturated = (data?.length ?? 0) >= HARD_LIMIT;

  return {
    hours,
    setHours,
    instance,
    setInstance,
    includeUnprocessed,
    setIncludeUnprocessed,
    autoRefresh,
    setAutoRefresh,
    isLoading,
    isRefetching,
    refetch,
    error,
    byType,
    matrix,
    hourly,
    totals,
    allInstances,
    sampleSaturated,
  };
}
