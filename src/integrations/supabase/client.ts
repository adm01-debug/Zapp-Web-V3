import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// ---------------------------------------------------------------------------
// Hardened configuration detection
// ---------------------------------------------------------------------------
// A raw `Boolean(url && key)` check is not enough: a whitespace-only value, a
// leftover placeholder ("your-anon-key", "missing-anon-key") or the internal
// fallback sentinel would all pass as "configured" and then blow up at runtime
// with ERR_NAME_NOT_RESOLVED / 401. We normalise and reject those here so the
// rest of the app can trust `isSupabaseConfigured` as a single source of truth.
const PLACEHOLDER_TOKENS = new Set([
  'undefined', 'null', 'missing-anon-key', 'your-anon-key', 'your-project-url',
  'your-supabase-url', 'your-supabase-anon-key', 'your_supabase_url',
  'your_supabase_anon_key', 'changeme', 'todo',
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

/**
 * Single source of truth: `true` only when both URL and key are present AND
 * look like real values. Consumers MUST check this before issuing any network
 * call (REST, realtime, edge functions) so an unconfigured build stays quiet
 * instead of hammering an unreachable host.
 */
export const isSupabaseConfigured =
  isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);

// One-time, consolidated warning helper for consumers that short-circuit while
// unconfigured. Guarded so the console shows the reason at most once, no matter
// how many hooks/providers skip their network work.
let warnedUnconfigured = false;
export function warnSupabaseUnconfigured(context?: string): void {
  if (warnedUnconfigured) return;
  warnedUnconfigured = true;
  console.warn(
    '[Supabase] Modo degradado: cliente não configurado' +
      (context ? ` (origem: ${context})` : '') +
      '. Chamadas de rede desativadas até definir VITE_SUPABASE_URL e ' +
      'VITE_SUPABASE_ANON_KEY (Settings → Secrets).'
  );
}

// Module-load diagnostic (fires once). Pinpoints exactly which var is bad,
// including the hardened cases (whitespace / placeholder / sentinel) that a
// naive falsy-check would silently accept.
if (!isSupabaseConfigured) {
  const problems: string[] = [];
  if (!isValidSupabaseUrl(SUPABASE_URL)) {
    problems.push('VITE_SUPABASE_URL ausente ou inválida');
  }
  if (!isValidSupabaseKey(SUPABASE_ANON_KEY)) {
    problems.push('VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY) ausente ou inválida');
  }
  console.error(
    '[Supabase] ' + problems.join(' + ') + '.\n' +
    'Acesse: Projeto Lovable → Settings → Secrets e adicione as variáveis.\n' +
    'Obtenha em: Supabase Dashboard → Project Settings → API.'
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
// reconnecting in a tight loop and flooding the console (the default schedule
// caps at 10s and is more aggressive).
const realtimeReconnectAfterMs = (tries: number): number =>
  Math.min(1000 * 2 ** Math.max(0, tries - 1), 30000);

export const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: getSupabaseStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    realtime: {
      reconnectAfterMs: realtimeReconnectAfterMs
    }
  }
);

// ---------------------------------------------------------------------------
// Systemic realtime guard (single choke point)
// ---------------------------------------------------------------------------
// There are dozens of `supabase.channel(...).subscribe()` sites across the app.
// When unconfigured, each would open a WebSocket to the unreachable sentinel
// host and retry forever. Rather than touch every call site, we neutralise
// `subscribe` here once: the channel object stays real (so `removeChannel` /
// `unsubscribe` keep working), but no socket is ever opened. When Supabase IS
// configured this block is skipped entirely — `channel` is a pure pass-through
// and production behaviour is unchanged.
if (!isSupabaseConfigured) {
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = ((name: string, opts?: Parameters<typeof originalChannel>[1]) => {
    warnSupabaseUnconfigured('realtime');
    const channel = originalChannel(name, opts);
    channel.subscribe = (() => channel) as typeof channel.subscribe;
    return channel;
  }) as typeof supabase.channel;
}
