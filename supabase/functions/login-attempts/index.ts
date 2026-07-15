import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  handleCors,
  jsonResponse,
  requireEnv,
  sanitizeString,
} from "../_shared/validation.ts";

type LoginAttemptAction = "check" | "record_failed" | "clear";

interface LoginAttemptRequest {
  action?: LoginAttemptAction;
  email?: string;
  userAgent?: string | null;
}

interface LoginAttemptRow {
  attempt_count: number;
  locked_until: string | null;
  last_attempt_at: string;
}

interface LoginAttemptStatus {
  is_locked: boolean;
  locked_until: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const MAX_LOCK_EXPONENT = 10;

const normalizeEmail = (value: unknown): string | null => {
  const email = sanitizeString(value, 255)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

const toStatus = (row: LoginAttemptRow | null): LoginAttemptStatus => {
  if (!row) {
    return { is_locked: false, locked_until: null, attempts: 0 };
  }

  const lockedUntilMs = row.locked_until ? Date.parse(row.locked_until) : 0;
  const isLocked = Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now();
  return {
    is_locked: isLocked,
    locked_until: isLocked ? row.locked_until : null,
    attempts: row.attempt_count,
  };
};

const nextLockUntil = (attempts: number): string | null => {
  if (attempts < MAX_ATTEMPTS) return null;
  const minutes = 2 ** Math.min(attempts - MAX_ATTEMPTS, MAX_LOCK_EXPONENT);
  return new Date(Date.now() + minutes * 60_000).toISOString();
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return errorResponse("Método não permitido", 405, req);
  }

  const ip = getClientIP(req);
  const rateLimit = checkRateLimit(`login-attempts:${ip}`, 60, 60_000);
  if (!rateLimit.allowed) {
    return errorResponse("Muitas requisições. Tente novamente em instantes.", 429, req);
  }

  try {
    const body = (await req.json()) as LoginAttemptRequest;
    const action = body.action;
    const email = normalizeEmail(body.email);

    if (!action || !["check", "record_failed", "clear"].includes(action)) {
      return errorResponse("Ação inválida", 400, req);
    }
    if (!email) {
      return errorResponse("Email inválido", 400, req);
    }

    const admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY", { db: { schema: "zapp" } }));

    if (action === "clear") {
      const authHeader = req.headers.get("Authorization") ?? "";
      const authClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY", { db: { schema: "zapp" } }), {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: authData, error: authError } = await authClient.auth.getUser();
      const userEmail = authData.user?.email?.toLowerCase();
      if (authError || !userEmail || userEmail !== email) {
        return errorResponse("Não autorizado", 401, req);
      }

      const { error } = await admin.from("login_attempts").delete().eq("email", email);
      if (error) return errorResponse("Não foi possível limpar tentativas", 500, req);
      return jsonResponse({ ok: true }, 200, req);
    }

    const { data: existing, error: selectError } = await admin
      .from("login_attempts")
      .select("attempt_count, locked_until, last_attempt_at")
      .eq("email", email)
      .maybeSingle<LoginAttemptRow>();

    if (selectError) {
      return errorResponse("Não foi possível verificar tentativas", 500, req);
    }

    if (action === "check") {
      return jsonResponse(toStatus(existing), 200, req);
    }

    const previousLockExpired = existing?.locked_until ? Date.parse(existing.locked_until) <= Date.now() : false;
    const attempts = existing && !previousLockExpired ? existing.attempt_count + 1 : 1;
    const lockedUntil = nextLockUntil(attempts);
    const userAgent = sanitizeString(body.userAgent, 500);

    const { error: upsertError } = await admin.from("login_attempts").upsert(
      {
        email,
        ip_address: ip === "unknown" ? null : ip,
        user_agent: userAgent,
        attempt_count: attempts,
        last_attempt_at: new Date().toISOString(),
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email" },
    );

    if (upsertError) {
      return errorResponse("Não foi possível registrar tentativa", 500, req);
    }

    return jsonResponse({ is_locked: lockedUntil !== null, locked_until: lockedUntil, attempts }, 200, req);
  } catch {
    return errorResponse("Erro interno ao processar tentativas de login", 500, req);
  }
});