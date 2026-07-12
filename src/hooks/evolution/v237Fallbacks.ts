/**
 * v2.3.7 fallbacks — workaround para endpoints quebrados na Evolution API.
 *
 * Em v2.3.7 alguns endpoints retornam 404/500 mesmo quando a instância está
 * conectada. O blueprint v2 do projeto manda detectar e cair para o FATOR X
 * (`evolution_*` no banco externo) automaticamente, sem que o consumidor
 * precise saber.
 *
 * Cobre:
 *  - find-chats        → rpc_list_conversations
 *  - find-contacts     → rpc_list_contacts
 *  - fetch-profile     → rpc_get_contact + evolution_contacts.profile_pic_url
 */
import { externalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { getLogger } from '@/lib/logger';

const log = getLogger('EvolutionV237');

function isEndpointUnavailable(err: unknown): boolean {
  if (!err) return false;
  const status = (err as { status?: number }).status;
  if (status === 404 || status === 405 || status === 501) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /not\s*found|not\s*implemented|method\s+not\s+allowed|404|405|501/i.test(msg);
}

/** Exposed for tests and callers that need to know if a 404-like error happened. */
export { isEndpointUnavailable };

/**
 * Wrap a primary call with an automatic FATOR X fallback. Whenever the
 * primary throws or returns an explicit "endpoint unavailable" payload, the
 * fallback is invoked. All other errors propagate normally.
 */
export async function withV237Fallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  label: string
): Promise<T> {
  try {
    const result = await primary();
    // Some Evolution proxies wrap 404 into payload `{ error: 'not_found' }`.
    if (result && typeof result === 'object') {
      const wrapped = result as { error?: unknown; status?: number };
      if (isEndpointUnavailable(wrapped) || wrapped.error === 'not_found') {
        log.warn(`[${label}] primary returned not-found payload; using FATOR X fallback`);
        return await fallback();
      }
    }
    return result;
  } catch (err) {
    if (isEndpointUnavailable(err)) {
      log.warn(`[${label}] primary failed (${(err as Error)?.message}); falling back to FATOR X`);
      return await fallback();
    }
    throw err;
  }
}

// ─── Specific fallbacks ─────────────────────────────────────────────────────

function ensureExternal() {
  if (!isExternalConfigured || !externalSupabase) {
    throw new Error('FATOR X external client is not configured');
  }
  return externalSupabase;
}

/** Call an RPC function not present in the generated external-client types. */
function callExternalRpc(
  client: ReturnType<typeof ensureExternal>,
  fn: string,
  args: Record<string, unknown>
) {
  return (client as unknown as { rpc: typeof client.rpc }).rpc(fn, args); // ignore-audit — rpc not in generated types for evolution client; shape is identical at runtime
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
