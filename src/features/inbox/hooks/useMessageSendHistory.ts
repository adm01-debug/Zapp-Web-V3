/**
 * Carrega o histórico completo de envio de uma mensagem para o painel
 * de debug: linha do tempo de tentativas (retry_metrics.retry_reasons),
 * métricas agregadas e entradas relacionadas em audit_logs.
 *
 * Usado pelo `MessageSendHistorySheet` quando o agente abre o painel
 * pelo menu de contexto.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RetryAttempt {
  attempt: number;
  status?: number;
  reason: string;
  /** ISO timestamp opcional — só populado se a EF gravar */
  at?: string;
  /** Latência da tentativa em ms, se disponível */
  duration_ms?: number;
}

export interface MessageSendHistory {
  metric: {
    id: string;
    action: string;
    method: string;
    finalStatus: 'success' | 'failed' | 'exhausted' | string;
    finalHttpStatus: number | null;
    attemptCount: number;
    totalDurationMs: number | null;
    instanceName: string | null;
    idempotencyKey: string | null;
    retryReasons: RetryAttempt[];
    createdAt: string;
    rawJson: unknown;
  } | null;
  auditEntries: Array<{
    id: string;
    action: string;
    createdAt: string;
    details: unknown;
  }>;
}

const STALE_MS = 15_000;

export function useMessageSendHistory(messageId: string | undefined, enabled: boolean) {
  return useQuery<MessageSendHistory>({
    queryKey: ['message-send-history', messageId],
    enabled: Boolean(messageId) && enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!messageId) return { metric: null, auditEntries: [] };

      // Se for um ID otimista (FATOR X), não temos métricas persistidas ainda.
      // Tentamos extrair o ID real se disponível.
      const isOptimistic = messageId.startsWith('optimistic:');

      const idempotencyKey = `msg:${messageId}`;
      // Tabelas evolution_retry_metrics/outbound_delivery_audit ainda não estão em types.ts —
      // usamos cast para `any` até a próxima regeneração dos tipos.
      const supa = supabase as unknown as {
        from: (table: string) => ReturnType<typeof supabase.from>;
      };
      const [metricRes, auditRes, outboundAuditRes] = await Promise.all([
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
        supa
          .from('outbound_delivery_audit')
          .select('*')
          .or(`conversation_id.eq.${messageId},metadata->>external_id.eq.${messageId}`)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const auditEntries = (auditRes.data ?? []).map((e) => ({
        id: e.id,
        action: e.action,
        createdAt: e.created_at,
        details: e.details,
      }));

      // Adiciona entradas do outbound_delivery_audit (FATOR X) ao histórico
      const outboundEntries = (outboundAuditRes.data ?? []).map((e) => ({
        id: e.id,
        action: `OUTBOUND_${(e.event_type ?? 'send').toUpperCase()}`,
        createdAt: e.created_at,
        details: {
          status: e.status,
          latency: e.latency_ms,
          instance: e.instance_name,
          error_message: e.error_message,
          ...(typeof e.metadata === 'object' && e.metadata !== null ? e.metadata : {}),
        },
      }));

      const combinedAudit = [...auditEntries, ...outboundEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const row = metricRes.data;
      if (!row) return { metric: null, auditEntries: combinedAudit };

      const reasons = Array.isArray(row.retry_reasons)
        ? (row.retry_reasons as unknown as RetryAttempt[])
        : [];

      return {
        metric: {
          id: row.id,
          action: row.action,
          method: row.method,
          finalStatus: row.final_status as MessageSendHistory['metric']['finalStatus'],
          finalHttpStatus: row.final_http_status,
          attemptCount: row.attempt_count,
          totalDurationMs: row.total_duration_ms,
          instanceName: row.instance_name,
          idempotencyKey: row.idempotency_key,
          retryReasons: reasons,
          createdAt: row.created_at,
          rawJson: row,
        },
        auditEntries: combinedAudit,
      };
    },
  });
}
