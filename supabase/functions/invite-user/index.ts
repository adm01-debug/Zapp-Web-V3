/**
 * Edge Function: Invite User (convite por email) — Etapa 57 do plano 100 etapas.
 *
 * Fluxo (admin-only):
 *   1. Rate limit 5/min por IP ANTES da auth (mesmo padrão do create-user).
 *   2. requireAdminOrSupervisor → 401 sem JWT / 403 não-admin.
 *   3. Gate de contrato invite-user@v1 (zod estrito: email, role, message).
 *   4. Cria o usuário via Admin API (SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY) com
 *      email_confirm=false e SEM senha — o usuário só consegue logar após
 *      aceitar o convite.
 *   5. Atribui o papel (user_roles upsert — UPDATE alone no-ops na race do
 *      trigger pós-createUser).
 *   6. Gera o link de convite real do GoTrue (generateLink type=invite) e
 *      persiste o convite via RPC `invite_user` (token com TTL — Etapa 57.3;
 *      migration de banco pendente: PGRST202 degrada com warning, o fluxo
 *      principal segue funcionando via token do próprio GoTrue).
 *   7. Envia o email de convite REAL via _shared/resend.ts (template
 *      transacional com CTA). Falha de email → rollback do usuário + 502
 *      explícito (nunca silencioso — contrato do resend.ts).
 *
 * Erros tratados (nunca 500):
 *   - Email já registrado            → 409 "Email already registered"
 *   - Criação falhou                 → 400 "User creation failed"
 *   - Convite duplicado no backend   → 409 (RPC invite_user)
 *   - Rate limit                     → 429
 *   - Contrato inválido              → 422 (envelope canônico parseOrReject)
 *
 * Rollback: qualquer falha após createUser remove o usuário recém-criado
 * (deleteUser) para não deixar conta órfã sem email de convite.
 */
import {
  handleCors,
  errorResponse,
  jsonResponse,
  Logger,
  checkRateLimit,
  getClientIP,
  getCorsHeaders,
} from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import {
  sendTransactionalEmail,
  renderTransactionalEmailHtml,
  escapeHtml,
} from "../_shared/resend.ts";

/** TTL do convite (espelha o TTL padrão de invites do GoTrue self-hosted). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

/** Remove o usuário recém-criado em caso de falha (rollback). */
async function rollbackCreatedUser(
  admin: ReturnType<typeof createZappAdminClient>,
  userId: string,
): Promise<void> {
  try {
    await admin.auth.admin.deleteUser(userId);
  } catch {
    // Rollback best-effort: log já emitido pelo chamador.
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("invite-user");

  try {
    // Rate limit ANTES da auth (oracle do repo: anônimo nunca vê 422/403).
    const ip = getClientIP(req);
    const rl = checkRateLimit(`invite-user:${ip}`, 5, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;
    const invitedBy = authed.user.id;

    // Contrato invite-user@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('invite-user', CONTRACT_SCHEMAS['invite-user'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as {
      email: string;
      role?: string;
      message?: string;
    };
    const email = body.email.trim().toLowerCase();
    const role = body.role ?? "agent";
    const message = body.message?.trim() || undefined;

    const adminClient = createZappAdminClient();

    // 1. Cria o usuário via Admin API (sem senha, email não confirmado → o
    //    aceite do convite completa a ativação).
    const { data: newUser, error: createError } = await adminClient.auth.admin
      .createUser({
        email,
        email_confirm: false,
        user_metadata: { invited_by: invitedBy },
      });

    if (createError) {
      log.error("User creation failed", { error: createError.message, email });
      const userFacingMsg = createError.message.toLowerCase().includes("already registered")
        ? "Email already registered"
        : "User creation failed";
      // 409 para convite duplicado (erro tratado — nunca 500).
      return errorResponse(userFacingMsg, createError.message.toLowerCase().includes("already registered") ? 409 : 400, req);
    }

    if (!newUser.user) {
      return errorResponse("User creation failed", 500, req);
    }
    const userId = newUser.user.id;

    // 2. Atribui o papel (upsert — UPDATE alone no-ops quando a row não existe).
    const { error: roleError } = await adminClient
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id" });

    if (roleError) {
      log.error("Role assignment failed", { error: roleError.message, userId });
      await rollbackCreatedUser(adminClient, userId);
      return errorResponse("User created but role assignment failed — user rolled back", 500, req);
    }

    // 3. Link de convite REAL do GoTrue (token com TTL próprio do provider).
    const appUrl = Deno.env.get("APP_URL") ||
      Deno.env.get("SELFHOSTED_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "";
    const { data: inviteData, error: inviteLinkError } = await adminClient.auth.admin
      .generateLink({
        type: "invite",
        email,
        options: { redirectTo: `${appUrl}/accept-invite` },
      });

    if (inviteLinkError || !inviteData?.properties?.action_link) {
      log.error("Invite link generation failed", {
        error: inviteLinkError?.message ?? "no action_link",
        userId,
      });
      await rollbackCreatedUser(adminClient, userId);
      return errorResponse("Failed to generate invite link", 500, req);
    }

    const actionLink = inviteData.properties.action_link;
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    // 4. Persiste o convite (auditoria/reenvio/validação do token na página de
    //    aceite) via RPC `invite_user` — Etapa 57.3/57.4 (nível banco).
    //    Contrato da RPC (quando aplicada): zapp.invite_user(p_email, p_role,
    //    p_token, p_expires_at, p_invited_by, p_message) → id do convite.
    //    PGRST202 (RPC ausente — migration pendente) DEGRADA com warning: o
    //    fluxo principal (usuário + link + email) segue funcionando.
    let inviteId: string | null = null;
    const { data: rpcInviteId, error: inviteRpcError } = await adminClient.rpc(
      "invite_user",
      {
        p_email: email,
        p_role: role,
        p_token: inviteData.properties.hashed_token ?? null,
        p_expires_at: expiresAt,
        p_invited_by: invitedBy,
        p_message: message ?? null,
      },
    );

    if (inviteRpcError) {
      const rpcMissing = inviteRpcError.code === "PGRST202" ||
        /could not find the function/i.test(inviteRpcError.message ?? "");
      if (rpcMissing) {
        log.warn("invite_user RPC not deployed yet (Etapa 57.4 pendente) — invite persisted only via GoTrue token", {
          email,
          userId,
        });
      } else {
        // Convite reutilizado/duplicado no backend → erro tratado (não 500).
        const dup = /already|existe|duplicate|23505/i.test(inviteRpcError.message ?? "");
        log.error("invite_user RPC failed", { error: inviteRpcError.message, email });
        await rollbackCreatedUser(adminClient, userId);
        return errorResponse(
          dup ? "Invite already exists for this email" : "Failed to store invite",
          dup ? 409 : 500,
          req,
        );
      }
    } else if (typeof rpcInviteId === "string" && rpcInviteId.length > 0) {
      inviteId = rpcInviteId;
    }

    // 5. Email de convite REAL via Resend (template transacional com CTA).
    const mail = await sendTransactionalEmail(
      email,
      "Convite para o ZAPP Web",
      renderTransactionalEmailHtml({
        title: "Convite para o ZAPP Web",
        bodyHtml: [
          `<p>Olá!</p>`,
          `<p>Você foi convidado(a) para a equipe do <strong>ZAPP Web</strong> com o papel de <strong>${escapeHtml(role)}</strong>.</p>`,
          `<p>Clique no botão abaixo para aceitar o convite e definir sua senha. O link é válido por <strong>7 dias</strong>.</p>`,
          message ? `<p style="margin-top:16px;padding:12px;background:#f4f4f5;border-radius:8px;color:#3f3f46;">“${escapeHtml(message)}”</p>` : "",
        ].join("\n"),
        ctaUrl: actionLink,
        ctaText: "Aceitar convite",
        footerText: "Se você não esperava este convite, ignore esta mensagem com segurança.",
      }),
    );

    if (!mail.ok) {
      // Falha explícita (nunca silenciosa): rollback do usuário para o
      // convite poder ser refeito limpo (retry não cai em "already registered").
      log.error("Invite email failed to send", { error: mail.error, email, userId });
      await rollbackCreatedUser(adminClient, userId);
      return errorResponse("Invite created but email failed to send", 502, req);
    }

    log.done(200, { userId, email, role, messageId: mail.messageId });
    return jsonResponse({ success: true, invite_id: inviteId ?? userId }, 200, req);
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal server error", 500, req);
  }
});
