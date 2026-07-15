// @ts-nocheck
/**
 * Resolves which edge function should receive a "send" call:
 *  - `evolution-api`        for Evolution / Baileys connections (default)
 *  - `whatsapp-cloud-api`   for WhatsApp Cloud API (Meta) connections
 *
 * Lê `api_type` da tabela `whatsapp_connections` (coluna adicionada).
 * Quando api_type === 'official' → whatsapp-cloud-api, caso contrário → evolution-api.
 * Resultado é cacheado por 60s.
 */
import { supabase } from '@/integrations/supabase/client';

type FnName = 'evolution-api' | 'whatsapp-cloud-api';

interface CacheEntry {
  fn: FnName;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function resolveSendFunction(
  instanceName: string | undefined | null,
): Promise<FnName> {
  if (!instanceName) return 'evolution-api';

  const cached = cache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) return cached.fn;

  try {
    // Primeira tentativa: buscar por instance_name
    let { data: conn, error } = await supabase
      .from('whatsapp_connections')
      .select('id, api_type, status')
      .eq('name', instanceName)
      .maybeSingle();

    // Fallback: buscar por instance_id
    if (!conn && !error) {
      ({ data: conn, error } = await supabase
        .from('whatsapp_connections')
        .select('id, api_type, status')
        .eq('instance_id', instanceName)
        .maybeSingle());
    }

    if (error || !conn) {
      // Não cacheia em erro — próxima chamada tenta novamente
      return 'evolution-api';
    }

    const fn: FnName = conn.api_type === 'official' ? 'whatsapp-cloud-api' : 'evolution-api';
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