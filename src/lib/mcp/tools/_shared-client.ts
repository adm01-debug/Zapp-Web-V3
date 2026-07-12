import { createClient } from '@supabase/supabase-js';
import type { ToolContext } from '@lovable.dev/mcp-js';

// Cache the most-recently-used client by token. Token changes trigger a new
// client (e.g. after JWT refresh). Bounded to 1 entry — no memory leak risk.
// Cache key includes token value; if token is null, we still cache to avoid recreating
// on every call when token is unavailable.
let _cachedToken: string | null = null;
let _cachedClient: ReturnType<typeof createClient> | null = null;
let _cacheInitialized = false;

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();

  // Return cached client if token hasn't changed
  if (_cacheInitialized && token === _cachedToken && _cachedClient) {
    return _cachedClient;
  }

  // Validate required environment variables at runtime
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is not set');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY must be set');
  }

  // Create new client with current token (or without if token is null/undefined)
  _cachedClient = createClient(supabaseUrl, supabaseKey, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  _cachedToken = token;
  _cacheInitialized = true;
  return _cachedClient;
}
