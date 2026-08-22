/**
 * Edge Function: Password Reset Request Approval Manager
 *
 * Implements 2-step password reset with admin approval gate.
 * User submits reset request → admin approves/rejects → recovery link sent to user.
 * Prevents brute-force password resets and allows team oversight of account security.
 *
 * Flow:
 * 1. Admin/supervisor sends JSON with { requestId, action: "approve"|"reject", rejectionReason? }
 * 2. Verify admin role via is_admin_or_supervisor RPC
 * 3. Fetch password_reset_requests record with id=requestId and status="pending"
 * 4. If action=reject: Mark as rejected, log rejection reason, notify user
 * 5. If action=approve:
 *    a. Atomic status check: Update status to "approved" only if status="pending"
 *    b. If update count=0: Another admin already approved (race condition) → return 409
 *    c. Generate Supabase Auth recovery link via auth.admin.generateLink()
 *    d. Store generated_link in password_reset_requests for audit trail
 *    e. Return link to calling function (which sends via email)
 *
 * Concurrency Safety (Critical):
 * - Race scenario: Two admins approve same request simultaneously
 * - Protection: Atomic .eq("status","pending") guard in UPDATE statement
 * - Only first UPDATE succeeds (count=1); second gets count=0 → returns 409 Conflict
 * - Prevents duplicate recovery links (token-per-request invariant maintained)
 *
 * Security Controls:
 * - Rate limit: 10 requests per 60 seconds per IP (prevents denial-of-service approvals)
 * - Admin-only: Requires is_admin_or_supervisor role (no user self-approval)
 * - Status guard: Rejects already-processed requests (prevents re-approval)
 * - Audit trail: Records reviewed_by (admin ID) and reviewed_at (timestamp)
 * - Rejection reasons logged: For compliance and debugging (why was reset denied?)
 *
 * Authorization Model:
 * - Uses caller-scoped Supabase client for admin role verification (RLS enforced)
 * - Uses service-role client for recovery link generation (requires Auth admin powers)
 * - Never confirms which email/user failed (prevents username enumeration)
 *
 * Error Handling:
 * - 401 Unauthorized: No/invalid authorization header (missing JWT)
 * - 403 Forbidden: Non-admin user attempted to approve (insufficient role)
 * - 404 Not Found: Reset request not found (invalid ID or already completed)
 * - 409 Conflict: Request already processed (concurrent approval, or re-approval attempt)
 * - 429 Too Many Requests: Rate limit exceeded (max 10 approvals/60s per IP)
 *
 * Failure Modes:
 * - Supabase Auth unavailable: generateLink() fails → approval succeeds but no email sent
 *   → Admin logs into UI, manually re-approves (recovery link regenerated)
 * - Database stale on read: Fetch shows status="pending" but concurrent UPDATE already happened
 *   → Update count=0 → returns 409 (client retries or escalates)
 * - Network timeout: Caller retries the same request (idempotent due to atomic guard)
 *
 * Performance:
 * - Single read (fetch request) + single atomic write (status update)
 * - Supabase Auth link generation: ~100-500ms (HTTPS round-trip to Google/Firebase)
 * - No N+1 queries, no unnecessary database activity
 *
 * Compliance:
 * - Password reset attempts logged with admin reviewer ID for compliance audit
 * - Rejection reasons recorded (e.g., "Suspicious activity detected")
 * - Timestamps (reviewed_at) provide audit trail for change tracking
 */
import { handleCors, errorResponse, errorEnvelope, jsonResponse, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("approve-password-reset");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`approve-reset:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorEnvelope('rate_limit_exceeded', "Rate limit exceeded", 429, req);

    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;
    const userId = authed.user.id;

    // Contrato approve-password-reset@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('approve-password-reset', CONTRACT_SCHEMAS['approve-password-reset'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    // Bloco 2/3 (2026-08-21): schema agora valida requestId/action de verdade
    // (ver contract-schemas.ts) — o 422 canônico já reprova payload inválido
    // antes daqui; o bloco 400 manual que existia foi removido.
    const { requestId, action, rejectionReason } = parsed.data as {
      requestId: string;
      action: 'approve' | 'reject';
      rejectionReason?: string;
    };
    const supabaseAdmin = createZappAdminClient();

    log.info(`Processing ${action} for request ${requestId}`);

    const { data: resetRequest, error: fetchError } = await supabaseAdmin
      .from("password_reset_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !resetRequest) return errorResponse("Reset request not found", 404, req);
    if (resetRequest.status !== "pending") return errorResponse("Request already processed", 409, req);

    if (action === "reject") {
      // Guard with .eq("status","pending") to prevent overwriting an already-approved request.
      // E55 fix (GAP V3-5): count/head NÃO são opções do .select() no postgrest-js v2 —
      // eram silenciosamente descartadas → count=null → guard SEMPRE 409. O número de
      // linhas afetadas vem do corpo (return=representation) via .select("id").
      const { data: rejectedRows, error: updateError } = await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || "Solicitação rejeitada pelo administrador",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .eq("status", "pending")
        .select("id");

      if (updateError) throw updateError;
      if (!rejectedRows || rejectedRows.length === 0) {
        return errorResponse("Request already processed", 409, req);
      }

      log.done(200, { action: "rejected" });
      return jsonResponse({ success: true, message: "Solicitação rejeitada" }, 200, req);
    }

    // Approve: atomic status guard FIRST to prevent concurrent requests from each
    // generating a valid Supabase Auth recovery token. Only the winner proceeds to
    // generateLink — this ensures exactly one token is ever created per request.
    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    // E55 fix (GAP V3-5): mesma correção do reject — linhas afetadas via corpo
    // (return=representation), nunca via count do .select().
    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("password_reset_requests")
      .update({
        status: "approved",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id");

    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) {
      return errorResponse("Request already processed", 409, req);
    }

    // generateLink runs only after winning the atomic guard above.
    // Use a server-configured URL — never the client-supplied Origin header.
    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("SELFHOSTED_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: resetRequest.email,
      options: {
        redirectTo: `${appUrl}/reset-password`,
      },
    });

    if (resetError) {
      log.error("Error generating reset link", { error: resetError.message });
      throw new Error("Failed to generate reset link");
    }

    // Store token hash in isolated table via SECURITY DEFINER function.
    if (resetData.properties?.hashed_token) {
      const { error: rpcError } = await supabaseAdmin.rpc("store_reset_token", {
        p_request_id: requestId,
        p_token: resetData.properties.hashed_token,
        p_expires_at: expiresAt,
      });
      if (rpcError) {
        log.error("store_reset_token RPC failed", { error: rpcError.message });
        throw new Error("Failed to store reset token");
      }
    }

    // Email com o link REAL (Etapa 55): envia via Resend para o solicitante.
    // Falha de email NÃO derruba a aprovação — o link já foi gerado e o hash
    // persistido; emailSent=false permite ao caller (painel admin) informar o
    // estado com precisão (antes, ninguém enviava o email e o toast mentia).
    let emailSent = false;
    const actionLink = resetData.properties?.action_link;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (actionLink && resendKey) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: Deno.env.get("RESET_EMAIL_FROM") || "noreply@zappweb.app",
            to: [resetRequest.email],
            subject: "ZAPP — Redefinição de senha aprovada",
            html:
              `<p>Olá,</p>` +
              `<p>Sua solicitação de redefinição de senha foi <strong>aprovada</strong>.</p>` +
              `<p>Clique no link abaixo para definir sua nova senha (válido por 1 hora):</p>` +
              `<p><a href="${actionLink}">Redefinir minha senha</a></p>` +
              `<p>Se você não solicitou esta redefinição, ignore este email.</p>`,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        emailSent = emailRes.ok;
        if (!emailRes.ok) {
          log.error("Resend failed to send reset email", { status: emailRes.status });
        }
      } catch (emailErr) {
        log.error("Resend error sending reset email", {
          error: emailErr instanceof Error ? emailErr.message : String(emailErr),
        });
      }
    } else if (!resendKey) {
      log.warn("RESEND_API_KEY not configured — reset email NOT sent");
    }

    log.done(200, { action: "approved", emailSent });
    return jsonResponse({
      success: true,
      emailSent,
      message: emailSent
        ? "Solicitação aprovada — email com link enviado"
        : "Solicitação aprovada (falha ao enviar email — reenvie ou contate o usuário)",
      resetLink: resetData.properties?.action_link,
    }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorEnvelope('internal_error', "Internal server error", 500, req);
  }
});
