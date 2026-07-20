import { supabase } from '@/integrations/supabase/client';

export interface RateLimitRule {
  id: string;
  name: string;
  endpoint: string;
  max_requests: number;
  window_seconds: number;
  is_active: boolean;
  action: 'block' | 'throttle' | 'alert';
}

export async function fetchRateLimitConfigs(): Promise<RateLimitRule[]> {
  const { data, error } = await supabase
    .from('rate_limit_configs')
    .select('*')
    .order('created_at', { ascending: true });
  if (error || !data || data.length === 0) return [];
  return data.map((r) => ({
    id: r.id,
    name: r.name || r.endpoint_pattern,
    endpoint: r.endpoint_pattern,
    max_requests: r.max_requests,
    window_seconds: r.window_seconds,
    is_active: r.is_active ?? true,
    action: 'block' as RateLimitRule['action'],
  }));
}

export async function saveRateLimitConfigs(rules: RateLimitRule[]): Promise<void> {
  await supabase
    .from('rate_limit_configs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  const toInsert = rules.map((r) => ({
    name: r.name,
    endpoint_pattern: r.endpoint,
    max_requests: r.max_requests,
    window_seconds: r.window_seconds,
    block_duration_minutes: 15,
    is_active: r.is_active,
  }));

  const { error } = await supabase.from('rate_limit_configs').insert(toInsert);
  if (error) throw error;
}
