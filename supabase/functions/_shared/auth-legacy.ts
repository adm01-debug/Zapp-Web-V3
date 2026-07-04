import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { errorResponse } from "./cors.ts";

interface LegacyAuthUser {
  id: string;
  email: string | undefined;
  role: string | undefined;
}

export function createSupabaseClients(authHeader: string): { supabase: SupabaseClient; supabaseAdmin: SupabaseClient } {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return {
    supabase: createClient(url!, anon!, { global: { headers: { Authorization: authHeader } } }),
    supabaseAdmin: createClient(url!, svc!),
  };
}

export async function authenticateRequest(
  req: Request,
  options: Record<string, unknown> = {},
): Promise<{ user: LegacyAuthUser | null; supabase: SupabaseClient | null; supabaseAdmin: SupabaseClient | null; error: Response | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return {
      user: null, supabase: null, supabaseAdmin: null,
      error: errorResponse(req, 'Missing Authorization header', 401),
    };
  }
  const { supabase, supabaseAdmin } = createSupabaseClients(authHeader);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      user: null, supabase: null, supabaseAdmin: null,
      error: errorResponse(req, 'Invalid or expired token', 401),
    };
  }
  return { user: { id: user.id, email: user.email, role: user.role }, supabase, supabaseAdmin, error: null };
}
