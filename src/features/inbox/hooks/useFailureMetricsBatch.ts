/**
 * Carrega em lote os retry_metrics de todas as mensagens em estado de
 * falha terminal (failed_retries / failed_auth / failed) presentes nas
 * conversas do inbox.
 *
 * Usado pelo dropdown de "tipo de falha" no sidebar do inbox para
 * permitir filtragem granular sem incorrer em N+1 queries.
 *
 * Estratégia: 1 query única por idempotency_key IN (...), cache via
 * React Query. Só roda quando `enabled` (filtro ativado).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ConversationWithMessages } from '@/features/inbox';

export type FailureCategory = 'auth' | 'http_4xx' | 'http_5xx' | 'network' | 'unknown';

export const FAILURE_CATEGORY_LABEL: Record<FailureCategory, string> = {
  auth: 'Falha de autenticação',
  http_4xx: 'HTTP 4xx (cliente)',
  http_5xx: 'HTTP 5xx (servidor)',
  network: 'Timeout / rede',
  unknown: 'Outras falhas',
};

const TERMINAL = new Set(['failed', 'failed_auth', 'failed_retries']);

interface MetricRow {
  idempotency_key: string;
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; status?: number; reason: string }> | null;
}

/** Classifica uma linha de retry_metrics em uma das categorias visuais. */
export function classifyFailure(
  finalHttpStatus: number | null,
  reasons: MetricRow['retry_reasons'],
  messageStatus: string | null,
): FailureCategory {
  if (messageStatus === 'failed_auth') return 'auth';

  const last = Array.isArray(reasons) && reasons.length > 0 ? reasons[reasons.length - 1] : null;
  const lastReason = last?.reason ?? '';

  if (lastReason === 'auth_failed' || finalHttpStatus === 401 || finalHttpStatus === 403) {
    return 'auth';
  }
  if (lastReason === 'timeout' || lastReason === 'network_error') {
    return 'network';
  }
  if (typeof finalHttpStatus === 'number') {
    if (finalHttpStatus >= 500 && finalHttpStatus < 600) return 'http_5xx';
    if (finalHttpStatus >= 400 && finalHttpStatus < 500) return 'http_4xx';
  }
  return 'unknown';
}

/** Coleta IDs únicos de mensagens em falha terminal de todas as conversas. */
function collectTerminalMessageIds(conversations: ConversationWithMessages[]): string[] {
  const ids = new Set<string>();
  for (const conv of conversations) {
    for (const m of conv.messages || []) {
      if (m.status && TERMINAL.has(m.status)) ids.add(m.id);
    }
  }
  return Array.from(ids);
}

const STALE_MS = 30_000;
const CHUNK_SIZE = 200;

export function useFailureMetricsBatch(
  conversations: ConversationWithMessages[],
  enabled: boolean,
) {
  const messageIds = enabled ? collectTerminalMessageIds(conversations) : [];

  return useQuery<Record<string, FailureCategory>>({
    queryKey: ['failure-metrics-batch', messageIds.sort().join(',')],
    enabled: enabled && messageIds.length > 0,
    staleTime: STALE_MS,
    queryFn: async () => {
      const result: Record<string, FailureCategory> = {};
      const messageStatusById = new Map<string, string | null>();
      for (const conv of conversations) {
        for (const m of conv.messages || []) {
          if (m.status && TERMINAL.has(m.status)) messageStatusById.set(m.id, m.status);
        }
      }

      const keys = messageIds.map((id) => `msg:${id}`);

      // Chunk para evitar queries gigantes
      for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
        const slice = keys.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('evolution_retry_metrics')
          .select('idempotency_key, final_http_status, retry_reasons')
          .in('idempotency_key', slice);
        if (error) continue;

        for (const row of (data || []) as MetricRow[]) {
          const id = row.idempotency_key.replace(/^msg:/, '');
          result[id] = classifyFailure(
            row.final_http_status,
            row.retry_reasons,
            messageStatusById.get(id) ?? null,
          );
        }
      }

      // Mensagens sem métrica ainda — classifica pelo status atual
      for (const id of messageIds) {
        if (!result[id]) {
          const status = messageStatusById.get(id);
          result[id] = status === 'failed_auth' ? 'auth' : 'unknown';
        }
      }

      return result;
    },
  });
}
