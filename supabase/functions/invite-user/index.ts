import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit, getClientIP, getCorsHeaders } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

/**
 * invite-user@v1 — convite de usuário por email (Etapa 57 do plano 100 etapas).
 *
 * Convite REAL via GoTrue admin API: `auth.admin.inviteUserByEmail` cria o
 * usuário com `invited_at` e envia o email de aceite (link com TTL gerenciado
 * pelo GoTrue). O papel é gravado em zapp.user_roles no momento do convite
 * (mesmo padrão do create-user); se a gravação falhar, o convite é revertido.
 *
 * Decisão 2026-08-18 (ADR): o plano previa RPC `invite_user` + tabela de
 * convites, mas o banco vivo NÃO tem nem o RPC nem a tabela (verificado no DB
 * em 18/08/2026) e migrations estão fora de escopo desta rodada — o mínimo
 * real é o fluxo nativo do GoTrue. Quando a Etapa 57.3/57.4 (token próprio
 * com TTL + tabela) for implementada no banco, esta edge migra sem quebrar o
 * contrato de entrada (email/role/message).
 *
 * Autorização: admin/supervisor (requireAdminOrSupervisor) — 401 sem JWT,
 * 403 não-admin. Rate limit 5/60s por IP ANTES da auth (padrão create-user).
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

    const adminClient = createZappAdminClient();

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('invite-user', CONTRACT_SCHEMAS['invite-user'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as { email: string; role?: string; message?: string };
    const role = body.role ?? "agent";

    // Convite real: GoTrue cria o usuário (invited_at) e envia o email de
    // aceite. user_metadata carrega o papel + mensagem para o aceite.
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      body.email,
      { data: { role, invite_message: body.message ?? null } },
    );

    if (inviteError) {
      log.error("Invite failed", { error: inviteError.message });
      const msg = inviteError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already invited") || msg.includes("duplicate")) {
        return errorResponse("Email already registered or invited", 409, req);
      }
      return errorResponse("Invite failed", 400, req);
    }

    // Papel no momento do convite (upsert cobre trigger race pós-create).
    if (invited.user) {
      const { error: roleError } = await adminClient
        .from("user_roles")
        .upsert({ user_id: invited.user.id, role }, { onConflict: 'user_id' });

      if (roleError) {
        log.error("Role assignment failed", { error: roleError.message });
        // Convite ainda não aceito → deletar é seguro (rollback completo).
        await adminClient.auth.admin.deleteUser(invited.user.id).catch(() => {});
        return errorResponse("Invite created but role assignment failed — invite rolled back", 500, req);
      }
    }

    log.done(200, { inviteId: invited.user?.id });
    return jsonResponse({ success: true, invite_id: invited.user?.id, email: body.email }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
