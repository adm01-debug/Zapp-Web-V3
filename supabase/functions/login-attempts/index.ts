import {
  checkRateLimit,
  errorResponse,
  getClientIP,
  getCorsHeaders,
  handleCors,
  jsonResponse,
  sanitizeString,
} from "../_shared/validation.ts";
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { checkLoginSecurityGate } from "../_shared/security-gate.ts";

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

/** Resultado da RPC atômica zapp.fn_login_attempt_record_failed (jsonb). */
interface AtomicRecordResult {
  attempt_count: number;
  locked_until: string | null;
  last_attempt_at: string;
  is_locked: boolean;
}

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

  // ── SEGURANCA-04 + SEGURANCA-05: enforcement de blocked_ips, ip_whitelist e
  // geo-blocking no início do handler de login (pré-flight chamado pelo frontend
  // antes de cada signInWithPassword). Consulta direta via service role.
  // Nota: o request de login do GoTrue (signInWithPassword) NÃO passa pelas Edge
  // Functions — este gate é o único ponto de enforcement possível sem hook do
  // GoTrue (sinalizado; hook exigiria migration/config de auth).
  const admin = createZappAdminClient();
  const gate = await checkLoginSecurityGate(req, admin);
  if (!gate.allowed) {
    console.warn(
      `[login-attempts] login blocked: reason=${gate.reason} ip=${gate.ip} country=${gate.country}`,
    );
    return errorResponse(
      "Acesso bloqueado pela política de segurança",
      403,
      req,
      { code: gate.reason, ip: gate.ip, country: gate.country },
    );
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject("login-attempts", CONTRACT_SCHEMAS["login-attempts"], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as LoginAttemptRequest;
    const action = body.action;
    const email = normalizeEmail(body.email);

    if (!action || !["check", "record_failed", "clear"].includes(action)) {
      return errorResponse("Ação inválida", 400, req);
    }
    if (!email) {
      return errorResponse("Email inválido", 400, req);
    }

    if (action === "clear") {
      const authClient = createZappClient(req);
      const { data: authData, error: authError } = await authClient.auth.getUser();
      const userEmail = authData.user?.email?.toLowerCase();
      if (authError || !userEmail || userEmail !== email) {
        return errorResponse("Não autorizado", 401, req);
      }

      const { error } = await admin.from("login_attempts").delete().eq("email", email);
      if (error) return errorResponse("Não foi possível limpar tentativas", 500, req);
      return jsonResponse({ ok: true }, 200, req);
    }

    if (action === "check") {
      // Leitura pura (sem race): SELECT direto preservado.
      const { data: existing, error: selectError } = await admin
        .from("login_attempts")
        .select("attempt_count, locked_until, last_attempt_at")
        .eq("email", email)
        .maybeSingle<LoginAttemptRow>();

      if (selectError) {
        return errorResponse("Não foi possível verificar tentativas", 500, req);
      }

      // Resposta estendida (SEGURANCA-04/05): `country`/`geo_unavailable` para
      // observabilidade do gate de segurança (contrato de request inalterado).
      return jsonResponse(
        {
          ...toStatus(existing),
          country: gate.country,
          geo_unavailable: gate.geoUnavailable,
        },
        200,
        req,
      );
    }

    // ── record_failed (ação padrão do fluxo) ────────────────────────────────
    // AGENTE A3 (2026-08-19): caminho antigo SELECT → compute(+1) → upsert
    // removido (race: 2 falhas simultâneas contavam 1). Agora a gravação é uma
    // RPC atômica no DB: zapp.fn_login_attempt_record_failed faz
    // INSERT ... ON CONFLICT (email) DO UPDATE SET attempt_count = +1
    // (lock de linha — CADA chamada conta, mesmo concorrente).
    //
    // Regras preservadas (agora no SQL, copiadas da edge FIX 2026-07-16):
    //   • lock só a partir da 5ª falha; escalação 2^(n-5) min, teto 2^10;
    //   • lock expirado NÃO reseta o contador (incremento sempre);
    //   • reset só via action='clear' (deleta a linha).
    // Fail-closed preservado: erro de RPC → 500 → front trata como
    // lock_check_failed (bloqueia login — nunca declara desbloqueado).
    const userAgent = sanitizeString(body.userAgent, 500);
    const { data, error: rpcError } = await admin.rpc("fn_login_attempt_record_failed", {
      p_email: email,
      p_ip_address: ip === "unknown" ? null : ip,
      p_user_agent: userAgent,
    });

    if (rpcError) {
      console.error(`[login-attempts] record_failed rpc error: ${rpcError.message}`);
      return errorResponse("Não foi possível registrar tentativa", 500, req);
    }

    const result = (data ?? null) as AtomicRecordResult | null;
    const attempts = result?.attempt_count ?? 0;
    const lockedUntil = result?.locked_until ?? null;

    return jsonResponse(
      {
        is_locked: result?.is_locked ?? (lockedUntil !== null),
        locked_until: lockedUntil,
        attempts,
        country: gate.country,
        geo_unavailable: gate.geoUnavailable,
      },
      200,
      req,
    );
  } catch {
    return errorResponse("Erro interno ao processar tentativas de login", 500, req);
  }
});
