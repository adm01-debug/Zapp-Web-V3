import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { handleCors, jsonResponse } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";

/**
 * zapp-google-calendar-sync — contrato Google Calendar REAL desligado (G1).
 *
 * A integração ainda não possui OAuth/sync com a Google Calendar API. Este
 * endpoint materializa o contrato de forma HONESTA: consulta a configuração
 * (zapp.google_calendar_config) e responde SEMPRE com 200:
 *
 *   sem linha de config        → { synced: false, reason: 'not_configured' }
 *   config com enabled=false   → { synced: false, reason: 'disabled' }
 *   config com enabled=true    → { synced: false, reason: 'not_implemented' }
 *   falha interna              → { synced: false, reason: 'error', message? }
 *
 * NUNCA responde 500 — ausência de configuração não é erro de servidor e o
 * frontend não deve tratar rede/estado como exceção. Autenticação:
 * admin/supervisor (a config é sensível). Body opcional aceito:
 * { dryRun?: boolean } (registrado no contrato, ainda sem efeito).
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
      .select("enabled, calendar_id")
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
    // Config habilitada mas sync real ainda não implementado — contrato honesto.
    return jsonResponse(statusBody("not_implemented"), 200, req);
  } catch (err: unknown) {
    console.error("[zapp-google-calendar-sync] unexpected error:", err instanceof Error ? err.message : String(err));
    return jsonResponse(statusBody("error", { message: "Erro interno" }), 200, req);
  }
});
