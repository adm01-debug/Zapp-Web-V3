import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit, getClientIP, getCorsHeaders } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * invite-user@v1 — convites de usuário (Etapa 57 do plano 100 etapas).
 * Admin/supervisor cria convite com token TTL via RPC zapp.invite_user.
 * Rate limit 5/60s ANTES da auth (padrão create-user). Erros tratados:
 * 409 (email já convidado), 400 (dados inválidos), 404 (não encontrado).
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("invite-user");

  const ip = getClientIP(req);
  const rl = checkRateLimit(`invite-user:${ip}`, 5, 60_000);
  if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

  try {
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;

    const client = createZappAdminClient();

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('invite-user', CONTRACT_SCHEMAS['invite-user'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const { email, role, message } = parsed.data as { email: string; role?: string; message?: string };

    const { data, error } = await client.rpc('invite_user', {
      p_email: email,
      p_role: role ?? 'agent',
      p_message: message ?? null,
    });

    if (error) {
      log.error("invite_user falhou", { code: error.code, message: error.message });
      if (error.code === "23505") return errorResponse("Email already invited", 409, req);
      if (error.code === "22023") return errorResponse("Invalid email or role", 400, req);
      return errorResponse("Invite failed", 400, req);
    }

    const inviteId = (data as any)?.[0]?.invite_id ?? (data as any)?.invite_id ?? null;
    if (!inviteId) return errorResponse("Invite not found", 404, req);

    return jsonResponse({ success: true, invite_id: inviteId }, 200, req);
  } catch (e) {
    log.error("invite-user erro inesperado", { error: String(e) });
    return errorResponse("Internal error", 500, req);
  }
});
