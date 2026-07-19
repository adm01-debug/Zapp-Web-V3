
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailHealthRepository');

/** Email Health Repository. */
export class EmailHealthRepository {
  async getRemoteSummary() {
    try {
      const { data, error } = await safeClient.rpc<{ status: string; last_validation: string | null }>('rpc_get_email_health_summary');
      if (error) throw error;
      return data;
    } catch (err) {
      log.warn('Error fetching health summary', err);
      return null;
    }
  }

  getLocalTelemetry() {
    return safeClient.getTelemetry() || {
      lastValidation: null,
      recentFailures: [],
      stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 }
    };
  }

  getLocalCacheInfo() {
    return safeClient.getCacheInfo() || {
      expiration: null,
      size: 0
    };
  }
}

/** email Health Repository. */
export const emailHealthRepository = new EmailHealthRepository();
