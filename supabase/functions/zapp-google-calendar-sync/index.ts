import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { handleCors, jsonResponse } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";

/**
 * zapp-google-calendar-sync — status da integração Google Calendar (G1).
 *
 * ADR 2026-08-18 (ver ADR.md neste diretório): o chamador de front foi
 * REMOVIDO — não existem credenciais de Google Calendar no ambiente
 * (.env.required só tem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET para OAuth do
 * Gmail; zapp.google_calendar_config vazia no DB vivo; sem service account,
 * sem API key). Esta edge permanece como endpoint de status honesto
 * (SEMPRE 200 — ausência de configuração não é erro de servidor) e NUNCA
 * reporta 'not_implemented':
 *
 *   sem linha de config              → { synced: false, reason: 'not_configured' }
 *   config com enabled=false         → { synced: false, reason: 'disabled' }
 *   enabled=true sem credentials_json → { synced: false, reason: 'not_configured',
 *                                        message: 'credenciais ausentes (credentials_json)' }
 *   falha interna                    → { synced: false, reason: 'error', message? }
 *
 * Re-ativação: documentada em ADR.md (credenciais + pipeline de sync real +
 * reexposição na UI). Autenticação: admin/supervisor (a config é sensível).
 */

function statusBody(reason: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { synced: false, reason, checked_at: new Date().toISOString(), ...extra };
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Autenticação: 401/403 fluem como resposta normal (não são 500).
  let authed: Awaited<ReturnType<typeof requireAdminOrSupervisor>>;
  try {
    authed = await requireAdminOrSupervisor(req);
  } catch (err: unknown) {
    console.error("[zapp-google-calendar-sync] auth error:", err instanceof Error ? err.message : String(err));
    return jsonResponse(statusBody("error", { message: "Falha ao autenticar" }), 200, req);
  }
  if (authed instanceof Response) return authed;

  try {
    const admin = createZappAdminClient();
    const { data, error } = await admin
      .from("google_calendar_config")
      .select("enabled, calendar_id, credentials_json")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[zapp-google-calendar-sync] config query error:", error.message);
      return jsonResponse(statusBody("error", { message: "Falha ao ler configuração" }), 200, req);
    }

    if (!data) {
      // Estado real atual: sem config → integração desligada por padrão.
      return jsonResponse(statusBody("not_configured"), 200, req);
    }
    if (!data.enabled) {
      return jsonResponse(statusBody("disabled"), 200, req);
    }
    if (!data.credentials_json) {
      // enabled sem credencial = configuração incompleta, não "a implementar".
      // Sem service account/credenciais não há sync possível (ADR 2026-08-18).
      return jsonResponse(
        statusBody("not_configured", { message: "credenciais ausentes (credentials_json)" }),
        200,
        req,
      );
    }
    // Credenciais presentes mas pipeline de sync não implantado — ver ADR.md.
    // Estado inalcançável hoje: a config exige escrita service_role e não há
    // credenciais reais no ambiente.
    return jsonResponse(
      statusBody("error", { message: "pipeline de sync indisponível — ver ADR.md no diretório da edge" }),
      200,
      req,
    );
  } catch (err: unknown) {
    console.error("[zapp-google-calendar-sync] unexpected error:", err instanceof Error ? err.message : String(err));
    return jsonResponse(statusBody("error", { message: "Erro interno" }), 200, req);
  }
});
