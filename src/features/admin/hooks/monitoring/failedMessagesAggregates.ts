import { aggregateByRootCause } from '@/lib/failureRootCause';
import type {
  FailedMessageRow,
  FailedMessagesAggregates,
  ErrorCodeAggregate,
  InstanceAggregate,
} from './failedMessagesTypes';

/** Hook: compute Failed Messages Aggregates. */
export function computeFailedMessagesAggregates(
  rows: FailedMessageRow[]
): FailedMessagesAggregates {
  const pending = rows.filter((r) => r.status === 'pending').length;
  const retrying = rows.filter((r) => r.status === 'retrying').length;
  const abandoned24h = rows.filter((r) => r.status === 'abandoned').length;
  const retried = rows.filter((r) => r.retry_count > 0);
  const succeededRetried = retried.filter((r) => r.status === 'succeeded').length;
  const successAfterRetryRate =
    retried.length === 0 ? 0 : Math.round((succeededRetried / retried.length) * 1000) / 10;

  const errorMap = new Map<string, { count: number; lastAt: string }>();
  for (const r of rows) {
    const code = r.error_code ?? (r.http_status ? `http_${r.http_status}` : 'unknown');
    const cur = errorMap.get(code);
    if (cur) {
      cur.count += 1;
      if (r.created_at > cur.lastAt) cur.lastAt = r.created_at;
    } else {
      errorMap.set(code, { count: 1, lastAt: r.created_at });
    }
  }
  const byErrorCode: ErrorCodeAggregate[] = Array.from(errorMap.entries())
    .map(([code, v]) => ({ code, count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count);

  const instMap = new Map<string, number>();
  for (const r of rows) {
    instMap.set(r.instance_name, (instMap.get(r.instance_name) ?? 0) + 1);
  }
  const byInstance: InstanceAggregate[] = Array.from(instMap.entries())
    .map(([instance, count]) => ({ instance, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const byRootCause = aggregateByRootCause(rows);

  return {
    pending,
    retrying,
    abandoned24h,
    successAfterRetryRate,
    byErrorCode,
    byInstance,
    byRootCause,
    topInstance: byInstance[0] ?? null,
  };
}
