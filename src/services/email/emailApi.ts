import { supabase } from '@/integrations/supabase/client';

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
    let query = (supabase as any).from('email_revalidation_jobs').select('*', { count: 'exact' });

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

    return { data: data as EmailRevalidationJob[] | null, count, error };
  },
  getHealthSummary: async () => {
    const { data, error } = await (supabase as any)
      .from('email_health_summary')
      .select('*')
      .eq('id', 'current')
      .maybeSingle();

    return { data: data as EmailHealthSummary | null, error };
  },
  markThreadRead: async (threadId: string, read: boolean) => {
    return await (supabase as any).rpc('rpc_email_mark_thread_read', {
      p_thread_id: threadId,
      p_read: read
    });
  },
  getTokenStatus: async () => {
    return await (supabase as any).rpc('rpc_email_token_status');
  },
  retryJob: async (jobId: string) => {
    const { data: job } = await (supabase as any)
      .from('email_revalidation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (!job) throw new Error('Job não encontrado');

    return await (supabase as any)
      .from('email_revalidation_jobs')
      .insert({
        status: 'pending',
        requested_by: job.requested_by,
        result: { retry_of: jobId }
      });
  }
};
