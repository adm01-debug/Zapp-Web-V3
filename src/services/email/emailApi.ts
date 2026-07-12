import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';

// Tables that exist in the DB but not in the generated types use this untyped client.
const dynSupabase = supabase as unknown as SupabaseClient;

export interface EmailRevalidationJob {
  id: string;
  status: string;
  requested_at: string;
  requested_by: string | null;
  result: Record<string, unknown> | null;
}

export interface EmailHealthSummary {
  id: string;
  status: string | null;
  last_validation: string | null;
  failure_count_60m: number | null;
}

export const emailApi = {
  getAuditLogs: async (
    from: number,
    to: number,
    filters?: { status?: string; dateFrom?: string; dateTo?: string }
  ) => {
    let query = dynSupabase.from('email_revalidation_jobs').select('*', { count: 'exact' });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.dateFrom) {
      query = query.gte('requested_at', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('requested_at', filters.dateTo);
    }

    const { data, count, error } = await query
      .order('requested_at', { ascending: false })
      .range(from, to);

    return { data: data as unknown as EmailRevalidationJob[] | null, count, error };
  },
  getHealthSummary: async () => {
    const { data: rows, error } = await safeClient.from<EmailHealthSummary>(
      'email_health_summary',
      (q) => q.select('*').eq('id', 'current').limit(1)
    );
    return { data: rows?.[0] ?? null, error };
  },

  markThreadRead: async (threadId: string, read: boolean) => {
    return await safeClient.rpc('rpc_email_mark_thread_read', {
      p_thread_id: threadId,
      p_read: read,
    });
  },

  getTokenStatus: async () => {
    return await safeClient.rpc('rpc_email_token_status');
  },

  retryJob: async (jobId: string) => {
    const { data: jobRows } = await safeClient.from<EmailRevalidationJob>(
      'email_revalidation_jobs',
      (q) => q.select('*').eq('id', jobId).limit(1)
    );
    const job = jobRows?.[0] ?? null;

    if (!job) throw new Error('Job não encontrado');

    return await safeClient.from<EmailRevalidationJob>('email_revalidation_jobs', (q) =>
      q.insert({
        status: 'pending',
        requested_by: job.requested_by,
        result: { retry_of: jobId },
      })
    );
  },
};
