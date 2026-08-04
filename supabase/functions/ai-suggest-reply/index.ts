/**
 * STEP 4B Migration: ai-suggest-reply now forwards to unified ai-router
 */

import { handleCors, errorResponse, getCorsHeaders } from "../_shared/validation.ts";
import { parseRequestOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, req);

    // Contrato ai-suggest-reply@v1 (estrito) — valida o payload da ação
    // suggest_reply antes de encaminhar ao ai-router (mesmo schema do handler).
    const parsed = await parseRequestOrReject('ai-suggest-reply', CONTRACT_SCHEMAS['ai-suggest-reply'], req, {
      extraHeaders: getCorsHeaders(req),
    });
    if (!parsed.ok) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorResponse("AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "suggest_reply" }),
      signal: AbortSignal.timeout(60_000),
    });

    const responseBody = await res.json().catch(() => ({ error: `Upstream HTTP ${res.status}` }));
    return new Response(JSON.stringify(responseBody), {
      status: res.status,
      headers: { ...getCorsHeaders(req), "content-type": "application/json" },
    });
  } catch (err) {
    return errorResponse(`Proxy error: ${err instanceof Error ? err.message : String(err)}`, 502, req);
  }
});
