import { supabase } from '@/integrations/supabase/client';

export function logAuditEvent(payload: {
  user_id: string | undefined;
  action: string;
  entity_type: string;
  details: Record<string, unknown>;
}) {
  void supabase.from('audit_logs').insert(payload);
}
