/**
 * Edge Function: Revoke Session (revogação de sessão ativa) — Etapa 56.
 *
 * Contrato revoke-session@v1 (zod estrito): { sessionId: UUID de auth.sessions }.
 *
 * Segurança (defesa em profundidade — espelha a migration
 * 20260817190000_auth_sessions_rpc.sql):
 *   - Sem JWT válido            → 401 (requireUser)
 *   - Sessão de OUTRO usuário   → 403 (ownership check; não-admin)
 *   - Sessão inexistente        → 404 genérico (sem vazamento de existência)
 *   - Já revogada (idempotente) → 404 "already revoked" (nunca 500)
 *   - Admin/supervisor revogando de outro → 200 quando o dono é resolvível
 *     (auth.sessions via PostgREST); senão 404 fail-closed.
 *
 * Revogação REAL: RPC SECURITY DEFINER `sessions_revoke` chamada com o JWT do
 * CALLER (createZappClient) — auth.uid() = caller, e a própria RPC revalida a
 * autorização (dono só revoga as próprias; admin exige is_admin_or_supervisor).
 * O service role NÃO pode chamá-la (auth.uid() nulo → 42501), por isso o
 * client do caller, não o admin client.
 */
import {
  handleCors,
  errorResponse,
  jsonResponse,
  Logger,
  getCorsHeaders,
} from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("revoke-session");

  try {
    // Auth ANTES do gate (oracle do repo: anônimo recebe 401, nunca 422).
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const callerId = authed.user.id;

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('revoke-session', CONTRACT_SCHEMAS['revoke-session'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const { sessionId } = parsed.data as { sessionId: string };

    const adminClient = createZappAdminClient();

    // Papel do caller (admin/supervisor revoga sessões de outros — Etapa 56.8).
    const { data: isPriv, error: privError } = await adminClient.rpc(
      "is_admin_or_supervisor",
      { _user_id: callerId },
    );
    if (privError) return errorResponse("Authorization check failed", 500, req);

    // Client com o JWT do CALLER: a RPC SECURITY DEFINER revalida a
    // autorização via auth.uid() (service role não passa — auth.uid() nulo).
    const callerClient = createZappClient(req);

    // Ownership check: dono lista as PRÓPRIAS sessões (sessions_list com
    // p_admin=false é restrito ao caller pela própria RPC).
    const { data: ownSessions, error: listError } = await callerClient.rpc(
      "sessions_list",
      { p_target_user_id: callerId, p_admin: false },
    );
    if (listError) {
      log.error("sessions_list failed", { error: listError.message });
      return errorResponse("Failed to list sessions", 500, req);
    }

    const owned = Array.isArray(ownSessions) &&
      ownSessions.some((s: { id?: string }) => s.id === sessionId);

    if (!owned) {
      // Não é do caller: não-admin → 403 (nunca confirma existência).
      if (!isPriv) {
        return errorResponse("Forbidden: you can only revoke your own sessions", 403, req);
      }

      // Admin/supervisor: resolve o dono via auth.sessions (service role).
      // Se o schema `auth` não estiver exposto ao PostgREST desta instalação,
      // a busca falha → 404 genérico fail-closed (sem vazamento).
      const authUrl = Deno.env.get("SELFHOSTED_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? "";
      const authKey = Deno.env.get("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const authAdmin = createClient(authUrl, authKey, {
        db: { schema: "auth" },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: target, error: targetError } = await authAdmin
        .from("sessions")
        .select("user_id")
        .eq("id", sessionId)
        .maybeSingle();

      if (targetError || !target) {
        log.warn("Admin revoke: session owner not resolvable (auth schema exposure?)", {
          error: targetError?.message ?? "no row",
          sessionId,
        });
        return errorResponse("Session not found", 404, req);
      }

      const { data: revokedByAdmin, error: revokeAdminError } = await callerClient.rpc(
        "sessions_revoke",
        {
          p_target_user_id: target.user_id,
          p_session_ids: [sessionId],
          p_admin: true,
        },
      );
      if (revokeAdminError) {
        log.error("sessions_revoke (admin) failed", { error: revokeAdminError.message });
        return errorResponse("Failed to revoke session", 500, req);
      }
      if (!revokedByAdmin || revokedByAdmin === 0) {
        return errorResponse("Session not found or already revoked", 404, req);
      }

      log.done(200, { sessionId, revokedBy: "admin", targetUserId: target.user_id });
      return jsonResponse({ success: true, revoked: revokedByAdmin }, 200, req);
    }

    // Dono revogando a própria sessão (idempotente: já revogada → 0 → 404).
    const { data: revoked, error: revokeError } = await callerClient.rpc(
      "sessions_revoke",
      {
        p_target_user_id: callerId,
        p_session_ids: [sessionId],
        p_admin: false,
      },
    );
    if (revokeError) {
      log.error("sessions_revoke failed", { error: revokeError.message });
      return errorResponse("Failed to revoke session", 500, req);
    }
    if (!revoked || revoked === 0) {
      return errorResponse("Session not found or already revoked", 404, req);
    }

    log.done(200, { sessionId, revokedBy: "owner" });
    return jsonResponse({ success: true, revoked }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal server error", 500, req);
  }
});
