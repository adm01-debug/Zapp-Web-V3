import { handleCors, errorResponse, jsonResponse, Logger, getCorsHeaders } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * revoke-session@v1 — gestão de sessões ativas (Etapa 56 do plano 100 etapas).
 * Dono revoga as próprias sessões; admin/supervisor pode revogar de outros
 * (o RPC sessions_revoke revalida a autorização internamente — SECURITY DEFINER).
 * Sessão inexistente/já revogada → 404 idempotente (nunca 5xx).
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("revoke-session");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const uid = authed.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('revoke-session', CONTRACT_SCHEMAS['revoke-session'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const { sessionId } = parsed.data as { sessionId: string };

    const client = createZappAdminClient();

    // Admin/supervisor revoga sessões de outros; dono só as próprias.
    const { data: isAdmin } = await client.rpc("is_admin_or_supervisor");
    const admin = isAdmin === true;

    const { data: revoked, error } = await client.rpc("sessions_revoke", {
      p_target_user_id: uid,
      p_session_ids: [sessionId],
      p_admin: admin,
    });

    if (error) {
      log.error("sessions_revoke falhou", { code: error.code, message: error.message });
      if (error.code === "42501") return errorResponse("Permission denied", 403, req);
      return errorResponse("Failed to revoke session", 404, req);
    }

    if ((revoked ?? 0) === 0) {
      return errorResponse("Session not found", 404, req);
    }

    return jsonResponse({ success: true }, 200, req);
  } catch (e) {
    log.error("revoke-session erro inesperado", { error: String(e) });
    return errorResponse("Internal error", 500, req);
  }
});
