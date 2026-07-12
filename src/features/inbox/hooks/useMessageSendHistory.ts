/**
 * Carrega o histórico completo de envio de uma mensagem para o painel
 * de debug: linha do tempo de tentativas (retry_metrics.retry_reasons),
 * métricas agregadas e entradas relacionadas em audit_logs.
 *
 * Todos os shapes vêm de `messageSendHistory.schemas.ts` (Zod) para
 * garantir tolerância a linhas legadas e derivação consistente de
 * `finalStatus`.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  type AuditEntry,
  type FinalStatus,
  type RetryAttempt,
  dedupeAuditEntries,
  deriveFinalStatus,
  normalizeRetryReasons,
  padRetryAttempts,
} from './messageSendHistory.schemas';

export type { AuditEntry, FinalStatus, RetryAttempt };

export interface MessageSendHistory {
  metric: {
    id: string;
    action: string;
    method: string;
    finalStatus: FinalStatus;
    finalHttpStatus: number | null;
    attemptCount: number;
    totalDurationMs: number | null;
    instanceName: string | null;
    idempotencyKey: string | null;
    retryReasons: RetryAttempt[];
    createdAt: string;
    rawJson: unknown;
  } | null;
  auditEntries: AuditEntry[];
}

const STALE_MS = 15_000;

interface OutboundAuditRow {
  id: string;
  event_type: string | null;
  status: string | null;
  latency_ms: number | null;
  instance_name: string | null;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export function useMessageSendHistory(messageId: string | undefined, enabled: boolean) {
  return useQuery<MessageSendHistory>({
    queryKey: ['message-send-history', messageId],
    enabled: Boolean(messageId) && enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!messageId) return { metric: null, auditEntries: [] };

      const idempotencyKey = `msg:${messageId}`;
      // Tabelas evolution_retry_metrics/outbound_delivery_audit ainda não estão em types.ts —
      // usamos interface tipada em vez de cast `any` até a próxima regeneração dos tipos.
      interface UntypedClient {
        from(table: string): {
          select(columns: string): {
            eq(
              column: string,
              value: unknown
            ): {
              order(
                column: string,
                options?: { ascending?: boolean }
              ): {
                limit(n: number): {
                  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
                };
              };
            };
            or(filter: string): {
              order(
                column: string,
                options?: { ascending?: boolean }
              ): {
                limit(n: number): Promise<{ data: unknown[]; error: unknown }>;
              };
            };
          };
        };
      }
      const supa = supabase as unknown as UntypedClient;
      const results = await Promise.allSettled([
        supa
          .from('evolution_retry_metrics')
          .select('*')
          .eq('idempotency_key', idempotencyKey)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('audit_logs')
          .select('id, action, created_at, details')
          .eq('entity_type', 'message')
          .eq('entity_id', messageId)
          .order('created_at', { ascending: false })
          .limit(20),
        outboundQuery,
      ]);

      const metricRes =
        results[0].status === 'fulfilled' ? results[0].value : { data: null, error: null };
      const auditRes =
        results[1].status === 'fulfilled' ? results[1].value : { data: [], error: null };
      const outboundAuditRes =
        results[2].status === 'fulfilled' ? results[2].value : { data: [], error: null };

      const failures = results
        .map((r, i) => (r.status === 'rejected' ? i : -1))
        .filter((i) => i >= 0);
      if (failures.length > 0) {
        const labels = ['retryMetrics', 'auditLogs', 'outboundAudit'];
        console.warn(
          `useMessageSendHistory(${messageId}): Failed to load ${failures.map((i) => labels[i]).join(', ')}`
        );
      }

      const auditEntries = (auditRes.data ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        createdAt: e.created_at ?? new Date(0).toISOString(),
        details: e.details,
      }));

      const outboundEntries: AuditEntry[] = (outboundAuditRes.data ?? []).map((e) => ({
        id: e.id,
        action: `OUTBOUND_${(e.event_type ?? 'send').toUpperCase()}`,
        createdAt: e.created_at,
        details: {
          status: e.status,
          latency: e.latency_ms,
          instance: e.instance_name,
          error_message: e.error_message,
          ...(e.metadata && typeof e.metadata === 'object' ? e.metadata : {}),
        },
      }));

      const combinedAudit = dedupeAuditEntries(
        [...auditEntries, ...outboundEntries].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );

      const row = metricRes.data;
      if (!row) return { metric: null, auditEntries: combinedAudit };

      const reasons = Array.isArray(row.retry_reasons) ? (row.retry_reasons as RetryAttempt[]) : [];

      return {
        metric: {
          id: row.id,
          action: row.action,
          method: row.method ?? 'unknown',
          finalStatus,
          finalHttpStatus: row.final_http_status,
          attemptCount: row.attempt_count ?? 0,
          totalDurationMs: row.total_duration_ms,
          instanceName: row.instance_name,
          idempotencyKey: row.idempotency_key,
          retryReasons: attempts,
          createdAt: row.created_at ?? new Date(0).toISOString(),
          rawJson: row,
        },
        auditEntries: combinedAudit,
      };
    },
  });
}
