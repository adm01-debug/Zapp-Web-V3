/**
 * Auth helpers for edge functions.
 *
 * Three patterns:
 *  - requireUser(req): user must present a valid Supabase JWT (frontend calls).
 *  - requireAdminOrSupervisor(req): valid JWT + role check via is_admin_or_supervisor RPC.
 *  - requireServiceRoleOrCron(req): internal calls only — accepts Supabase service role
 *    bearer token OR an x-cron-secret header matching the CRON_SECRET env var.
 *
 * Each helper returns either an authorized context object OR a Response that
 * the caller MUST return immediately (401/403). This keeps call sites concise:
 *
 *     const authed = await requireUser(req);
 *     if (authed instanceof Response) return authed;
 *     // authed.user is now safe to use
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse, requireEnv } from "./validation.ts";

export interface AuthedUser {
  user: { id: string; email: string | null };
}

/** Constant-time string comparison to prevent timing-based secret enumeration. */
function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) {
    // Consume comparable time even on length mismatch
    let _x = 0;
    for (let i = 0; i < ab.byteLength; i++) _x |= ab[i] ^ (bb[i % (bb.byteLength || 1)] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.byteLength; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function getBearer(req: Request): string | null {
  const raw = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  return raw.slice(7).trim() || null;
}

export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const token = getBearer(req);
  if (!token) return errorResponse("Unauthorized: missing bearer token", 401, req);

  const url = requireEnv("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) return errorResponse("Server misconfigured: anon key missing", 500, req);

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return errorResponse("Unauthorized: invalid token", 401, req);

  return { user: { id: data.user.id, email: data.user.email ?? null } };
}

export async function requireAdminOrSupervisor(req: Request): Promise<AuthedUser | Response> {
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const admin = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: isPriv, error } = await admin.rpc("is_admin_or_supervisor", { _user_id: authed.user.id });
  if (error) return errorResponse("Authorization check failed", 500, req);
  if (!isPriv) return errorResponse("Forbidden: admin or supervisor required", 403, req);

  return authed;
}

/**
 * For internal endpoints that should NOT be callable by external cron schedulers.
 * Only accepts the Supabase service role bearer token.
 * Returns null when authorized, otherwise a 401 Response.
 */
export function requireServiceRoleOnly(req: Request): Response | null {
  const token = getBearer(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceKey && timingSafeStringEqual(token, serviceKey)) return null;
  return errorResponse("Unauthorized: internal endpoint", 401, req);
}

/**
 * For internal/cron-only endpoints. Returns null when authorized, otherwise a 401 Response.
 * Accepts EITHER the Supabase service role bearer token (cron jobs invoked via supabase.functions)
 * OR a matching `x-cron-secret` header (recommended for external schedulers).
 */
export function requireServiceRoleOrCron(req: Request): Response | null {
  const token = getBearer(req);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (token && serviceKey && timingSafeStringEqual(token, serviceKey)) return null;

  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret && timingSafeStringEqual(headerSecret, cronSecret)) return null;

  return errorResponse("Unauthorized: internal endpoint", 401, req);
}
