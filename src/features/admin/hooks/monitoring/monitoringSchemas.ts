import { z } from 'zod';
import type { Json } from '@/integrations/supabase/schema';
import type {
  DlqStats,
  FailedMessageStatus,
} from './failedMessagesTypes';

/**
 * E60 — saneamento auth/admin: narrowing runtime de rows/RPCs do monitoring
 * sem casts `as unknown as`. Os tipos gerados do Supabase usam `Json` para
 * colunas jsonb e strings amplas onde o contrato SQL define valores
 * específicos; estes guards fazem a validação real no boundary.
 */

/** Json → Record (payload/context/details). Json escalar/array → null (fail-safe). */
export function toRecordOrNull(v: Json): Record<string, unknown> | null {
  if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

const FAILED_MESSAGE_STATUSES = [
  'pending',
  'retrying',
  'succeeded',
  'abandoned',
  'failed',
] as const;

export function isFailedMessageStatus(v: string): v is FailedMessageStatus {
  return (FAILED_MESSAGE_STATUSES as readonly string[]).includes(v);
}

const dlqStatsSchema = z.object({
  total: z.number(),
  total_24h: z.number(),
  oldest_pending_at: z.string().nullable(),
  by_status: z.record(z.string(), z.number()),
  by_instance: z.array(z.object({ instance: z.string(), count: z.number() })),
});

const DEFAULT_DLQ_STATS: DlqStats = {
  total: 0,
  total_24h: 0,
  oldest_pending_at: null,
  by_status: {},
  by_instance: [],
};

/** rpc_dlq_stats retorna `Json` nos tipos gerados — valida com zod (fail-safe). */
export function parseDlqStats(data: Json | null | undefined): DlqStats {
  const parsed = dlqStatsSchema.safeParse(data ?? {});
  return parsed.success ? parsed.data : DEFAULT_DLQ_STATS;
}
