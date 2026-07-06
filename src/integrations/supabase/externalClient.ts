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
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './client';
import { createLogger } from '@/lib/logger';

const log = createLogger('externalClient');

const APP_ENV = (import.meta.env.VITE_APP_ENV || 'production') as 'development' | 'staging' | 'production';

const getEnvConfig = () => {
  switch (APP_ENV) {
    case 'development':
      return {
        url: import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_EXTERNAL_SUPABASE_URL,
        key: import.meta.env.VITE_DEV_EXTERNAL_SUPABASE_ANON_KEY || import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY,
      };
    case 'staging':
      return {
        url: import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_EXTERNAL_SUPABASE_URL,
        key: import.meta.env.VITE_STAGING_EXTERNAL_SUPABASE_ANON_KEY || import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY,
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

/**
 * Nunca é `null`: cai para o client principal autenticado quando as envs
 * dedicadas não existem (mesmo banco após a consolidação single-database).
 */
export let externalSupabase: SupabaseClient = isExternalConfigured
  ? createClient(EXTERNAL_URL!, EXTERNAL_ANON_KEY!, {
      auth: {
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
  : (supabase as unknown as SupabaseClient);

if (!isExternalConfigured) {
  // Expected in production (single-database FATOR X): VITE_EXTERNAL_* are not
  // set; the main authenticated client is reused. Not an error — use debug level
  // to avoid polluting the console on every production session.
  log.debug(
    'VITE_EXTERNAL_* ausentes — usando o client principal autenticado (single-database FATOR X).',
  );
}

/**
 * Updates the external client at runtime.
 * Useful when credentials are changed in the Admin Connections UI
 * without needing a full redeploy.
 */
export function updateRuntimeExternalConfig(url: string, key: string) {
  if (!url || !key) return;

  EXTERNAL_URL = url;
  EXTERNAL_ANON_KEY = key;
  isExternalConfigured = true;

  // Re-create the client instance
  externalSupabase = createClient(url, key, {
    auth: {
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

export function getExternalSupabase(): SupabaseClient {
  return externalSupabase;
}
