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
import { unwrapRow } from '@/lib/supabase-helpers';

type FnName = 'evolution-api' | 'whatsapp-cloud-api';

interface WhatsappConnectionRow {
  id: string | null;
  api_type: string | null;
  status: string | null;
}

interface CacheEntry {
  fn: FnName;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

// Cast único para contornar drift de tipos entre types.ts e o schema `zapp`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

export async function resolveSendFunction(
  instanceName: string | undefined | null,
): Promise<FnName> {
  if (!instanceName) return 'evolution-api';

  const cached = cache.get(instanceName);
  if (cached && cached.expiresAt > Date.now()) return cached.fn;

  try {
    // Primeira tentativa: buscar por name
    let { data, error } = await db
      .from('whatsapp_connections')
      .select('id, api_type, status')
      .eq('name', instanceName)
      .maybeSingle();

    // Fallback: buscar por instance_id
    if (!data && !error) {
      ({ data, error } = await db
        .from('whatsapp_connections')
        .select('id, api_type, status')
        .eq('instance_id', instanceName)
        .maybeSingle());
    }

    const conn = unwrapRow<WhatsappConnectionRow>(data);
    if (error || !conn) {
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
