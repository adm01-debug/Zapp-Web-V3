import { createClient } from '@supabase/supabase-js';
import type { ToolContext } from '@lovable.dev/mcp-js';

// Cache the most-recently-used client by token. Token changes trigger a new
// client (e.g. after JWT refresh). Bounded to 1 entry — no memory leak risk.
let _cachedToken: string | null = null;
let _cachedClient: ReturnType<typeof createClient> | null = null;

export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (token && token === _cachedToken && _cachedClient) {
    return _cachedClient;
  }
  _cachedClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
  _cachedToken = token;
  return _cachedClient;
}
