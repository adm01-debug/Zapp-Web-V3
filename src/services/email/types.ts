export interface EmailFailure {
  requestId: string;
  operation: string;
  resource: string;
  error: string;
  timestamp: string;
}

export interface EmailHealthInfo {
  status: 'healthy' | 'degraded' | 'error';
  /** Populated by the edge function when telemetry is persisted via shared storage. */
  source?: string;
  lastValidation: Date | null;
  cacheExpiration: number | null;
  recentFailures: EmailFailure[];
  stats: {
    totalCalls: number;
    failedCalls: number;
    cacheHits: number;
  };
}

export interface EmailHealthFilters {
  requestId?: string;
  operation?: string;
  resource?: string;
  page?: number;
  pageSize?: number;
}
