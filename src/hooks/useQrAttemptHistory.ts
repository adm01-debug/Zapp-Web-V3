import { supabase } from '@/integrations/supabase/client';

export interface QrAttemptRow {
  id: string;
  status: 'pending' | 'connected' | 'expired' | 'error';
  created_at: string;
  connected_at: string | null;
  expired_at: string | null;
  error_message: string | null;
}

export async function fetchQrAttemptHistory(
  connectionId: string,
  limit: number,
): Promise<QrAttemptRow[]> {
  const { data, error } = await supabase
    .from('qr_attempts')
    .select('id,status,created_at,connected_at,expired_at,error_message')
    .eq('connection_id', connectionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as QrAttemptRow[];
}
