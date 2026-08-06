import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";
import { requireUser } from "../_shared/auth.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-mapbox-token");

  try {
    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;

    // Contrato get-mapbox-token@v1 (G4): GET sem body → {} aceito.
    const parsed = parseOrReject('get-mapbox-token', CONTRACT_SCHEMAS['get-mapbox-token'], req, await req.json().catch(() => ({})), {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;

    const mapboxToken = requireEnv('MAPBOX_PUBLIC_TOKEN');
    log.done(200);
    return jsonResponse({ token: mapboxToken }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    log.error("Unhandled error", { error: msg });
    return errorResponse('Internal server error', 500, req);
  }
});
