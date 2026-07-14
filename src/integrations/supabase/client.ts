import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import type { ExtendedDatabase } from './types-manual';
import { getLogger } from '@/lib/logger';
import { cookieStorage } from './cookieStorage';

const log = getLogger('supabase-client');

// Re-export so callers that need the specific type can use it
export type { Database, ExtendedDatabase };

// ---------------------------------------------------------------------------
// Self-hosted production Supabase (AtomicaBR VPS)
// This is the authoritative backend for the ZAPP Web platform.
// The anon key is intentionally public — all data access is enforced by RLS.
// DO NOT replace with a Lovable Cloud project: the real data lives here.
// ---------------------------------------------------------------------------
const SELF_HOSTED_URL = 'https://supabase.atomicabr.com.br';
const SELF_HOSTED_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ewogICJyb2xlIjogImFub24iLAogICJpc3MiOiAic3VwYWJhc2UiLAogICJpYXQiOiAxNzE1MDUwODAwLAogICJleHAiOiAxODcyODE3MjAwCn0.rvamc0XHuSCYB1glBwOCCxgfd9yxWVYLnhFzg5-7TRk';

// ---------------------------------------------------------------------------
// Hardened configuration detection
// ---------------------------------------------------------------------------
const PLACEHOLDER_TOKENS = new Set([
  'undefined',
  'null',
  'missing-anon-key',
  'your-anon-key',
  'your-project-url',
  'your-supabase-url',
  'your-supabase-anon-key',
  'your_supabase_url',
  'your_supabase_anon_key',
  'changeme',
  'todo',
]);
const SENTINEL_HOST = 'supabase-unconfigured.invalid';

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function isPlaceholder(value: string): boolean {
  return value.length === 0 || PLACEHOLDER_TOKENS.has(value.toLowerCase());
}
function isValidSupabaseUrl(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  if (v.toLowerCase().includes(SENTINEL_HOST)) return false;
  return /^https?:\/\/[^\s]+$/i.test(v);
}
function isValidSupabaseKey(value: unknown): boolean {
  const v = normalize(value);
  if (isPlaceholder(v)) return false;
  return v.length >= 20;
}

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isLovableCloudUrl = typeof envUrl === 'string' && envUrl.includes('.supabase.co');

const SUPABASE_URL = !isLovableCloudUrl && isValidSupabaseUrl(envUrl) ? envUrl : SELF_HOSTED_URL;

const SUPABASE_ANON_KEY =
  SUPABASE_URL === SELF_HOSTED_URL
    ? SELF_HOSTED_ANON_KEY
    : isValidSupabaseKey(envKey)
      ? envKey
      : SELF_HOSTED_ANON_KEY;

export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);

let warnedUnconfigured = false;
export function warnSupabaseUnconfigured(context?: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  log.warn(
    '[Supabase] Modo degradado: cliente não configurado' +
      (context ? ` (origem: ${context})` : '') +
      '. Chamadas de rede desativadas.'
  );
}

if (!isSupabaseConfigured) {
  log.error(
    '[Supabase] URL ou chave inválida — verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  );
} else {
  // Warn in any environment when falling back to hardcoded credentials.
  // The anon key is intentionally public per Supabase's model, but having it
  // hardcoded in source control means it has been published and should be rotated.
  // Action: set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in the deploy env and
  // rotate the self-hosted anon key via `supabase gen secret` after deploy.
  if (!isValidSupabaseUrl(envUrl) || !isValidSupabaseKey(envKey)) {
    log.warn(
      '[Supabase] ATENÇÃO: usando credenciais hardcoded (fallback). ' +
        'Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de deploy ' +
        'e rotacione a anon key para remover a exposição do source control.'
    );
  } else if (import.meta.env.DEV) {
    log.warn(
      `[Supabase] Conectado: ${SUPABASE_URL === SELF_HOSTED_URL ? 'self-hosted (AtomicaBR)' : SUPABASE_URL}`
    );
  }
}

const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://supabase-unconfigured.invalid';
const supabaseAnonKey = isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing-anon-key';

const realtimeReconnectAfterMs = (tries: number): number =>
  Math.min(1000 * 2 ** Math.max(0, tries - 1), 30000);

export const supabase = createClient<ExtendedDatabase>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: cookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    reconnectAfterMs: realtimeReconnectAfterMs,
  },
});

if (!isSupabaseConfigured) {
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = ((name: string, opts?: Parameters<typeof originalChannel>[1]) => {
    warnSupabaseUnconfigured('realtime');
    const channel = originalChannel(name, opts);
    channel.subscribe = (() => channel) as typeof channel.subscribe;
    return channel;
  }) as typeof supabase.channel;
}

export const SUPABASE_RESOLVED_URL = supabaseUrl;
export const SUPABASE_RESOLVED_ANON_KEY = supabaseAnonKey;
