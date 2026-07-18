/**
 * Resolves which edge function should receive a "send" call:
 *  - `evolution-api`        for Evolution / Baileys connections (default)
 *  - `whatsapp-cloud-api`   for WhatsApp Cloud API (Meta) connections
 *
 * Routing is based on the `api_type` column of `whatsapp_connections`.
 * First lookup is by `name` (canonical), with fallback to `instance_id`.
 * Result is cached for 60 seconds.
 *
 * This is the ONLY place that knows about the cloud/baileys split.
 * Inbox, hooks, and senders remain agnostic.
 */
import { supabase } from '@/integrations/supabase/client';

type FnName = 'evolution-api' | 'whatsapp-cloud-api';

interface CacheEntry {
  fn: FnName;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

function toFnName(apiType: string | null | undefined): FnName {
  return apiType === 'official' ? 'whatsapp-cloud-api' : 'evolution-api';
}

export async function resolveSendFunction(
  instanceName: string | undefined | null,
): Promise<FnName> {
  if (!instanceName) return 'evolution-api';

  const cached = cache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) return cached.fn;

  try {
    let { data: conn, error } = await supabase
      .from('whatsapp_connections')
      .select('api_type, status')
      .eq('name', instanceName)
      .maybeSingle();

    if (!conn && !error) {
      ({ data: conn, error } = await supabase
        .from('whatsapp_connections')
        .select('api_type, status')
        .eq('instance_id', instanceName)
        .maybeSingle());
    }

    if (error || !conn) {
      return 'evolution-api';
    }

    const fn = toFnName((conn as { api_type?: string | null }).api_type);
    cache.set(instanceName, { fn, expiresAt: Date.now() + TTL_MS });
    return fn;
  } catch {
    return 'evolution-api';
  }
}

/** Test/debug helper. */
export function clearSendFunctionCache() {
  cache.clear();
}
