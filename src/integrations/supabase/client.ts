import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

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
// A raw `Boolean(url && key)` check is not enough: a whitespace-only value, a
// leftover placeholder ("your-anon-key", "missing-anon-key") or the internal
// fallback sentinel would all pass as "configured" and then blow up at runtime
// with ERR_NAME_NOT_RESOLVED / 401. We normalise and reject those here.
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
  return v.length >= 20; // anon JWT / publishable keys are always long
}

// ---------------------------------------------------------------------------
// URL and key resolution
// Priority order:
//   1. VITE_SUPABASE_URL env var that points to self-hosted (non-cloud)
//   2. Self-hosted default (SELF_HOSTED_URL above)
//   3. Lovable-managed Cloud Supabase (*.supabase.co) → REJECTED, use self-hosted
//
// Lovable auto-injects VITE_SUPABASE_URL → *.supabase.co during its build.
// We detect this and override with self-hosted so all data flows to the VPS.
// ---------------------------------------------------------------------------
const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Detect Lovable-managed Cloud Supabase auto-injection
const isLovableCloudUrl = typeof envUrl === 'string' && envUrl.includes('.supabase.co');

// Final URL: use env var only when it's a custom self-hosted URL (not .supabase.co)
const SUPABASE_URL = !isLovableCloudUrl && isValidSupabaseUrl(envUrl) ? envUrl : SELF_HOSTED_URL;

// Final key: always use self-hosted key when connected to self-hosted URL
// (Lovable's publishable key is bound to its own Cloud project and would fail here)
const SUPABASE_ANON_KEY =
  SUPABASE_URL === SELF_HOSTED_URL
    ? SELF_HOSTED_ANON_KEY
    : isValidSupabaseKey(envKey)
      ? envKey
      : SELF_HOSTED_ANON_KEY;

/**
 * Single source of truth: `true` only when both URL and key look like real values.
 * The self-hosted URL and key are always valid, so this will always be true in production.
 */
export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);

// One-time, consolidated warning helper for consumers that short-circuit while
// unconfigured. Guarded so the console shows the reason at most once.
let warnedUnconfigured = false;
export function warnSupabaseUnconfigured(context?: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn(
    '[Supabase] Modo degradado: cliente não configurado' +
      (context ? ` (origem: ${context})` : '') +
      '. Chamadas de rede desativadas.'
  );
}

// Module-load diagnostic
if (!isSupabaseConfigured) {
  console.error(
    '[Supabase] URL ou chave inválida — verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.'
  );
} else if (import.meta.env.DEV) {
  console.warn(
    `[Supabase] Conectado: ${SUPABASE_URL === SELF_HOSTED_URL ? 'self-hosted (AtomicaBR)' : SUPABASE_URL}`
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

const supabaseUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://supabase-unconfigured.invalid';
const supabaseAnonKey = isSupabaseConfigured ? SUPABASE_ANON_KEY : 'missing-anon-key';

const getSupabaseStorage = () => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

// Capped exponential backoff for realtime reconnects: 1s, 2s, 4s, 8s, 16s,
// then held at 30s. Prevents a flaky/unreachable realtime endpoint from
// reconnecting in a tight loop and flooding the console.
const realtimeReconnectAfterMs = (tries: number): number =>
  Math.min(1000 * 2 ** Math.max(0, tries - 1), 30000);

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getSupabaseStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  realtime: {
    reconnectAfterMs: realtimeReconnectAfterMs,
  },
});

// ---------------------------------------------------------------------------
// Systemic realtime guard (single choke point)
// ---------------------------------------------------------------------------
// When unconfigured, neutralise `subscribe` to prevent WebSocket reconnect loops.
if (!isSupabaseConfigured) {
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = ((name: string, opts?: Parameters<typeof originalChannel>[1]) => {
    warnSupabaseUnconfigured('realtime');
    const channel = originalChannel(name, opts);
    channel.subscribe = (() => channel) as typeof channel.subscribe;
    return channel;
  }) as typeof supabase.channel;
}

// ---------------------------------------------------------------------------
// Resolved connection constants (read-only)
// ---------------------------------------------------------------------------
// Consumidos por integration clients (ex.: zappweb/evolutionClient) que
// precisam chamar Edge Functions com a MESMA URL/anon key que este módulo
// resolveu — sem duplicar a lógica de resolução acima (fonte única).
// Adição 2026-07-06 (integração full front↔Evolution via edge fn).
export const SUPABASE_RESOLVED_URL = supabaseUrl;
export const SUPABASE_RESOLVED_ANON_KEY = supabaseAnonKey;
