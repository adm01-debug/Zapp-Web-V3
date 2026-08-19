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

    // Pré-checagem de duplicado (contrato duplicate.test.ts): auth.users via
    // service_role ANTES de criar — 409 honesto sem depender só do 23505 da RPC.
    const { data: existing, error: preErr } = await client
      .schema('auth')
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (preErr) {
      log.error("pre-check auth.users falhou", { code: preErr.code, message: preErr.message });
      if (preErr.code === "PGRST202") return errorResponse("Invite RPC unavailable", 503, req);
      return errorResponse("Failed to create invite", 400, req);
    }
    if (existing) return errorResponse("Email already registered", 409, req);

    const { data: rpcData, error: rpcError } = await client.rpc('invite_user', {
      p_email: email,
      p_role: role ?? 'agent',
      p_message: message ?? null,
    });

    if (rpcError) {
      log.error("invite_user falhou", { code: rpcError.code, message: rpcError.message });
      if (rpcError.code === "23505") return errorResponse("Email already registered", 409, req);
      if (rpcError.code === "PGRST202") return errorResponse("Invite RPC unavailable", 503, req);
      if (rpcError.code === "22023") return errorResponse("Invalid email or role", 400, req);
      return errorResponse("Failed to create invite", 400, req);
    }

    const inviteId = (rpcData as any)?.[0]?.invite_id ?? (rpcData as any)?.invite_id ?? null;
    if (!inviteId) return errorResponse("Invite not found", 404, req);

    // Convite REAL via GoTrue admin API (Etapa 57.3): envia o email com o link.
    const { data: gtuInvite, error: gtuError } = await client.auth.admin.inviteUserByEmail(
      email,
      { data: { role: role ?? "agent", invite_id: inviteId } },
    );
    if (gtuError) {
      log.error("inviteUserByEmail falhou", { code: gtuError.code, message: gtuError.message });
      return errorResponse("Failed to create invite", 400, req);
    }

    return jsonResponse({ success: true, invite_id: inviteId, go_true_id: gtuInvite?.user?.id ?? null }, 200, req);
  } catch (e) {
    log.error("invite-user erro inesperado", { error: String(e) });
    return errorResponse("Internal error", 500, req);
  }
});
