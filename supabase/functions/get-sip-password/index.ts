import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-sip-password");

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(`sip-pwd:${ip}`, 10, 60_000);
    if (!rl.allowed) return errorResponse("Rate limit exceeded", 429, req);

    // Server-side JWT verification via Supabase Auth API (replaces getClaims local decode)
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    const adminClient = createZappAdminClient();
    const { data: profile, error: profileError } = await adminClient
      .from('profiles').select('id, is_active').eq('user_id', authed.user.id).maybeSingle();

    if (profileError || !profile) return errorResponse('User profile not found', 403, req);
    if (!profile.is_active) return errorResponse('User account is inactive', 403, req);

    const password = requireEnv('SIP_PASSWORD');
    log.done(200);
    return jsonResponse({ password, profileId: profile.id }, 200, req);
  } catch (error) {
    log.error("Unhandled error", { error: error instanceof Error ? error.message : String(error) });
    return errorResponse('Internal server error', 500, req);
  }
});
