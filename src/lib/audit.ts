import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { isValidUUID } from '@/utils/uuid';

const log = getLogger('Audit');

export type AuditAction =
  | 'login'
  | 'logout'
  | 'message_sent'
  | 'message_received'
  | 'contact_created'
  | 'contact_updated'
  | 'connection_created'
  | 'connection_deleted'
  | 'call_started'
  | 'call_ended'
  | 'transfer'
  | 'settings_changed'
  | 'scope_change';

interface AuditLogParams {
  action: AuditAction | string;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}

/** Split entityId into a UUID-safe value + a text fallback merged into details. */
export function normalizeEntityId(
  entityId: string | null | undefined,
  details?: Record<string, unknown>
): { entityId: string | null; details: Record<string, unknown> | null } {
  const trimmed = typeof entityId === 'string' ? entityId.trim() : '';
  if (!trimmed) return { entityId: null, details: details ?? null };
  if (isValidUUID(trimmed)) return { entityId: trimmed, details: details ?? null };
  return {
    entityId: null,
    details: { ...(details ?? {}), entity_id_text: trimmed },
  };
}

export async function logAudit({ action, entityType, entityId, details }: AuditLogParams) {
  try {
    const norm = normalizeEntityId(entityId ?? null, details);
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      p_entity_type: entityType || null,
      p_entity_id: norm.entityId,
      p_details: norm.details ? JSON.parse(JSON.stringify(norm.details)) : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });

    if (error) {
      log.warn('Failed to log audit:', error.message);
    }
  } catch (err: unknown) {
    log.warn('Audit log error:', err instanceof Error ? err.message : 'unknown');
  }
}