/**
 * Resolves which edge function should receive a "send" call:
 *  - `evolution-api`        for Evolution / Baileys connections (default)
 *  - `whatsapp-cloud-api`   for WhatsApp Cloud API (Meta) connections
 *
 * A conexão é "official" quando existe uma linha em
 * `whatsapp_official_credentials` apontando para o `connection_id`. Caso
 * contrário, roteamos para Evolution (Baileys). Resultado é cacheado por 60s.
 *
 * Este é o ÚNICO ponto que conhece o split cloud/baileys. Inbox, hooks e
 * senders permanecem agnósticos.
 *
 * Nota: as colunas `instance_name` e `api_type` NÃO existem em
 * `whatsapp_connections`. O lookup é feito por `name` (canônico) com fallback
 * para `instance_id` — ver `columnMap.whatsapp_connections`.
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
    // Two sequential exact queries evitam PostgREST filter injection quando
    // instanceName contém caracteres reservados de `.or()`.
    let { data: conn, error } = await supabase
      .from('whatsapp_connections')
      .select('id, status')
      .eq('name', instanceName)
      .maybeSingle();

    if (!conn && !error) {
      ({ data: conn, error } = await supabase
        .from('whatsapp_connections')
        .select('id, status')
        .eq('instance_id', instanceName)
        .maybeSingle());
    }

    if (error || !conn) {
      // Não cacheia em erro — próxima chamada tenta novamente.
      return 'evolution-api';
    }

    const { data: official } = await supabase
      .from('whatsapp_official_credentials')
      .select('id')
      .eq('connection_id', conn.id)
      .maybeSingle();

    const fn: FnName = official ? 'whatsapp-cloud-api' : 'evolution-api';
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
