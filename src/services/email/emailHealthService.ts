import { EmailHealthInfo, EmailHealthFilters, EmailFailure } from './types';
import { EmailHealthRepository } from './emailHealthRepository';
import type { OperationFailure } from '@/integrations/supabase/safeClientTypes';

/**
 * Onda 8: mapeamento OperationFailure → EmailFailure.
 * `resource` = `table` (default 'unknown') e `timestamp` vira ISO string.
 */
const toEmailFailure = (f: OperationFailure): EmailFailure => ({
  requestId: f.requestId,
  operation: f.operation,
  resource: f.table ?? 'unknown',
  error: f.error,
  timestamp: new Date(f.timestamp).toISOString(),
});

const toEmailFailures = (arr: readonly OperationFailure[] | null | undefined): EmailFailure[] =>
  Array.isArray(arr) ? arr.map(toEmailFailure) : [];

/** Email Health Service. */
export class EmailHealthService {
  private repository: EmailHealthRepository;

  constructor(repository: EmailHealthRepository) {
    this.repository = repository;
  }

  async getHealthStatus(): Promise<EmailHealthInfo> {
    const summary = await this.repository.getRemoteSummary();
    const telemetry = this.repository.getLocalTelemetry();
    const cacheInfo = this.repository.getLocalCacheInfo();
    const failures = toEmailFailures(telemetry.recentFailures);

    if (summary) {
      return {
        status: (summary.status as 'healthy' | 'degraded' | 'error') || 'healthy',
        lastValidation: summary.last_validation
          ? new Date(summary.last_validation)
          : telemetry.lastValidation,
        cacheExpiration: cacheInfo.expiration,
        recentFailures: failures,
        stats: telemetry.stats,
      };
    }

    return {
      status: this.calculateStatus(failures),
      lastValidation: telemetry.lastValidation,
      cacheExpiration: cacheInfo.expiration,
      recentFailures: failures,
      stats: telemetry.stats,
    };
  }

  getFailures(filters: EmailHealthFilters = {}): { items: EmailFailure[]; total: number } {
    const telemetry = this.repository.getLocalTelemetry();
    let failures: EmailFailure[] = toEmailFailures(telemetry?.recentFailures);

    if (filters.requestId) {
      const { requestId } = filters;
      failures = failures.filter((f) => f.requestId.includes(requestId));
    }
    if (filters.operation) {
      const { operation } = filters;
      failures = failures.filter((f) => f.operation.toLowerCase() === operation.toLowerCase());
    }
    if (filters.resource) {
      const { resource } = filters;
      failures = failures.filter((f) => f.resource.toLowerCase().includes(resource.toLowerCase()));
    }

    const total = failures.length;
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 10;
    const items = failures.slice((page - 1) * pageSize, page * pageSize);

    return { items, total };
  }

  async forceRevalidation(): Promise<void> {
    const criticalResources = ['email_accounts', 'email_threads', 'rpc_email_token_status'];
    await this.repository.forceRevalidation(criticalResources);
  }

  calculateStatus(failures: EmailFailure[] | null | undefined): 'healthy' | 'degraded' | 'error' {
    if (!Array.isArray(failures)) return 'error';
    const count = failures.length;
    if (count > 10) return 'error';
    if (count > 0) return 'degraded';
    return 'healthy';
  }
}

// Singleton instance for convenience, matching original export pattern
/** email Health Service. */
export const emailHealthService = new EmailHealthService(new EmailHealthRepository());