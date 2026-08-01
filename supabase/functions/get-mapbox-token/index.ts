import { handleCors, errorResponse, jsonResponse, requireEnv, Logger } from "../_shared/validation.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("get-mapbox-token");

  try {
    const mapboxToken = requireEnv('MAPBOX_PUBLIC_TOKEN');
    log.done(200);
    return jsonResponse({ token: mapboxToken }, 200, req);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Internal server error';
    log.error("Unhandled error", { error: msg });
    return errorResponse(msg, 500, req);
  }
});
