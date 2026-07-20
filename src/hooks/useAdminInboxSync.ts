import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryExternalProxy } from '@/lib/externalProxy';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import {
  INSTANCE,
  POLL_MS,
  BUCKET_CONFIGS,
  ALERT_THRESHOLD_KEY,
  MIN_THRESHOLD,
  MAX_THRESHOLD,
  type SyncBucket,
  type InboundOutboundLast,
  type ConversationCount,
  type FailedRow,
  type AuditRow,
  classifyHealth,
  readStoredThreshold,
} from '@/pages/admin/inboxSyncUtils';

const log = getLogger('AdminInboxSyncStatusPage');

const INBOX_SYNC_KEY = ['admin-inbox-sync'] as const;

/** Admin Inbox Sync State. */
export interface AdminInboxSyncState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastRefresh: Date | null;
  alertThresholdMin: number;
  buckets: SyncBucket[];
  lastEvents: InboundOutboundLast;
  topConversations: ConversationCount[];
  failed: FailedRow[];
  audit: AuditRow[];
  health: ReturnType<typeof classifyHealth>;
  fetchAll: (silent?: boolean) => void;
  handleThresholdChange: (raw: string) => void;
}

/** use Admin Inbox Sync. */
export function useAdminInboxSync(): AdminInboxSyncState {
  const [alertThresholdMin, setAlertThresholdMin] = useState<number>(() => readStoredThreshold());
  const alertedForInboundRef = useRef<string | null>(null);
  const prevErrorRef = useRef<unknown>(null);

  const {
    data,
    isLoading: loading,
    isFetching: refreshing,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: INBOX_SYNC_KEY,
    queryFn: async () => {
      const bucketResults = await Promise.all(
        BUCKET_CONFIGS.map((b) =>
          queryExternalProxy({
            table: 'evolution_messages',
            select: 'id',
            filters: [
              { column: 'instance_name', operator: 'eq', value: INSTANCE },
              {
                column: 'created_at',
                operator: 'gte',
                value: new Date(Date.now() - b.sinceMs).toISOString(),
              },
            ],
            limit: 1,
            countMode: 'exact',
          })
        )
      );

      const [lastInbound, lastOutbound] = await Promise.all([
        queryExternalProxy<{ created_at: string }>({
          table: 'evolution_messages',
          select: 'created_at',
          filters: [
            { column: 'instance_name', operator: 'eq', value: INSTANCE },
            { column: 'from_me', operator: 'eq', value: false },
          ],
          order: { column: 'created_at', ascending: false },
          limit: 1,
        }),
        queryExternalProxy<{ created_at: string }>({
          table: 'evolution_messages',
          select: 'created_at',
          filters: [
            { column: 'instance_name', operator: 'eq', value: INSTANCE },
            { column: 'from_me', operator: 'eq', value: true },
          ],
          order: { column: 'created_at', ascending: false },
          limit: 1,
        }),
      ]);

      const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const sample = await queryExternalProxy<{
        remote_jid: string;
        push_name: string | null;
        created_at: string;
      }>({
        table: 'evolution_messages',
        select: 'remote_jid,push_name,created_at',
        filters: [
          { column: 'instance_name', operator: 'eq', value: INSTANCE },
          { column: 'created_at', operator: 'gte', value: since24h },
        ],
        order: { column: 'created_at', ascending: false },
        limit: 500,
      });

      const grouped = new Map<string, ConversationCount>();
      for (const row of sample.data) {
        const cur = grouped.get(row.remote_jid);
        if (cur) {
          cur.count += 1;
          if (row.created_at > cur.lastAt) {
            cur.lastAt = row.created_at;
            if (row.push_name) cur.push_name = row.push_name;
          }
        } else {
          grouped.set(row.remote_jid, {
            remote_jid: row.remote_jid,
            push_name: row.push_name,
            count: 1,
            lastAt: row.created_at,
          });
        }
      }
      const topConversations = Array.from(grouped.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const [failedRes, auditRes] = await Promise.all([
        supabase
          .from('failed_messages')
          .select('id, created_at, error_message, retry_count, status')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('audit_logs')
          .select('id, created_at, action, entity_type, entity_id')
          .order('created_at', { ascending: false })
          .limit(15),
      ]);

      const buckets: SyncBucket[] = BUCKET_CONFIGS.map((b, i) => ({
        ...b,
        count: bucketResults[i].count ?? bucketResults[i].data.length,
      }));

      return {
        buckets,
        lastEvents: {
          inboundAt: lastInbound.data[0]?.created_at ?? null,
          outboundAt: lastOutbound.data[0]?.created_at ?? null,
        } as InboundOutboundLast,
        topConversations,
        failed: (failedRes.data ?? []) as FailedRow[],
        audit: (auditRes.data ?? []) as AuditRow[],
        lastRefresh: new Date(),
      };
    },
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    if (queryError && queryError !== prevErrorRef.current) {
      prevErrorRef.current = queryError;
      const msg = queryError instanceof Error ? queryError.message : 'Falha ao consultar o status.';
      log.error('fetchAll failed', queryError);
      toast.error(msg);
    }
  }, [queryError]);

  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Falha ao consultar o status.'
    : null;

  const buckets: SyncBucket[] = data?.buckets ?? BUCKET_CONFIGS.map((c) => ({ ...c, count: null }));
  const lastEvents: InboundOutboundLast = data?.lastEvents ?? { inboundAt: null, outboundAt: null };
  const topConversations: ConversationCount[] = data?.topConversations ?? [];
  const failed: FailedRow[] = data?.failed ?? [];
  const audit: AuditRow[] = data?.audit ?? [];
  const lastRefresh: Date | null = data?.lastRefresh ?? null;

  const fetchAll = useCallback(
    async (silent = false) => {
      if (silent) {
        void refetch();
      } else {
        await refetch();
      }
    },
    [refetch]
  );

  const health = useMemo(
    () => classifyHealth(lastEvents.inboundAt, alertThresholdMin),
    [lastEvents.inboundAt, alertThresholdMin]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ALERT_THRESHOLD_KEY, String(alertThresholdMin));
  }, [alertThresholdMin]);

  useEffect(() => {
    if (!health.alerting || loading) return;
    const key = lastEvents.inboundAt ?? '__no_inbound__';
    if (alertedForInboundRef.current === key) return;
    alertedForInboundRef.current = key;
    const minutesLabel =
      health.ageMinutes != null
        ? `${health.ageMinutes}min sem inbound`
        : 'nenhuma inbound encontrada';
    log.warn('[inbox-sync] inactivity alert fired', {
      lastInboundAt: lastEvents.inboundAt,
      ageMinutes: health.ageMinutes,
      thresholdMin: alertThresholdMin,
    });
    toast.error('Inbox sem mensagens recebidas', {
      description: `${minutesLabel} (limite: ${alertThresholdMin}min). Verifique webhook e instância "${INSTANCE}".`,
      duration: 10_000,
    });
  }, [health.alerting, health.ageMinutes, lastEvents.inboundAt, alertThresholdMin, loading]);

  useEffect(() => {
    if (!health.alerting && lastEvents.inboundAt) {
      if (alertedForInboundRef.current && alertedForInboundRef.current !== lastEvents.inboundAt) {
        alertedForInboundRef.current = null;
      }
    }
  }, [health.alerting, lastEvents.inboundAt]);

  const handleThresholdChange = useCallback((raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, parsed));
    setAlertThresholdMin(clamped);
    alertedForInboundRef.current = null;
  }, []);

  return {
    loading,
    refreshing,
    error,
    lastRefresh,
    alertThresholdMin,
    buckets,
    lastEvents,
    topConversations,
    failed,
    audit,
    health,
    fetchAll,
    handleThresholdChange,
  };
}
