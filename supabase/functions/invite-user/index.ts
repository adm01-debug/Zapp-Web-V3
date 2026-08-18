/**
 * Edge Function: invite-user — Convite de usuário por email (Etapa 57).
 *
 * Fluxo (admin/supervisor → convite com token TTL):
 *   1. Rate limit 5/60s por IP (antes da auth, padrão create-user).
 *   2. requireAdminOrSupervisor: sem JWT → 401; não-admin/supervisor → 403.
 *   3. Contrato invite-user@v1 (zod, registrado em CONTRACT_SCHEMAS):
 *        { email: string, role?: 'admin'|'supervisor'|'agent' (default 'agent'),
 *          message?: string (max 500) }  — .strict()
 *   4. Duplicado honesto:
 *        a. email já tem conta auth → 409 "Email already registered";
 *        b. RPC zapp.invite_user re-checa atomicamente (conta auth + convite
 *           pendente) e sobe exceção → mapeada para 409, nunca 500;
 *        c. RPC ausente no banco (PGRST202) → 503 honesto (migration pendente).
 *   5. RPC grava zapp.invites (token 32 bytes hex, TTL 7 dias) e retorna o id.
 *   6. Sucesso → 200 { success: true, invite_id }.
 *
 * Segurança: service_role (createZappAdminClient); RLS de zapp.invites
 * permite SELECT apenas a admin/supervisor ou ao dono do email (Etapa 57.4).
 */
import { handleCors, errorResponse, jsonResponse, Logger, sanitizeString, checkRateLimit, getClientIP, getCorsHeaders } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

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
    const body = parsed.data as Record<string, any>;

    const { email, role, message } = body;
    const cleanEmail = sanitizeString(email)?.trim().toLowerCase() || email;

    // Duplicate (honest, antes do RPC): email com conta auth existente → 409.
    // auth.users é tabela de plataforma (schema auth), lida via service_role.
    const { data: existingUser, error: lookupError } = await adminClient
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();
    if (!lookupError && existingUser) {
      log.warn("duplicate email (already registered)", { email: cleanEmail });
      return errorResponse("Email already registered", 409, req);
    }

    // Criação atômica via RPC (valida role, token TTL, unique por email).
    const { data: inviteId, error: rpcError } = await adminClient.rpc("invite_user", {
      p_email: cleanEmail,
      p_role: role,
      p_message: message ?? null,
      p_invited_by: authed.user.id,
    });

    if (rpcError) {
      log.error("invite_user RPC failed", { error: rpcError.message, code: rpcError.code });
      const msg = rpcError.message ?? "";
      if (/already registered|already invited|já convidado|já cadastrado/i.test(msg)) {
        return errorResponse("Email already registered", 409, req);
      }
      if (rpcError.code === "PGRST202") {
        return errorResponse("Invite backend not available", 503, req);
      }
      return errorResponse("Failed to create invite", 400, req);
    }

    log.done(200, { inviteId });
    return jsonResponse({ success: true, invite_id: inviteId ?? null }, 200, req);
  } catch (err: unknown) {
    log.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
    return errorResponse("Internal server error", 500, req);
  }
});
