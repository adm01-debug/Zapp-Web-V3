import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

interface CacheEntry { value: string; ts: number; }
const vaultCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60000;

/** vault utilities and exports. */
export async function getSecret(name: string, opts: { skipEnv?: boolean } = {}): Promise<string | null> {
  const envName = name.toUpperCase();
  const envValue = Deno.env.get(envName);
  if (envValue && !opts.skipEnv) return envValue;

  const cached = vaultCache.get(name);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.value;

  try {
    const url = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'));
    const svc = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    if (!url || !svc) return null;
    const admin = createClient(url, svc, { db: { schema: "zapp" }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc('fn_get_vault_secret', { p_name: name });
    if (error || !data) return null;
    if (typeof data === 'string' && data.startsWith('PLACEHOLDER_')) {
      console.warn(`[vault] ${name} returned PLACEHOLDER value — substituir antes de uso em produção`);
      return null;
    }
    vaultCache.set(name, { value: data, ts: Date.now() });
    return data;
  } catch (e) {
    console.error(`[vault] error reading ${name}:`, e);
    return null;
  }
}
