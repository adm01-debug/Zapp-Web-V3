// @ts-nocheck
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

export function useMessageSendHistory(messageId: string | undefined, enabled: boolean) {
  return useQuery<MessageSendHistory>({
    queryKey: ['message-send-history', messageId],
    enabled: Boolean(messageId) && enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!messageId) return { metric: null, auditEntries: [] };

      const idempotencyKey = `msg:${messageId}`;
      // Tabelas evolution_retry_metrics/outbound_delivery_audit ainda não estão em types.ts —
      // usamos cast para `any` até a próxima regeneração dos tipos.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // ignore-audit — evolution_retry_metrics/outbound_delivery_audit not in generated types
      const [metricRes, auditRes, outboundAuditRes] = await Promise.all([
        supabase
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

      const auditEntries: AuditEntry[] = (auditRes.data ?? []).map((e) => ({
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

      const attempts = padRetryAttempts(
        normalizeRetryReasons(row.retry_reasons),
        row.attempt_count ?? 0,
      );
      const finalStatus = deriveFinalStatus({
        externalMessageId:
          (row as unknown as { external_message_id?: string | null }).external_message_id ?? null,
        retryCount: row.attempt_count ?? 0,
        maxRetries:
          (row as unknown as { max_retries?: number | null }).max_retries ?? attempts.length,
        nextRetryAt:
          (row as unknown as { next_retry_at?: string | null }).next_retry_at ?? null,
        storedFinalStatus: row.final_status,
      });

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
