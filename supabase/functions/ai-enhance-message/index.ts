/**
 * STEP 4B Migration: ai-enhance-message now forwards to unified ai-router
 */

import { handleCors, errorResponse, errorEnvelope, getCorsHeaders } from "../_shared/validation.ts";
import { parseRequestOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return errorEnvelope("unauthorized", "Unauthorized", 401, req);

    // Contrato ai-enhance-message@v1 (estrito) — payload da ação
    // enhance_message validado antes de encaminhar ao ai-router.
    const parsed = await parseRequestOrReject('ai-enhance-message', CONTRACT_SCHEMAS['ai-enhance-message'], req, {
      extraHeaders: getCorsHeaders(req),
    });
    if (parsed.ok === false) return parsed.response;
    const body = parsed.data as Record<string, unknown>;

    const aiRouterUrl = Deno.env.get("AI_ROUTER_URL");
    if (!aiRouterUrl) return errorEnvelope("ai_router_not_configured", "AI_ROUTER_URL not configured", 503, req);
    const res = await fetch(aiRouterUrl, {
      method: "POST",
      headers: {
        "authorization": authHeader,
        "content-type": "application/json",
        ...Object.fromEntries([...req.headers.entries()].filter(([k]) => k.toLowerCase().startsWith("x-") || k.toLowerCase() === "idempotency-key")),
      },
      body: JSON.stringify({ ...body, action: "enhance_message" }),
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
