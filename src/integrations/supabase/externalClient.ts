/**
 * External Supabase Client — FATOR X (Self-hosted VPS)
 *
 * HISTÓRICO: este client apontava para um Supabase "externo" separado.
 * Após a consolidação single-database (v6.x), o domínio `evolution_*`
 * vive no MESMO Supabase self-hosted do client principal
 * (`@/integrations/supabase/client` → https://supabase.atomicabr.com.br).
 *
 * COMPORTAMENTO (FATOR X v6.1):
 *  - Se `VITE_EXTERNAL_SUPABASE_URL/ANON_KEY` estiverem definidas, cria um
 *    client dedicado (compat com ambientes que ainda separam os bancos).
 *  - Se NÃO estiverem (caso do deploy Vercel), reutiliza o client principal
 *    AUTENTICADO — as RPCs do domínio são SECURITY DEFINER com EXECUTE
 *    exclusivo para `authenticated`/`service_role` (anon foi revogado).
 *
 * Isso elimina a classe de erros "[datasource] cliente external indisponível"
 * causada por env vars ausentes no build.
 *
 * ES MODULE LIVE BINDINGS
 * -----------------------
 * `isExternalConfigured` and `externalSupabase` are exported as `let` so
 * `updateRuntimeExternalConfig` can mutate them. ES module import bindings
 * are LIVE — importers automatically see the updated value without re-importing.
 * This is correct by design; it is NOT the same as a mutable global object in CJS.
 * Prefer the getter functions (getExternalSupabase, getIsExternalConfigured) in
 * new code for cleaner dependency inversion and easier testing.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ExtendedDatabase } from './types-manual';
import { supabase } from './client';
import { cookieStorage } from './cookieStorage';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalClient');

const APP_ENV = (import.meta.env.VITE_APP_ENV || 'production') as
  'development' | 'staging' | 'production';

const getEnvConfig = () => {
  switch (APP_ENV) {
    case 'development':
      return {
        url:
          import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_URL ||
          import.meta.env.VITE_EXTERNAL_SUPABASE_URL,
        key:
          import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_ANON_KEY ||
          import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY,
      };
    case 'staging':
      return {
        url:
          import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_URL ||
          import.meta.env.VITE_EXTERNAL_SUPABASE_URL,
        key:
          import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_ANON_KEY ||
          import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY,
      };
    default:
      return {
        url: import.meta.env.VITE_EXTERNAL_SUPABASE_URL,
        key: import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY,
      };
  }
};

const config = getEnvConfig();
let EXTERNAL_URL = config.url;
let EXTERNAL_ANON_KEY = config.key;

export let isExternalConfigured = Boolean(EXTERNAL_URL && EXTERNAL_ANON_KEY);

export function getIsExternalConfigured(): boolean {
  return isExternalConfigured;
}

export let externalSupabase: SupabaseClient<ExtendedDatabase> = isExternalConfigured
  ? createClient<ExtendedDatabase>(EXTERNAL_URL!, EXTERNAL_ANON_KEY!, {
      auth: {
        storage: cookieStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'sb-external-auth-token',
      },
      global: {
        headers: {
          'x-client-info': 'zapp-web-external-client',
        },
      },
    })
  : supabase;

if (!isExternalConfigured) {
  log.debug(
    'VITE_EXTERNAL_* ausentes — usando o client principal autenticado (single-database FATOR X).'
  );
}

export function updateRuntimeExternalConfig(url: string, key: string) {
  if (!url || !key) return;

  EXTERNAL_URL = url;
  EXTERNAL_ANON_KEY = key;
  isExternalConfigured = true;

  externalSupabase = createClient<ExtendedDatabase>(url, key, {
    auth: {
      storage: cookieStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'sb-external-auth-token',
    },
    global: {
      headers: {
        'x-client-info': 'zapp-web-external-client-runtime',
      },
    },
  });

  log.info('Runtime config updated successfully');
}

export function getExternalSupabase(): SupabaseClient<ExtendedDatabase> {
  return externalSupabase;
}

/**
 * Call an RPC function that exists only in the external (FATOR X) DB schema and
 * therefore is not present in the generated ExtendedDatabase.Functions types.
 * Centralises the type narrowing so callers stay cast-free.
 */
export function callExtRpc(
  client: SupabaseClient<ExtendedDatabase>,
  fn: string,
  args: Record<string, unknown>
): Promise<{ data: unknown; error: { message: string } | null }> {
  interface RpcClient {
    rpc(
      name: string,
      params?: Record<string, unknown>
    ): Promise<{ data: unknown; error: { message: string } | null }>;
  }
  const rpcClient = client as unknown as RpcClient;
  return rpcClient.rpc(fn, args);
}
