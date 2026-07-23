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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { errorResponse, requireEnv, validateEnvironment } from "./validation.ts";
import { createZappAdminClient } from "./db-client.ts";

/** Authed User interface. */
export interface AuthedUser {
  user: { id: string; email: string | null };
}

/**
 * Constant-time string comparison to prevent timing-based secret enumeration.
 * Always iterates exactly bb.byteLength (the secret's length) times, so the
 * loop duration is determined by the secret, not by the attacker-supplied value.
 * Length mismatch is folded into `diff` without branching the loop.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Start diff at 1 if lengths differ; the loop alone cannot flip it back to 0.
  let diff = ab.byteLength === bb.byteLength ? 0 : 1;
  for (let i = 0; i < bb.byteLength; i++) {
    diff |= (ab[i] ?? 0) ^ bb[i];
  }
  return diff === 0;
}

/** get Bearer function. */
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
  if (!raw || raw.length < 8 || /PLACEHOLDER|REPLACE|CHANGE_ME|YOUR_/i.test(raw)) return null;
  return raw;
}

/** require User function. */
export async function requireUser(req: Request): Promise<AuthedUser | Response> {
  const token = getBearer(req);
  if (!token) return errorResponse("Unauthorized: missing bearer token", 401, req);

  const tokenPayload = (() => {
    try {
      const [, payload] = token.split('.');
      if (!payload) return null;
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return JSON.parse(atob(padded)) as { role?: string; sub?: string; iss?: string };
    } catch {
      return null;
    }
  })();

  if (!tokenPayload?.sub || tokenPayload.role === 'anon') {
    return errorResponse("Unauthorized: user session required", 401, req);
  }

  const selfUrl = readSupabaseUrl("SELFHOSTED_SUPABASE_URL") ?? readSupabaseUrl("EXTERNAL_SUPABASE_URL");
  const selfAnon = readSecret("SELFHOSTED_SUPABASE_ANON_KEY") ?? readSecret("EXTERNAL_SUPABASE_ANON_KEY");
  // Fallback: /auth/v1/user aceita service_role como apikey. Se a anon estiver ausente
  // ou não bater com o JWT_SECRET do self-hosted, o service_role destrava a validação.
  const selfServiceRole = readSecret("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ?? readSecret("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
  const cloudUrl = readSupabaseUrl("SUPABASE_URL");
  const cloudAnon = readSecret("SUPABASE_ANON_KEY") ?? readSecret("SUPABASE_PUBLISHABLE_KEY");

  const allCandidates: Array<{ url: string; key: string; label: string }> = [];
  if (selfUrl && selfAnon) allCandidates.push({ url: selfUrl, key: selfAnon, label: "self-hosted (anon)" });
  if (selfUrl && selfServiceRole) allCandidates.push({ url: selfUrl, key: selfServiceRole, label: "self-hosted (service_role)" });
  if (cloudUrl && cloudAnon) allCandidates.push({ url: cloudUrl, key: cloudAnon, label: "cloud" });

  if (allCandidates.length === 0) {
    return errorResponse("Server misconfigured: no Supabase auth backend", 500, req);
  }

  // Fast-path: prefer the candidate whose origin matches the JWT's `iss` claim.
  const tokenIssOrigin = (() => {
    try { return tokenPayload.iss ? new URL(tokenPayload.iss).origin : null; } catch { return null; }
  })();
  const candidates = tokenIssOrigin
    ? [...allCandidates].sort((a, b) => (b.url === tokenIssOrigin ? 1 : 0) - (a.url === tokenIssOrigin ? 1 : 0))
    : allCandidates;


  const tried: Array<{ label: string; url: string; ok: boolean; err?: string }> = [];
  let lastErr: string | null = null;
  for (const c of candidates) {
    try {
      const client = createClient(c.url, c.key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.auth.getUser();
      if (!error && data?.user) {
        console.log("[auth] token validated", { label: c.label, url: c.url, tried: tried.length + 1 });
        return { user: { id: data.user.id, email: data.user.email ?? null } };
      }
      lastErr = error?.message ?? "invalid token";
      tried.push({ label: c.label, url: c.url, ok: false, err: lastErr });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "auth error";
      tried.push({ label: c.label, url: c.url, ok: false, err: lastErr });
    }
  }

  const tokenIss = (() => {
    try {
      const [, payload] = token.split('.');
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      return (JSON.parse(atob(padded)) as { iss?: string }).iss ?? null;
    } catch { return null; }
  })();

  console.error("[auth] 401 invalid token", {
    token_iss: tokenIss,
    token_sub: tokenPayload.sub,
    candidates_tried: tried,
    hint: "token_iss deve bater com a URL de um candidato acima. Se não bater, a env set em uso está errada.",
  });

  return errorResponse(`Unauthorized: invalid token (${lastErr ?? "unknown"})`, 401, req);
}

/** require Admin Or Supervisor function. */
export async function requireAdminOrSupervisor(req: Request): Promise<AuthedUser | Response> {
  // requireUser already validates token expiry, so no need to check again here
  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const admin = createZappAdminClient();
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
