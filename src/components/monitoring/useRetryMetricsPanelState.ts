import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRetryMetrics, type RetryMetricsFilters } from '@/features/admin';
import {
  evaluateAllInstances,
  loadThresholds,
  loadPerInstanceThresholds,
  shouldFireRetryAlert,
  subscribeRetryAlertsStorage,
  loadRetryAlertDedupeMode,
  buildRetryAlertDedupeKey,
  RETRY_ALERT_COOLDOWN_MS,
  type RetryThresholds,
  type PerInstanceThresholds,
  type RetryAlertDedupeMode,
} from '@/lib/retryAlerts';

export function useRetryMetricsPanelState() {
  const [hours, setHours] = useState<number>(24);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [thresholds, setThresholds] = useState<RetryThresholds>(() => loadThresholds());
  const [perInstance, setPerInstance] = useState<PerInstanceThresholds>(() =>
    loadPerInstanceThresholds()
  );
  const [dedupeMode, setDedupeMode] = useState<RetryAlertDedupeMode>(() =>
    loadRetryAlertDedupeMode()
  );
  const [compareMode, setCompareMode] = useState<boolean>(false);

  const filters: RetryMetricsFilters = {
    hours,
    action: actionFilter === 'all' ? null : actionFilter,
    status: statusFilter === 'all' ? null : (statusFilter as RetryMetricsFilters['status']),
  };

  const { data, isLoading, refetch, isFetching, byInstance } = useRetryMetrics(filters);

  const rows = data?.rows ?? [];
  const agg = data?.aggregates;

  const breaches = useMemo(
    () => evaluateAllInstances(byInstance, thresholds, perInstance),
    [byInstance, thresholds, perInstance]
  );

  // Sync thresholds saved in other browser tabs — fires only in sibling tabs,
  // not in the tab that saved (which already has the updated state).
  useEffect(() => {
    return subscribeRetryAlertsStorage(({ thresholds: t, perInstance: p, dedupeMode: m }) => {
      setThresholds(t);
      setPerInstance(p);
      setDedupeMode(m);
      toast.message('Configurações de alerta atualizadas em outra aba.', { duration: 3500 });
    });
  }, []);

  // Reset cooldown map when the time window or dedupe granularity changes.
  const cooldownRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    cooldownRef.current = new Map();
  }, [hours, dedupeMode]);

  // Fire toast alerts on threshold breaches with per-instance cooldown.
  useEffect(() => {
    for (const b of breaches) {
      const seenForInstance = new Set<string>();
      for (const d of b.details) {
        const key = buildRetryAlertDedupeKey(b.instance, d.kind, hours, dedupeMode);
        if (seenForInstance.has(key)) continue;
        seenForInstance.add(key);
        if (!shouldFireRetryAlert(key, RETRY_ALERT_COOLDOWN_MS, cooldownRef.current)) continue;

        const overrideTag = b.hasOverride ? ' (override próprio)' : '';
        if (dedupeMode === 'instance+kind') {
          const kindLabel = d.kind === 'p95' ? 'p95 alto' : '% falha alta';
          toast.error(`Retry degradado em ${b.instance} — ${kindLabel}${overrideTag}`, {
            description: `${d.label} · janela ${hours}h · ${b.metrics.total} runs`,
            duration: 8000,
          });
        } else {
          const allLabels = b.details.map((x) => x.label).join(' · ');
          const kindsTag = b.details.map((x) => (x.kind === 'p95' ? 'p95' : 'falha%')).join('+');
          toast.error(`Retry degradado em ${b.instance}${overrideTag}`, {
            description: `${kindsTag}: ${allLabels} · janela ${hours}h · ${b.metrics.total} runs`,
            duration: 8000,
          });
          break;
        }
      }
    }
  }, [breaches, hours, dedupeMode]);

  const actionOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.action));
    if (agg) agg.topActions.forEach((a) => set.add(a.action));
    return Array.from(set).sort();
  }, [rows, agg]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  }, []);

  return {
    hours,
    setHours,
    actionFilter,
    setActionFilter,
    statusFilter,
    setStatusFilter,
    expanded,
    toggle,
    thresholds,
    setThresholds,
    perInstance,
    setPerInstance,
    dedupeMode,
    setDedupeMode,
    compareMode,
    setCompareMode,
    rows,
    agg,
    data,
    isLoading,
    refetch,
    isFetching,
    byInstance,
    breaches,
    actionOptions,
    copy,
  };
}
