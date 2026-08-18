/**
 * Edge Function: Password Reset Request (public)
 *
 * Etapa 55 — Reset de senha ponta a ponta (solicitação→aprovação→redefinição).
 * Ponto de entrada PÚBLICO do fluxo (página /forgot-password, sessão anônima).
 *
 * Por que uma EF e não insert direto do cliente:
 *   - RLS de zapp.password_reset_requests NÃO permite insert anônimo
 *     (policy prr_insert_own é authenticated-only com user_id = auth.uid()) —
 *     o insert client-side atual falha silenciosamente em produção.
 *   - zapp.profiles também não é legível por anon (auth_secure_135) — o lookup
 *     de existência precisa de service role.
 *   - Rate limit por IP (anti-spam de solicitações) e gate zod (422) só
 *     existem server-side.
 *
 * Fluxo:
 *   1. Rate limit por IP (5/60s) — ANTES de qualquer lookup (anti-abuso).
 *   2. Gate zod via parseOrReject (422 envelope canônico) — email obrigatório
 *      e válido; reason/userAgent/ipAddress opcionais com tamanho limitado.
 *   3. Lookup do usuário por email via service role (profiles.user_id).
 *   4. Email inexistente → resposta GENÉRICA { success: true } (anti-enumeração:
 *      nunca confirma existência de conta).
 *   5. Email existente → INSERT pendente em password_reset_requests e a MESMA
 *      resposta genérica { success: true } (payload idêntico nos dois caminhos).
 *
 * Erros:
 *   - 429 Rate limit exceeded (anti-spam).
 *   - 422 invalid_json / zod (gate canônico do repositório).
 *   - 500 Internal server error (genérico — nunca detalha o motivo).
 *
 * Segurança:
 *   - Sem requireUser/requireAdminOrSupervisor — endpoint deliberadamente público.
 *   - service role apenas para lookup/insert internos; nada do payload do
 *     solicitante é refletido na resposta.
 *   - status sempre "pending" — a aprovação (admin) é a única porta para o link.
 */
import { handleCors, errorResponse, jsonResponse, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("request-password-reset");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`reset-request:${ip}`, 5, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Contrato request-password-reset@v1 — validação unificada 422 (parseOrReject).
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('request-password-reset', CONTRACT_SCHEMAS['request-password-reset'], req, raw, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as { email: string; reason?: string; userAgent?: string; ipAddress?: string };

    const email = body.email.toLowerCase().trim();
    const supabaseAdmin = createZappAdminClient();

    // Resposta GENÉRICA — a MESMA para email existente e inexistente.
    const genericSuccess = jsonResponse({ success: true }, 200, req);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    if (!profile?.user_id) {
      // Anti-enumeração: sem confirmação de existência, sem log de qual email.
      log.info("No profile found — generic response");
      return genericSuccess;
    }

    const { error: insertError } = await supabaseAdmin
      .from("password_reset_requests")
      .insert({
        user_id: profile.user_id,
        email,
        reason: body.reason || null,
        ip_address: body.ipAddress || ip,
        user_agent: body.userAgent || null,
        status: "pending",
      });

    if (insertError) throw insertError;

    log.done(200, { created: true });
    return genericSuccess;
  } catch (error: unknown) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse("Internal server error", 500, req);
  }
});
