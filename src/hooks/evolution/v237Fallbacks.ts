import { getLogger } from '@/lib/logger';
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';

const logV237 = getLogger('EvolutionV237');

export function isEndpointUnavailable(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number }).status;
  if (status === 404 || status === 405 || status === 501) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /not\s*found|not\s*implemented|method\s+not\s+allowed|404|405|501/i.test(msg);
}

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
        logV237.warn(`[${label}] primary returned not-found payload; using FATOR X fallback`);
        return await fallback();
      }
    }
    return result;
  } catch (err) {
    if (isEndpointUnavailable(err)) {
      logV237.warn(`[${label}] primary failed (${(err as Error)?.message}); falling back to FATOR X`);
      return await fallback();
    }
    throw err;
  }
}

function ensureExternal() {
  if (!isExternalConfigured || !externalSupabase) {
    throw new Error('FATOR X external client is not configured');
  }
  return externalSupabase;
}

function callExternalRpc(
  client: ReturnType<typeof ensureExternal>,
  fn: string,
  args: Record<string, unknown>
) {
  return (client as unknown as { rpc: typeof client.rpc }).rpc(fn, args);
}

export async function fallbackFindChats(instanceName: string, limit = 200): Promise<unknown[]> {
  const client = ensureExternal();
  const { data, error } = await callExternalRpc(client, 'rpc_list_conversations', {
    p_instance: instanceName,
    p_status: null,
    p_assigned_to: null,
    p_limit: limit,
  });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function fallbackFindContacts(instanceName: string, limit = 500): Promise<unknown[]> {
  const client = ensureExternal();
  const { data, error } = await callExternalRpc(client, 'rpc_list_contacts', {
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

export async function fallbackFetchProfile(
  remoteJid: string,
  instanceName: string
): Promise<unknown | null> {
  const client = ensureExternal();
  const { data, error } = await callExternalRpc(client, 'rpc_get_contact', {
    p_remote_jid: remoteJid,
    p_instance: instanceName,
  });
  if (error) throw error;
  return data ?? null;
}
