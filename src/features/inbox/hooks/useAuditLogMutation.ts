import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/schema';
import { getLogger } from '@/lib/logger';

const _log = getLogger('auditLog');

export function logAuditEvent(payload: {
  user_id: string | undefined;
  action: string;
  entity_type: string;
  details: Json;
}) {
  void supabase
    .from('audit_logs')
    .insert(payload)
    .then(({ error }) => {
      if (error)
        _log.warn('Failed to insert audit log', { action: payload.action, error: error.message });
    })
    .catch((err: unknown) => {
      // Falha de rede/timeout rejeita a promise — sem este handler vira
      // unhandled promise rejection a cada mutação auditable.
      _log.warn('Failed to insert audit log (rejeição)', {
        action: payload.action,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}
