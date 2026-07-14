import type { RootCause, RootCauseMeta } from '@/lib/failureRootCause';

export type FailedMessageStatus = 'pending' | 'retrying' | 'succeeded' | 'abandoned';

export interface FailedMessageRow {
  id: string;
  instance_name: string;
  remote_jid: string | null;
  payload: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  retry_count: number;
  max_retries: number;
  status: FailedMessageStatus;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  succeeded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FailedMessagesFilters {
  hours?: number;
  status?: FailedMessageStatus | null;
  instance?: string | null;
  errorCode?: string | null;
  /** Filtro adicional por causa raiz canônica (rate_limit, auth, …). */
  rootCause?: RootCause | null;
  search?: string | null;
  /** Custom range — overrides `hours` when both `from` and `to` are set */
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}

export interface ErrorCodeAggregate {
  code: string;
  count: number;
  lastAt: string;
}

export interface InstanceAggregate {
  instance: string;
  count: number;
}

export interface RootCauseAggregate {
  cause: RootCause;
  count: number;
  meta: RootCauseMeta;
}

export interface FailedMessagesAggregates {
  pending: number;
  retrying: number;
  abandoned24h: number;
  successAfterRetryRate: number;
  byErrorCode: ErrorCodeAggregate[];
  byInstance: InstanceAggregate[];
  /** Agrupamento por causa raiz canônica (sorted desc). */
  byRootCause: RootCauseAggregate[];
  topInstance: InstanceAggregate | null;
}

export interface DlqStats {
  total: number;
  total_24h: number;
  oldest_pending_at: string | null;
  by_status: Record<string, number>;
  by_instance: Array<{ instance: string; count: number }>;
}
