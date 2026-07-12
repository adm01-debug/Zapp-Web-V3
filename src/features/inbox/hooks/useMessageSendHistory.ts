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
import type { Json } from '@/integrations/supabase/types';

export interface RetryAttempt {
  attempt: number;
  status?: number;
  reason: string;
  /** ISO timestamp opcional — só populado se a EF gravar */
  at?: string;
  /** Latência da tentativa em ms, se disponível */
  duration_ms?: number;
}

export interface AuditEntry {
  id: string;
  action: string;
  createdAt: string;
  details: unknown;
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
  auditEntries: AuditEntry[];
}

const STALE_MS = 15_000;

/**
 * `outbound_delivery_audit` ainda não está tipada em `types.ts` (tabela
 * criada no FATOR X e ainda não regenerada). Definimos aqui o shape
 * mínimo consumido pelo hook para evitar `any` disperso.
 */
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

function normalizeRetryReasons(raw: Json | null | undefined): RetryAttempt[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is RetryAttempt =>
      typeof r === 'object' &&
      r !== null &&
      !Array.isArray(r) &&
      typeof (r as { attempt?: unknown }).attempt === 'number' &&
      typeof (r as { reason?: unknown }).reason === 'string'
  );
}

export function useMessageSendHistory(messageId: string | undefined, enabled: boolean) {
  return useQuery<MessageSendHistory>({
    queryKey: ['message-send-history', messageId],
    enabled: Boolean(messageId) && enabled,
    staleTime: STALE_MS,
    queryFn: async () => {
      if (!messageId) return { metric: null, auditEntries: [] };

      const idempotencyKey = `msg:${messageId}`;

      // `outbound_delivery_audit` ainda não está em `types.ts`. Cast pontual
      // via `unknown` mantém o restante do hook fortemente tipado.
      const outboundQuery = (
        supabase as unknown as {
          from: (t: string) => {
            select: (cols: string) => {
              or: (f: string) => {
                order: (
                  col: string,
                  opts: { ascending: boolean }
                ) => {
                  limit: (n: number) => Promise<{ data: OutboundAuditRow[] | null }>;
                };
              };
            };
          };
        }
      )
        .from('outbound_delivery_audit')
        .select('*')
        .or(`conversation_id.eq.${messageId},metadata->>external_id.eq.${messageId}`)
        .order('created_at', { ascending: false })
        .limit(10);

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

      const combinedAudit = [...auditEntries, ...outboundEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const row = metricRes.data;
      if (!row) return { metric: null, auditEntries: combinedAudit };

      return {
        metric: {
          id: row.id,
          action: row.action,
          method: row.method ?? 'unknown',
          finalStatus: row.final_status ?? 'unknown',
          finalHttpStatus: row.final_http_status,
          attemptCount: row.attempt_count ?? 0,
          totalDurationMs: row.total_duration_ms,
          instanceName: row.instance_name,
          idempotencyKey: row.idempotency_key,
          retryReasons: normalizeRetryReasons(row.retry_reasons),
          createdAt: row.created_at ?? new Date(0).toISOString(),
          rawJson: row,
        },
        auditEntries: combinedAudit,
      };
    },
  });
}
