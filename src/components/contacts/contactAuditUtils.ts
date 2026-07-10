/**
 * contactAuditUtils.ts
 * Shared DynQuery helper for the contact_audit_log table.
 *
 * contact_audit_log is not in the Supabase generated types, so we use
 * the DynQuery pattern: a typed interface + a factory that casts supabase
 * just once, keeping the `as unknown as {…}` in a single place.
 */
import { supabase } from '@/integrations/supabase/client';

export interface AuditQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select(cols: string): AuditQuery;
  eq(col: string, val: unknown): AuditQuery;
  order(col: string, opts: { ascending: boolean }): AuditQuery;
  limit(n: number): AuditQuery;
}

export const contactAuditFrom = (): AuditQuery =>
  (supabase as unknown as { from: (t: string) => AuditQuery }).from('contact_audit_log');
