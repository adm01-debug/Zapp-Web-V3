import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const _log = getLogger('auditLog');

export function logAuditEvent(payload: {
  user_id: string | undefined;
  action: string;
  entity_type: string;
  details: Record<string, unknown>;
}) {
  void supabase
    .from('audit_logs')
    .insert(payload)
    .then(({ error }) => {
      if (error)
        _log.warn('Failed to insert audit log', { action: payload.action, error: error.message });
    });
}
