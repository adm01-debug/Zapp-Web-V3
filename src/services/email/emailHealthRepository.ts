
import { safeClient } from '@/integrations/supabase/safeClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('EmailHealthRepository');

export class EmailHealthRepository {
  async getRemoteSummary() {
    try {
      const { data, error } = await safeClient.rpc('rpc_get_email_health_summary');
      if (error) throw error;
      return data;
    } catch (err) {
      log.warn('Error fetching health summary', err);
      return null;
    }
  }

  getLocalTelemetry() {
    return (safeClient as any).getTelemetry?.() || {
      lastValidation: null,
      recentFailures: [],
      stats: { totalCalls: 0, failedCalls: 0, cacheHits: 0 }
    };
  }

  getLocalCacheInfo() {
    return (safeClient as any).getCacheInfo?.() || {
      expiration: null,
      size: 0
    };
  }

  async forceRevalidation(resources: string[]) {
    if ((safeClient as any).clearCache) {
      (safeClient as any).clearCache('email_');
      (safeClient as any).clearCache('rpc_email_');
    }
    
    for (const res of resources) {
      await safeClient.validateResource(res, res.startsWith('rpc_') ? 'function' : 'table');
    }
  }
}
