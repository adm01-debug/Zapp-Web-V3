import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { subHours } from 'date-fns';
import { queryKeys } from '@/services/api/queryKeys';
import { queryExternalProxy } from '@/lib/externalProxy';
import { consumePendingWebhookEventsFilters } from '@/lib/webhookEventsDeepLink';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';

/** EVENT_TYPES. */
export const EVENT_TYPES = [
  'all',
  'PRESENCE_UPDATE',
  'CONTACTS_UPDATE',
  'CHATS_UPDATE',
  'CALL',
  'LABELS_ASSOCIATION',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'MESSAGES_DELETE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
] as const;

/** Event Type Filter. */
export type EventTypeFilter = (typeof EVENT_TYPES)[number];

/** MESSAGE_TYPES. */
export const MESSAGE_TYPES = [
  'all',
  'conversation',
  'extendedTextMessage',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
  'locationMessage',
  'contactMessage',
  'reactionMessage',
  'pollCreationMessage',
  'protocolMessage',
] as const;
/** Message Type Filter. */
export type MessageTypeFilter = (typeof MESSAGE_TYPES)[number];

/** STATUS_OPTIONS. */
export const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'processed', label: 'Processados' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'error', label: 'Com erro' },
] as const;
/** Status Filter. */
export type StatusFilter = (typeof STATUS_OPTIONS)[number]['value'];

/** RANGE_OPTIONS. */
export const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
  { value: '720', label: 'Últimos 30 dias' },
] as const;

/** use Webhook Events. */
export function useWebhookEvents() {
  // Drill-down from AdminWebhookOverviewPage: applies initial filters (once)
  // from sessionStorage. Validated against known types to prevent injection.
  const initialFilters = useMemo(() => {
    const pending = consumePendingWebhookEventsFilters();
    if (!pending) return null;
    const eventType =
      pending.eventType && (EVENT_TYPES as readonly string[]).includes(pending.eventType)
        ? (pending.eventType as EventTypeFilter)
        : undefined;
    const instance = pending.instance && pending.instance.trim() ? pending.instance : undefined;
    return { eventType, instance };
  }, []);

  const [hours, setHours] = useState<string>('24');
  const [eventType, setEventType] = useState<EventTypeFilter>(initialFilters?.eventType ?? 'all');
  const [instance, setInstance] = useState<string>(initialFilters?.instance ?? 'all');
  const [messageType, setMessageType] = useState<MessageTypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [remoteJidFilter, setRemoteJidFilter] = useState('');
  const [pushNameFilter, setPushNameFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EvolutionWebhookEvent | null>(null);
  const [viewMode, setViewMode] = useState<'events' | 'calls'>('events');

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: queryKeys.adminOps.webhookEventsFiltered(
      hours,
      eventType,
      instance,
      messageType,
      status,
      remoteJidFilter.trim().toLowerCase(),
      pushNameFilter.trim().toLowerCase()
    ),
    queryFn: async () => {
      // Computed inside queryFn so each refetchInterval cycle uses a fresh timestamp
      const sinceISO = subHours(new Date(), Number(hours)).toISOString();
      const filters: { column: string; operator: string; value: unknown }[] = [
        { column: 'created_at', operator: 'gte', value: sinceISO },
      ];
      if (eventType !== 'all')
        filters.push({ column: 'event_type', operator: 'eq', value: eventType });
      if (instance !== 'all')
        filters.push({ column: 'instance_name', operator: 'eq', value: instance });
      if (messageType !== 'all')
        filters.push({ column: 'message_type', operator: 'eq', value: messageType });

      if (status === 'processed') {
        filters.push({ column: 'processed', operator: 'eq', value: true });
        filters.push({ column: 'error_message', operator: 'is', value: null });
      } else if (status === 'pending') {
        filters.push({ column: 'processed', operator: 'eq', value: false });
        filters.push({ column: 'error_message', operator: 'is', value: null });
      } else if (status === 'error') {
        filters.push({ column: 'error_message', operator: 'not.is', value: null });
      }

      const jid = remoteJidFilter.trim();
      if (jid) filters.push({ column: 'remote_jid', operator: 'ilike', value: `%${jid}%` });
      const name = pushNameFilter.trim();
      if (name) filters.push({ column: 'push_name', operator: 'ilike', value: `%${name}%` });

      const res = await queryExternalProxy<EvolutionWebhookEvent>({
        table: 'evolution_webhook_events',
        select: '*',
        filters,
        order: { column: 'created_at', ascending: false },
        limit: 200,
      });
      return res.data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const aggregates = useMemo(() => {
    const rows = data ?? [];
    const byType: Record<string, number> = {};
    const byInstance = new Set<string>();
    let processed = 0;
    let errored = 0;
    for (const r of rows) {
      byType[r.event_type] = (byType[r.event_type] ?? 0) + 1;
      byInstance.add(r.instance_name);
      if (r.processed) processed++;
      if (r.error_message) errored++;
    }
    return {
      total: rows.length,
      processed,
      errored,
      types: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      instances: Array.from(byInstance).sort(),
    };
  }, [data]);

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.remote_jid?.toLowerCase().includes(q) ||
        r.push_name?.toLowerCase().includes(q) ||
        r.event_type.toLowerCase().includes(q) ||
        r.error_message?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const clearFilters = useCallback(() => {
    setRemoteJidFilter('');
    setPushNameFilter('');
    setMessageType('all');
    setStatus('all');
    setSearch('');
  }, []);

  const hasActiveFilters =
    !!remoteJidFilter || !!pushNameFilter || messageType !== 'all' || status !== 'all' || !!search;

  return {
    hours,
    setHours,
    eventType,
    setEventType,
    instance,
    setInstance,
    messageType,
    setMessageType,
    status,
    setStatus,
    remoteJidFilter,
    setRemoteJidFilter,
    pushNameFilter,
    setPushNameFilter,
    search,
    setSearch,
    selected,
    setSelected,
    viewMode,
    setViewMode,
    // sinceISO é interno à query — não exposto no retorno público
    data,
    isLoading,
    isRefetching,
    refetch,
    error,
    aggregates,
    filtered,
    clearFilters,
    hasActiveFilters,
  };
}
