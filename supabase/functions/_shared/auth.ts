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
export function timingSafeStringEqual(a: string, b: string): boolean {
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

export function getBearer(req: Request): string | null {
  const raw = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!raw) return null;
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  return raw.slice(7).trim() || null;
}

function readSupabaseUrl(name: string): string | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw || /PLACEHOLDER|REPLACE|CHANGE_ME|YOUR_/i.test(raw)) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

function readSecret(name: string): string | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw || /PLACEHOLDER|REPLACE|CHANGE_ME|YOUR_/i.test(raw)) return null;
  return raw;
}

export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const token = getBearer(req);
  if (!token) return errorResponse("Unauthorized: missing bearer token", 401, req);

  const tokenPayload = (() => {
    try {
      const [, payload] = token.split('.');
      if (!payload) return null;
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return JSON.parse(atob(padded)) as { role?: string; sub?: string };
    } catch {
      return null;
    }
  })();

  if (!tokenPayload?.sub || tokenPayload.role === 'anon') {
    return errorResponse("Unauthorized: user session required", 401, req);
  }

  // Prefer self-hosted when configured — the published frontend uses it and
  // Cloud validation would falsely reject those JWTs. Fall back to Cloud.
  const selfUrl = readSupabaseUrl("SELFHOSTED_SUPABASE_URL") ?? readSupabaseUrl("EXTERNAL_SUPABASE_URL");
  const selfAnon = readSecret("SELFHOSTED_SUPABASE_ANON_KEY") ?? readSecret("EXTERNAL_SUPABASE_ANON_KEY");
  const cloudUrl = readSupabaseUrl("SUPABASE_URL");
  const cloudAnon = readSecret("SUPABASE_ANON_KEY") ?? readSecret("SUPABASE_PUBLISHABLE_KEY");

  const candidates: Array<{ url: string; key: string; label: string }> = [];
  if (selfUrl && selfAnon) candidates.push({ url: selfUrl, key: selfAnon, label: "self-hosted" });
  if (cloudUrl && cloudAnon) candidates.push({ url: cloudUrl, key: cloudAnon, label: "cloud" });

  if (candidates.length === 0) {
    return errorResponse("Server misconfigured: no Supabase auth backend", 500, req);
  }

  let lastErr: string | null = null;
  for (const c of candidates) {
    try {
      const client = createClient(c.url, c.key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser();
      if (!error && data?.user) {
        return { user: { id: data.user.id, email: data.user.email ?? null } };
      }
      lastErr = error?.message ?? "invalid token";
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "auth error";
    }
  }

  return errorResponse(`Unauthorized: invalid token (${lastErr ?? "unknown"})`, 401, req);
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
  const serviceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
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
  const serviceKey = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (token && serviceKey && timingSafeStringEqual(token, serviceKey)) return null;

  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret && timingSafeStringEqual(headerSecret, cronSecret)) return null;

  return errorResponse("Unauthorized: internal endpoint", 401, req);
}
