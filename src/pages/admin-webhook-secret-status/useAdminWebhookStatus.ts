/**
 * useAdminWebhookStatus — data layer for AdminWebhookSecretStatusPage.
 * Centralises all queries, derived state, URL management, and action handlers
 * so the page component can focus purely on layout and rendering.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { queryExternalProxy } from '@/lib/externalProxy';
import { recheckWebhookSignature, type RecheckResult } from '@/lib/recheckWebhookSignature';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useWebhookHealthAlerts } from '@/hooks/useWebhookHealthAlerts';
import { useWebhookViewPreferences } from '@/hooks/useWebhookViewPreferences';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import {
  aggregateValidationByInstance,
  computeInstanceStatus,
  computeLatencyStats,
  deriveInstances,
  type SecretStatusEvent,
} from './instanceAggregations';

interface SecretStatus {
  configured: boolean;
  length: number;
  hashPrefix: string | null;
  strictMode: boolean;
  checkedAt: string;
}

const REFRESH_INTERVAL = 30_000;

/** use Admin Webhook Status function. */
export function useAdminWebhookStatus() {
  const { filters, setFilters } = useUrlFilters();

  const selectedInstance = useMemo<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('instance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]); // refresh when other filters change too

  const setInstance = useCallback(
    (next: string | null) => {
      const url = new URL(window.location.href);
      if (next) url.searchParams.set('instance', next);
      else url.searchParams.delete('instance');
      window.history.replaceState({}, '', url.toString());
      setFilters({ search: filters.search });
    },
    [filters.search, setFilters]
  );

  // ── Queries ─────────────────────────────────────────────────────────────
  const secretQuery = useQuery({
    queryKey: queryKeys.adminOps.webhookSecretStatus(),
    queryFn: async (): Promise<SecretStatus> => {
      const { data, error } = await supabase.functions.invoke('webhook-secret-status');
      if (error) throw error;
      return data as SecretStatus; // ignore-audit: narrows Supabase query result to local interface
    },
    refetchInterval: REFRESH_INTERVAL,
  });

  const eventsQuery = useQuery({
    queryKey: queryKeys.adminOps.webhookRecentEvents(selectedInstance ?? undefined),
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const filtersArr = [{ column: 'created_at', operator: 'gte', value: since }];
      if (selectedInstance) {
        filtersArr.push({ column: 'instance_name', operator: 'eq', value: selectedInstance });
      }
      const res = await queryExternalProxy<SecretStatusEvent>({
        table: 'evolution_webhook_events',
        select:
          'id,event_type,instance_name,signature_valid,processed,processed_at,error_message,created_at',
        filters: filtersArr,
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      return res.data ?? [];
    },
    refetchInterval: REFRESH_INTERVAL,
  });

  // Always fetch a small global slice for the instance dropdown so the user
  // can switch even when filtered to an instance with no traffic.
  const instancesQuery = useQuery({
    queryKey: queryKeys.adminOps.webhookInstances(),
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const res = await queryExternalProxy<{ instance_name: string | null }>({
        table: 'evolution_webhook_events',
        select: 'instance_name',
        filters: [{ column: 'created_at', operator: 'gte', value: since }],
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });
      return res.data ?? [];
    },
    refetchInterval: REFRESH_INTERVAL * 4,
  });

  const refetchAll = useCallback(() => {
    void secretQuery.refetch();
    void eventsQuery.refetch();
    void instancesQuery.refetch();
  }, [secretQuery, eventsQuery, instancesQuery]);

  // ── Derived event metrics ────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const events = eventsQuery.data ?? [];
  const lastEvent = events[0];
  const total24h = events.length;
  const validSigned = events.filter((e) => e.signature_valid === true).length;
  const invalidSigned = events.filter((e) => e.signature_valid === false).length;
  const unsigned = events.filter((e) => e.signature_valid === null).length;
  const errored = events.filter((e) => e.error_message).length;
  const validationRate = total24h > 0 ? Math.round((validSigned / total24h) * 100) : 0;

  const instances = useMemo(() => {
    const fromList = deriveInstances(
      (instancesQuery.data ?? []).map((r) => ({
        event_type: '',
        instance_name: r.instance_name,
        signature_valid: null,
        processed: null,
        processed_at: null,
        error_message: null,
        created_at: '',
      }))
    );
    if (selectedInstance && !fromList.includes(selectedInstance)) fromList.push(selectedInstance);
    return fromList.sort();
  }, [instancesQuery.data, selectedInstance]);

  const liveStatus = useMemo(
    () => computeInstanceStatus(events, selectedInstance),
    [events, selectedInstance]
  );

  const latency = useMemo(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    return computeLatencyStats(
      events.filter((e) => new Date(e.created_at).getTime() >= oneHourAgo)
    );
  }, [events]);

  const breakdown = useMemo(() => aggregateValidationByInstance(events), [events]);

  const availableEventTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.event_type) set.add(e.event_type);
    return Array.from(set).sort();
  }, [events]);

  // ── View preferences ─────────────────────────────────────────────────────
  const {
    prefs,
    setPref,
    setVisibleColumn,
    clearFilters: clearAdvancedFilters,
    resetPrefs,
    activeFilterCount,
  } = useWebhookViewPreferences();

  const filteredEvents = useMemo(() => {
    const reason = prefs.reasonSearch.trim().toLowerCase();
    return events.filter((e) => {
      if (prefs.statusFilter === 'valid' && e.signature_valid !== true) return false;
      if (prefs.statusFilter === 'invalid' && e.signature_valid !== false) return false;
      if (prefs.statusFilter === 'unsigned' && e.signature_valid !== null) return false;
      if (prefs.statusFilter === 'errored' && !e.error_message) return false;
      if (prefs.eventTypeFilter && e.event_type !== prefs.eventTypeFilter) return false;
      if (reason && !(e.error_message ?? '').toLowerCase().includes(reason)) return false;
      return true;
    });
  }, [events, prefs.statusFilter, prefs.eventTypeFilter, prefs.reasonSearch]);

  // ── URL + filter helpers ─────────────────────────────────────────────────
  const clearAllFiltersAndUrl = useCallback(() => {
    clearAdvancedFilters();
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    setFilters({ search: '' });
  }, [clearAdvancedFilters, setFilters]);

  const resetAllPrefsAndUrl = useCallback(() => {
    resetPrefs();
    const url = new URL(window.location.href);
    url.search = '';
    window.history.replaceState({}, '', url.toString());
    setFilters({ search: '' });
  }, [resetPrefs, setFilters]);

  // Auto-apply pinned instance once on mount, only if URL has no instance set.
  const pinnedAppliedRef = useRef(false);
  useEffect(() => {
    if (pinnedAppliedRef.current) return;
    pinnedAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (!params.get('instance') && prefs.pinnedInstance) {
      setInstance(prefs.pinnedInstance);
    }
  }, [prefs.pinnedInstance, setInstance]);

  // ── Alerts ───────────────────────────────────────────────────────────────
  const {
    config: alertConfig,
    setConfig: setAlertConfig,
    activeBreaches,
    recentAlerts,
    history: alertHistory,
    reloadHistory,
  } = useWebhookHealthAlerts();

  // ── Recheck dialog ───────────────────────────────────────────────────────
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckLoading, setRecheckLoading] = useState(false);
  const [recheckResult, setRecheckResult] = useState<RecheckResult | null>(null);
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const handleRecheck = useCallback(async (eventId: string) => {
    setRecheckingId(eventId);
    setRecheckOpen(true);
    setRecheckLoading(true);
    setRecheckResult(null);
    setRecheckError(null);
    try {
      const res = await recheckWebhookSignature(eventId);
      setRecheckResult(res);
      if (res.signature_valid === true) toast.success('Assinatura válida');
      else if (res.signature_valid === false) toast.error('Assinatura inválida');
      else toast.message('Revalidação inconclusiva');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao revalidar';
      setRecheckError(msg);
      toast.error(msg);
    } finally {
      setRecheckLoading(false);
      setRecheckingId(null);
    }
  }, []);

  const secret = secretQuery.data;
  const enabled = (secret?.configured ?? false) || total24h > 0;
  const scopeLabel = selectedInstance ?? 'todas';
  const defaultInstance = DEFAULT_WHATSAPP_INSTANCE;

  return {
    // instance selection
    selectedInstance,
    setInstance,
    instances,
    defaultInstance,
    scopeLabel,
    // queries
    secretQuery,
    eventsQuery,
    instancesQuery,
    refetchAll,
    // secret
    secret,
    enabled,
    // event metrics
    events,
    lastEvent,
    total24h,
    validSigned,
    invalidSigned,
    unsigned,
    errored,
    validationRate,
    // derived
    liveStatus,
    latency,
    breakdown,
    filteredEvents,
    availableEventTypes,
    // view prefs
    prefs,
    setPref,
    setVisibleColumn,
    activeFilterCount,
    clearAllFiltersAndUrl,
    resetAllPrefsAndUrl,
    // alerts
    alertConfig,
    setAlertConfig,
    activeBreaches,
    recentAlerts,
    alertHistory,
    reloadHistory,
    // recheck
    recheckOpen,
    setRecheckOpen,
    recheckLoading,
    recheckResult,
    recheckError,
    recheckingId,
    handleRecheck,
  };
}
