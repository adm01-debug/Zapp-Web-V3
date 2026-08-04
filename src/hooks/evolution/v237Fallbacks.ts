import { getLogger } from '@/lib/logger';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

const logV237 = getLogger('EvolutionV237');

/** Untyped client: RPCs (rpc_list_*) são registradas fora do schema tipado; widening intencional. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as SupabaseClient<any>;

/** Hook: is Endpoint Unavailable. */
export function isEndpointUnavailable(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number }).status;
  if (status === 404 || status === 405 || status === 501) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /not\s*found|not\s*implemented|method\s+not\s+allowed|404|405|501/i.test(msg);
}

/** Hook: with V237 Fallback. */
export async function withV237Fallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  label: string
): Promise<T> {
  try {
    const result = await primary();
    if (result && typeof result === 'object') {
      const wrapped = result as { error?: unknown; status?: number };
      if (isEndpointUnavailable(wrapped) || wrapped.error === 'not_found') {
        logV237.warn(`[${label}] primary returned not-found payload; using Evolution DB fallback`);
        return await fallback();
      }
    }
    return result;
  } catch (err) {
    if (isEndpointUnavailable(err)) {
      logV237.warn(`[${label}] primary failed (${(err as Error)?.message}); falling back to Evolution DB`);
      return await fallback();
    }
    throw err;
  }
}

/** Hook: fallback Find Chats. */
export async function fallbackFindChats(instanceName: string, limit = 200): Promise<unknown[]> {
  const { data, error } = await db.rpc('rpc_list_conversations', {
    p_instance: instanceName,
    p_status: null,
    p_assigned_to: null,
    p_limit: limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Hook: fallback Find Contacts. */
export async function fallbackFindContacts(instanceName: string, limit = 500): Promise<unknown[]> {
  const { data, error } = await db.rpc('rpc_list_contacts', {
    p_instance: instanceName,
    p_lead_status: null,
    p_assigned_to: null,
    p_search: null,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/** Hook: fallback Fetch Profile. */
export async function fallbackFetchProfile(
  remoteJid: string,
  instanceName: string
): Promise<unknown | null> {
  const { data, error } = await db.rpc('rpc_get_contact', {
    p_remote_jid: remoteJid,
    p_instance: instanceName,
  });
  if (error) throw error;
  return data ?? null;
}