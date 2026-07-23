import type { PostgrestError } from '@supabase/supabase-js';

// Internal — PromiseLike shape that both QueryBuilder and FilterBuilder satisfy.
/** Any Query Result. */
export type AnyQueryResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;

// Extends AnyQueryResult to allow calling .single() without an `as any` escape.
/** Any Query Builder Result. */
export type AnyQueryBuilderResult = AnyQueryResult & { single?: () => AnyQueryResult };

/** Safe Query Builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeQueryBuilder = any;

/** Safe Response. */
export interface SafeResponse<T> {
  data: T | null;
  error: Error | null;
  requestId?: string;
}

/** Operation Failure. */
export interface OperationFailure {
  operation: string;
  table?: string;
  error: string;
  timestamp: number;
  requestId: string;
}

/** Client Telemetry. */
export interface ClientTelemetry {
  lastValidation: Date | null;
  recentFailures: OperationFailure[];
  stats: {
    totalCalls: number;
    failedCalls: number;
    cacheHits: number;
  };
}

/** Cache Info. */
export interface CacheInfo {
  expiration: Date | null;
  size: number;
}

/** Failure Record. */
export interface FailureRecord {
  requestId: string;
  operation: string;
  resource: string;
  error: string;
  timestamp: string;
}
