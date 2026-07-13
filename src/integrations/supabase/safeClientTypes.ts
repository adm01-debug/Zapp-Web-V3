import type { PostgrestError } from '@supabase/supabase-js';

// Internal — PromiseLike shape that both QueryBuilder and FilterBuilder satisfy.
export type AnyQueryResult = PromiseLike<{ data: unknown; error: PostgrestError | null }>;

// Extends AnyQueryResult to allow calling .single() without an `as any` escape.
export type AnyQueryBuilderResult = AnyQueryResult & { single?: () => AnyQueryResult };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeQueryBuilder = any;

export interface SafeResponse<T> {
  data: T | null;
  error: Error | null;
  requestId?: string;
}

export interface OperationFailure {
  operation: string;
  table?: string;
  error: string;
  timestamp: number;
  requestId: string;
}

export interface ClientTelemetry {
  lastValidation: Date | null;
  recentFailures: OperationFailure[];
  stats: {
    totalCalls: number;
    failedCalls: number;
    cacheHits: number;
  };
}

export interface CacheInfo {
  expiration: Date | null;
  size: number;
}

export interface FailureRecord {
  requestId: string;
  operation: string;
  resource: string;
  error: string;
  timestamp: string;
}
