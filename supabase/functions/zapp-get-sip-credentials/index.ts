import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

/**
 * zapp-get-sip-credentials@v1 — credenciais SIP por perfil (VoIP).
 *
 * Substitui get-sip-password (senha única compartilhada via env SIP_PASSWORD):
 *   1. Requer JWT de usuário + profile ativo (requireUser).
 *   2. Busca a linha do dono em zapp.voip_profile_credentials (profile_id).
 *      Se existir e is_active → devolve { legacy: false, user, password, server?, wsPort? }.
 *   3. Fallback LEGADO: sem linha ativa → devolve a senha compartilhada
 *      (env SIP_PASSWORD) com `legacy: true` — o frontend mantém server/user
 *      do localStorage nesse modo (comportamento atual do get-sip-password).
 *
 * Resposta: { profileId, legacy, password, user?, server?, wsPort? }.
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("zapp-get-sip-credentials");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`sip-creds:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Server-side JWT verification via Supabase Auth API (mesmo padrão get-sip-password)
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    // Contrato zapp-get-sip-credentials@v1 — GET sem body → {} aceito.
    const parsed = parseOrReject('zapp-get-sip-credentials', CONTRACT_SCHEMAS['zapp-get-sip-credentials'], req, await req.json().catch(() => ({})), {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;

    const adminClient = createZappAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('id, is_active').eq('user_id', authed.user.id).maybeSingle();

    if (profileError || !profile) return errorResponse('User profile not found', 403, req);
    if (!profile.is_active) return errorResponse('User account is inactive', 403, req);

    // 1) Credencial por perfil (zapp.voip_profile_credentials) — dono.
    const { data: creds, error: credsError } = await adminClient
      .from('voip_profile_credentials')
      .select('sip_user, sip_password, sip_server, ws_port, is_active')
      .eq('profile_id', profile.id)
      .maybeSingle();

    if (!credsError && creds?.is_active && creds.sip_user && creds.sip_password) {
      log.done(200);
      return jsonResponse({
        profileId: profile.id,
        legacy: false,
        user: creds.sip_user,
        password: creds.sip_password,
        server: creds.sip_server ?? undefined,
        wsPort: creds.ws_port,
      }, 200, req);
    }

    // 2) Fallback legado: senha compartilhada (flag legacy: true).
    const password = requireEnv('SIP_PASSWORD');
    log.done(200);
    return jsonResponse({ profileId: profile.id, legacy: true, password }, 200, req);
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
