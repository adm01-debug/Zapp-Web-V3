/**
 * revoke-session@v1 — revogação de sessão ativa (Etapa 56 — gestão e
 * revogação de sessões). Endpoint INTERNO (frontend autenticado).
 *
 * Contrato (contract-first, supabase/functions/revoke-session/__tests__/contract.test.ts):
 *   - POST { sessionId } — UUID de auth.sessions
 *   - Sem JWT válido                   → 401 (requireUser ANTES do gate)
 *   - Sessão de OUTRO usuário (não-admin) → 403 (ownership check)
 *   - Admin/supervisor revogando de outro → 200 (is_admin_or_supervisor)
 *   - Dono revogando a própria sessão  → 200 { success: true }
 *   - Sessão inexistente/já revogada   → 404 (erro tratado, idempotente)
 *
 * Backend: RPCs SECURITY DEFINER zapp.sessions_owner + zapp.sessions_revoke
 * (migrations 20260817190001/20260817190002, search_path fixo, grants mínimos).
 * A revogação real acontece no SQL (DELETE auth.sessions + revoked=true nos
 * refresh tokens órfãos) — GoTrue self-hosted não expõe admin delete de sessão.
 *
 * Ordem auth→gate é o oráculo do repo (micro-auditoria 2026-08-05): anônimo
 * recebe 401, nunca 422 do contrato.
 */
import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit } from "../_shared/validation.ts";
import { createZappClient } from "../_shared/db-client.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { requireUser } from "../_shared/auth.ts";

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
    // Auth PRIMEIRO: anônimo → 401 (nunca 422 do contrato).
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const rl = checkRateLimit(`revoke-session:${authed.user.id}`, 30, 60_000);
    if (!rl.allowed) {
      return errorResponse('Rate limit exceeded. Tente novamente em instantes.', 429, req);
    }

    log.info("User authenticated", { userId: authed.user.id });

    // Contrato revoke-session@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('revoke-session', CONTRACT_SCHEMAS['revoke-session'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as { sessionId: string };

    // Cliente com JWT do CALLER (auth.uid() dentro das RPCs SECURITY DEFINER
    // resolve para o usuário real — service_role deixaria auth.uid() nulo).
    const supabase = createZappClient(req);

    // 1. Resolve o dono da sessão (RPC SECURITY DEFINER — PostgREST direto em
    //    auth.sessions não funciona no self-hosted, ver evolution-credentials).
    const { data: ownerId, error: ownerError } = await supabase.rpc('sessions_owner', {
      p_session_id: body.sessionId,
    });
    if (ownerError) {
      log.error('sessions_owner failed', { error: ownerError, sessionId: body.sessionId });
      return errorResponse('Failed to resolve session', 500, req);
    }

    // 2. Sessão inexistente/já revogada → 404 idempotente.
    if (!ownerId) {
      return errorResponse('Session not found or already revoked', 404, req);
    }

    // 3. Ownership: dono revoga a própria; admin/supervisor revoga de outros.
    let isAdmin = false;
    if (ownerId !== authed.user.id) {
      const { data: isPriv, error: privError } = await supabase.rpc('is_admin_or_supervisor', {
        _user_id: authed.user.id,
      });
      if (privError) {
        log.error('is_admin_or_supervisor failed', { error: privError });
        return errorResponse('Authorization check failed', 500, req);
      }
      if (!isPriv) {
        return errorResponse('Forbidden: you can only revoke your own sessions', 403, req);
      }
      isAdmin = true;
    }

    // 4. Revogação real (auth.sessions + refresh tokens órfãos).
    const { data: revoked, error: revokeError } = await supabase.rpc('sessions_revoke', {
      p_target_user_id: ownerId,
      p_session_ids: [body.sessionId],
      p_admin: isAdmin,
    });
    if (revokeError) {
      // Defesa em profundidade: RPC nega com 42501 → traduz para 403.
      if ((revokeError as { code?: string }).code === '42501') {
        return errorResponse('Forbidden: you can only revoke your own sessions', 403, req);
      }
      log.error('sessions_revoke failed', { error: revokeError, sessionId: body.sessionId });
      return errorResponse('Failed to revoke session', 500, req);
    }

    // 5. Idempotência: 0 linhas entre o lookup e o revoke (corrida) → 404.
    if ((revoked ?? 0) === 0) {
      return errorResponse('Session not found or already revoked', 404, req);
    }

    log.info('Session revoked', { sessionId: body.sessionId, targetUserId: ownerId, admin: isAdmin });
    return jsonResponse({ success: true, revoked }, 200, req);
  } catch (error) {
    log.error('Unhandled error', { error: String(error) });
    return errorResponse('Internal server error', 500, req);
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
